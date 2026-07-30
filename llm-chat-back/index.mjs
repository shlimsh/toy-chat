import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import tracer from "dd-trace";
import * as datadogApiClient from "@datadog/datadog-api-client";
import logger, {
  requestLogger,
  logChatRequest,
  logLlmCompleted,
  logLlmFailed,
  logApiError,
  logApiInfo,
  logApiWarn,
  logPersistenceFailed,
} from "./logger.mjs";
import { closeDatabase, initDatabase } from "./db.mjs";
import { authRequired } from "./auth.mjs";
import {
  loadDocuments,
  buildChunkRecords,
  loadEmbeddingCache,
  saveEmbeddingCache,
  rankChunkRecords,
} from "./rag.mjs";
import { buildProviderHistory } from "./conversation-history.mjs";
import {
  classifyServerError,
  getErrorDefinition,
  sendApiError,
  toProviderUserError,
} from "./app-errors.mjs";
import { config, configWarnings } from "./config.mjs";
import {
  corsMiddleware,
  createAvailabilityGate,
  timingMiddleware,
} from "./http-observability.mjs";
import {
  createShutdownController,
  installProcessHandlers,
} from "./lifecycle.mjs";
import { withRequestTimeout } from "./request-timeout.mjs";
import { createRuntimeState } from "./runtime-state.mjs";
import { createAuthRouter } from "./routes/auth-routes.mjs";
import { createConversationRouter } from "./routes/conversation-routes.mjs";
import { createHealthRouter } from "./routes/health-routes.mjs";
import { createMonitoringRouter } from "./routes/monitoring-routes.mjs";
import { createNotificationRouter } from "./routes/notification-routes.mjs";
import {
  createConversation,
  createMessage,
  getConversationByIdForUser,
  getMessagesByConversationId,
} from "./services/conversation-service.mjs";
import {
  markActiveSpanError,
  markSpanError,
  traceOperation,
  traceProviderOperation,
} from "./span-utils.mjs";
import {
  setRequestBodyOnSpan,
  setResponseBodyOnSpan,
} from "./lib/telemetry.mjs";
import {
  requireProviderSuccess,
  selectCompatibilityResponse,
} from "./provider-outcomes.mjs";
import {
  buildProviderRegistry,
  createProviderJobs,
  runProviderJobs,
} from "./provider-registry.mjs";
import { createFixedWindowRateLimiter } from "./rate-limit.mjs";
import { createSmsService } from "./services/sms-service.mjs";

const app = express();
const llmobs = tracer.llmobs;
const runtimeState = createRuntimeState();

const ML_APP = config.mlApp;
const OPENAI_MODEL = config.openaiModel;
const AZURE_OPENAI_MODEL = config.azureModel;
const AZURE_OPENAI_ENDPOINT = config.azureEndpoint;
const EMBEDDING_MODEL = config.embeddingModel;
const RAG_CHUNK_SIZE = config.ragChunkSize;
const RAG_CHUNK_OVERLAP = config.ragChunkOverlap;
const RAG_TOP_K = config.ragTopK;
const RAG_MIN_SCORE = config.ragMinScore;
const RAG_MAX_CHUNKS_PER_DOCUMENT = config.ragMaxChunksPerDocument;
const RAG_EMBEDDING_BATCH_SIZE = config.ragEmbeddingBatchSize;

const openaiClient = config.openaiEnabled
  ? new OpenAI({
      apiKey: config.openaiApiKey,
    })
  : null;

const azureClient =
  config.azureEnabled
    ? {
        apiKey: config.azureApiKey,
        endpoint: AZURE_OPENAI_ENDPOINT,
      }
    : null;

const providerRegistry = buildProviderRegistry({
  config,
  clients: {
    openai: openaiClient,
    azure: azureClient,
  },
});

app.use(corsMiddleware);
app.use(timingMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);
app.use(createAvailabilityGate(runtimeState));

const ddConfig = datadogApiClient.client.createConfiguration({
  authMethods: {
    apiKeyAuth: process.env.DD_API_KEY?.trim(),
    appKeyAuth: process.env.DD_APP_KEY?.trim(),
  },
});

ddConfig.setServerVariables({
  site: config.ddSite,
});

const incidentsApi = new datadogApiClient.v2.IncidentsApi(ddConfig);
const metricsApi = new datadogApiClient.v1.MetricsApi(ddConfig);
const smsService = createSmsService({
  endpoint: config.smsApiUrl,
  timeoutMs: config.smsRequestTimeoutMs,
});
const smsRateLimiter = createFixedWindowRateLimiter({
  windowMs: config.smsRateLimitWindowMs,
  max: config.smsRateLimitMax,
});

function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const SPAN_BODY_OPTIONS = Object.freeze({
  mode: config.spanBodyCaptureMode,
  maxLength: config.spanBodyTagMax,
});

async function persistAssistantMessageSafely({
  conversationId,
  userId,
  requestId,
  provider,
  content,
  metadata,
}) {
  try {
    const message = await createMessage({
      conversationId,
      role: "assistant",
      content,
      metadata,
    });

    return {
      message,
      status: "persisted",
    };
  } catch (error) {
    // 이미 생성된 모델 답변은 사용자에게 반환한다. 저장 실패는 별도의
    // DB span과 Error Tracking 로그로 남겨 후속 조치할 수 있게 한다.
    logPersistenceFailed({
      userId,
      conversationId,
      requestId,
      provider,
      role: "assistant",
      error,
    });

    return {
      message: null,
      status: "failed",
    };
  }
}

app.use((req, res, next) => {
  const span = tracer.scope().active();

  if (span) {
    span.setTag("http.method", req.method);
    span.setTag("http.route.path", req.path);
    setRequestBodyOnSpan(span, req.body, SPAN_BODY_OPTIONS);
  }

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = function patchedJson(body) {
    const currentSpan = tracer.scope().active() || span;
    if (currentSpan) {
      setResponseBodyOnSpan(currentSpan, body, SPAN_BODY_OPTIONS);
      currentSpan.setTag("http.status_code", res.statusCode);
    }
    return originalJson(body);
  };

  res.send = function patchedSend(body) {
    const currentSpan = tracer.scope().active() || span;
    if (currentSpan) {
      const parsed = typeof body === "string" ? safeJsonParse(body, body) : body;
      setResponseBodyOnSpan(currentSpan, parsed, SPAN_BODY_OPTIONS);
      currentSpan.setTag("http.status_code", res.statusCode);
    }
    return originalSend(body);
  };

  next();
});

const embedDocumentBatch = llmobs.wrap(
  { kind: "embedding", name: "embed_document_chunks" },
  async function embedDocumentBatch(chunks) {
    if (!openaiClient) {
      const error = new Error("OpenAI Embedding client is not configured");
      error.code = "RAG_EMBEDDING_PROVIDER_DISABLED";
      throw error;
    }

    const safeChunks = chunks.map((chunk) => ({
      ...chunk,
      text: String(chunk.text ?? ""),
    }));

    const response = await withRequestTimeout(
      "document embedding batch",
      config.llmRequestTimeoutMs,
      (signal) =>
        openaiClient.embeddings.create(
          {
            model: EMBEDDING_MODEL,
            input: safeChunks.map((chunk) => chunk.text),
          },
          { signal }
        )
    );

    const embeddings = [...(response.data || [])]
      .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
      .map((item) => item.embedding || []);

    if (
      embeddings.length !== safeChunks.length ||
      embeddings.some((embedding) => embedding.length === 0)
    ) {
      const error = new Error("Embedding batch response is incomplete");
      error.code = "RAG_EMBEDDING_RESPONSE_INVALID";
      throw error;
    }

    llmobs.annotate(undefined, {
      inputData: JSON.stringify(
        safeChunks.map((chunk) => ({
          chunkId: chunk.id,
          docId: chunk.docId,
        }))
      ),
      outputData: JSON.stringify({
        embeddingCount: embeddings.length,
        embeddingDimensions: embeddings[0]?.length || 0,
      }),
      tags: {
        "embedding.model": EMBEDDING_MODEL,
        "embedding.scope": "document",
        "rag.embedding.batch_size": String(safeChunks.length),
      },
    });

    return embeddings;
  }
);

let VECTOR_STORE = [];
let RAG_INDEX_STATE = {
  status: "initializing",
  mode: "unavailable",
  documentCount: 0,
  chunkCount: 0,
  embeddedChunkCount: 0,
  reusedCount: 0,
  generatedCount: 0,
  errorCode: null,
};

async function initRAG() {
  const docs = await loadDocuments();
  const chunkRecords = buildChunkRecords(
    docs,
    RAG_CHUNK_SIZE,
    RAG_CHUNK_OVERLAP
  );

  const cache = loadEmbeddingCache();

  const cacheModelMismatch =
    cache.embeddingModel && cache.embeddingModel !== EMBEDDING_MODEL;

  if (cacheModelMismatch) {
    logger.info("rag_cache_model_mismatch", {
      old_model: cache.embeddingModel,
      new_model: EMBEDDING_MODEL,
    });
  }

  const nextCache = {
    version: 2,
    embeddingModel: EMBEDDING_MODEL,
    updatedAt: new Date().toISOString(),
    chunks: {},
  };

  VECTOR_STORE = [];

  let reusedCount = 0;
  let generatedCount = 0;
  let embeddingError = null;

  await llmobs.trace(
    {
      kind: "workflow",
      name: "initialize_rag_index",
      mlApp: ML_APP,
    },
    async () => {
      VECTOR_STORE = chunkRecords.map((chunk) => {
        const cached =
          !cacheModelMismatch && cache.chunks ? cache.chunks[chunk.hash] : null;

        const embedding = cached?.embedding?.length
          ? cached.embedding
          : null;
        if (embedding) reusedCount += 1;

        return {
          ...chunk,
          embedding,
        };
      });

      const missingIndexes = VECTOR_STORE.flatMap((item, index) =>
        item.embedding?.length ? [] : [index]
      );

      if (openaiClient) {
        for (
          let offset = 0;
          offset < missingIndexes.length;
          offset += RAG_EMBEDDING_BATCH_SIZE
        ) {
          const batchIndexes = missingIndexes.slice(
            offset,
            offset + RAG_EMBEDDING_BATCH_SIZE
          );
          const batch = batchIndexes.map((index) => VECTOR_STORE[index]);

          try {
            const embeddings = await embedDocumentBatch(batch);
            embeddings.forEach((embedding, index) => {
              VECTOR_STORE[batchIndexes[index]].embedding = embedding;
            });
            generatedCount += embeddings.length;
          } catch (error) {
            embeddingError = error;
            logLlmFailed({
              provider: "OpenAI Embeddings",
              model: EMBEDDING_MODEL,
              stage: "initialize_rag_index",
              error,
            });
            break;
          }
        }
      }

      for (const item of VECTOR_STORE) {
        if (item.embedding?.length) {
          nextCache.chunks[item.hash] = item;
        }
      }

      const embeddedChunkCount = VECTOR_STORE.filter(
        (item) => item.embedding?.length
      ).length;
      const mode =
        !openaiClient
          ? "keyword"
          : embeddedChunkCount === VECTOR_STORE.length && VECTOR_STORE.length > 0
          ? "hybrid"
          : embeddedChunkCount > 0
          ? "hybrid_partial"
          : "keyword";

      llmobs.annotate(undefined, {
        inputData: JSON.stringify({
          documentCount: docs.length,
          chunkCount: chunkRecords.length,
        }),
        outputData: JSON.stringify({
          vectorStoreCount: VECTOR_STORE.length,
          reusedCount,
          generatedCount,
          embeddingModel: EMBEDDING_MODEL,
          embeddedChunkCount,
          mode,
          degraded: Boolean(embeddingError || !openaiClient),
        }),
        tags: {
          "rag.status": embeddingError || !openaiClient ? "degraded" : "ready",
          "rag.mode": mode,
          "rag.cache.reused_count": String(reusedCount),
          "rag.embedding.generated_count": String(generatedCount),
          "rag.embedding.chunk_count": String(embeddedChunkCount),
        },
      });
    }
  );

  saveEmbeddingCache(nextCache);

  const embeddedChunkCount = VECTOR_STORE.filter(
    (item) => item.embedding?.length
  ).length;
  const mode =
    !openaiClient
      ? "keyword"
      : embeddedChunkCount === VECTOR_STORE.length && VECTOR_STORE.length > 0
      ? "hybrid"
      : embeddedChunkCount > 0
      ? "hybrid_partial"
      : "keyword";
  const status =
    docs.length > 0 && !embeddingError && openaiClient ? "ready" : "degraded";

  RAG_INDEX_STATE = {
    status,
    mode,
    documentCount: docs.length,
    chunkCount: VECTOR_STORE.length,
    embeddedChunkCount,
    reusedCount,
    generatedCount,
    errorCode:
      embeddingError?.code ||
      (!openaiClient ? "RAG_EMBEDDING_PROVIDER_DISABLED" : null),
  };

  logger.info("rag_initialized", {
    rag_status: status,
    rag_mode: mode,
    chunk_count: VECTOR_STORE.length,
    document_count: docs.length,
    embedded_chunk_count: embeddedChunkCount,
    reused_embedding_count: reusedCount,
    generated_embedding_count: generatedCount,
    embedding_model: EMBEDDING_MODEL,
    error_code: RAG_INDEX_STATE.errorCode,
  });

  console.log(
    `RAG initialized with ${VECTOR_STORE.length} chunks (mode=${mode}, reused=${reusedCount}, generated=${generatedCount})`
  );

  return RAG_INDEX_STATE;
}

function buildRagTrace({
  retrievedChunks = [],
  retrievalStrategy = "skipped",
  degradedReason = null,
} = {}) {
  return {
    status: RAG_INDEX_STATE.status,
    mode: RAG_INDEX_STATE.mode,
    retrievalStrategy,
    degradedReason,
    resultCount: retrievedChunks.length,
    sources: retrievedChunks.map((chunk) => ({
      document: chunk.docId,
      title: chunk.title,
      section: chunk.section,
      source: chunk.sources?.[0] || null,
      score: Number(chunk.score.toFixed(6)),
    })),
  };
}

function shouldUseTimeTool(message) {
  return /현재 시간|지금 시간|몇 시|시각|time/i.test(String(message));
}

function shouldUseDocs(message) {
  return String(message ?? "").trim().length > 0;
}

const classifyUserIntent = llmobs.wrap(
  { kind: "task", name: "classify_user_intent" },
  function classifyUserIntent(message) {
    const safeMessage = String(message ?? "");

    const result = {
      needTimeTool: shouldUseTimeTool(safeMessage),
      needDocs: shouldUseDocs(safeMessage),
    };

    llmobs.annotate(undefined, {
      inputData: safeMessage,
      outputData: JSON.stringify(result),
    });

    return result;
  }
);

const getCurrentTimeTool = llmobs.wrap(
  { kind: "tool", name: "get_current_time" },
  function getCurrentTimeTool() {
    const result = {
      timezone: "Asia/Seoul",
      localTime: new Date().toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
      }),
      epochMs: Date.now(),
    };

    llmobs.annotate(undefined, {
      inputData: "current local server time",
      outputData: JSON.stringify(result),
    });

    return result;
  }
);

const queryDatadogTool = llmobs.wrap(
  { kind: "tool", name: "query_datadog" },
  async function queryDatadogTool(queryText) {
    try {
      const q = String(queryText || "").toLowerCase();

      if (q.includes("cpu") || q.includes("씨피유") || q.includes("서버")) {
        const nowSec = Math.floor(Date.now() / 1000);
        const fromSec = nowSec - 5 * 60;

        const result = await metricsApi.queryMetrics({
          from: fromSec,
          to: nowSec,
          query: "top(avg:system.cpu.user{*} by {host}, 10, 'mean', 'desc')",
        });

        const series = result.series || [];

        return {
          source: "datadog",
          type: "metrics",
          metric: "system.cpu.user",
          time_range: "last_5_minutes",
          query: "top(avg:system.cpu.user{*} by {host}, 10, 'mean', 'desc')",
          count: series.length,
          hosts: series.map((item) => {
            const values = (item.pointlist || [])
              .map((point) => point?.[1])
              .filter((value) => typeof value === "number");

            const avg =
              values.length > 0
                ? values.reduce((sum, value) => sum + value, 0) / values.length
                : null;

            return {
              scope: item.scope,
              display_name: item.displayName,
              avg_cpu_user_percent:
                avg === null ? null : Number(avg.toFixed(2)),
            };
          }),
        };
      }

      if (
        q.includes("incident") ||
        q.includes("장애") ||
        q.includes("문제")
      ) {
        const result = await incidentsApi.listIncidents();

        return {
          source: "datadog",
          type: "incidents",
          count: result.data?.length || 0,
          incidents: result.data?.slice(0, 5) || [],
        };
      }

      return {
        source: "datadog",
        message: "현재는 CPU 메트릭과 Incident 조회를 지원합니다.",
      };
    } catch (error) {
      const datadogError = toProviderUserError("Datadog", error);

      return {
        source: "datadog",
        error: datadogError.message,
        errorCode: datadogError.code,
      };
    }
  }
);

const embedUserQuery = llmobs.wrap(
  { kind: "embedding", name: "embed_user_query" },
  async function embedUserQuery(queryText) {
    if (!openaiClient) {
      const error = new Error("OpenAI Embedding client is not configured");
      error.code = "RAG_EMBEDDING_PROVIDER_DISABLED";
      throw error;
    }

    const safeQuery = String(queryText ?? "");

    const response = await withRequestTimeout(
      "query embedding",
      config.llmRequestTimeoutMs,
      (signal) =>
        openaiClient.embeddings.create(
          {
            model: EMBEDDING_MODEL,
            input: safeQuery,
          },
          { signal }
        )
    );

    const embedding = response.data?.[0]?.embedding || [];

    llmobs.annotate(undefined, {
      inputData: safeQuery,
      outputData: `embedding_dimensions=${embedding.length}`,
      tags: {
        "embedding.model": EMBEDDING_MODEL,
        "embedding.scope": "query",
      },
    });

    return embedding;
  }
);

const retrieveRelevantChunks = llmobs.wrap(
  { kind: "retrieval", name: "vector_similarity_search" },
  function retrieveRelevantChunks({ query: queryText, queryEmbedding, topK = 3 }) {
    const safeQuery = String(queryText ?? "");

    const top = rankChunkRecords(VECTOR_STORE, {
      query: safeQuery,
      queryEmbedding,
      topK,
      minScore: RAG_MIN_SCORE,
      maxChunksPerDocument: RAG_MAX_CHUNKS_PER_DOCUMENT,
    });
    const strategy =
      top[0]?.retrievalStrategy ||
      (queryEmbedding?.length ? "hybrid" : "keyword");

    llmobs.annotate(undefined, {
      inputData: safeQuery,
      outputData: JSON.stringify(
        top.map((item) => ({
          id: item.id,
          docId: item.docId,
          name: item.name,
          section: item.section,
          score: Number(item.score.toFixed(6)),
          semanticScore:
            item.semanticScore === null
              ? null
              : Number(item.semanticScore.toFixed(6)),
          lexicalScore: Number(item.lexicalScore.toFixed(6)),
          strategy: item.retrievalStrategy,
          textPreview: item.text.slice(0, 200),
        }))
      ),
      tags: {
        "retrieval.strategy": strategy,
        "retrieval.top_k": String(topK),
        "retrieval.result_count": String(top.length),
        "retrieval.min_score": String(RAG_MIN_SCORE),
        "retrieval.vector_store_size": String(VECTOR_STORE.length),
      },
    });

    return top;
  }
);

function buildToolDefinitions() {
  return [
    {
      type: "function",
      function: {
        name: "get_current_time",
        description: "Get the current local server time",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "query_datadog",
        description: "Query Datadog incidents and observability data",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
  ];
}

function estimateCost({ promptTokens = 0, completionTokens = 0 }) {
  const inputCostPer1M = 0.4;
  const outputCostPer1M = 1.6;

  const cost =
    (Number(promptTokens || 0) / 1_000_000) * inputCostPer1M +
    (Number(completionTokens || 0) / 1_000_000) * outputCostPer1M;

  return cost.toFixed(6);
}

function buildSystemPrompt({ provider, model }) {
  return `
You are a helpful assistant for a Datadog demo application.

Current provider:
${provider}

Current model:
${model}

IMPORTANT RULES:
- If the user asks about current time, use get_current_time.
- If the user asks about Datadog incidents, outages, failures, alerts, monitors, logs, traces, metrics, infrastructure or observability, use query_datadog.
- Do not invent Datadog data.
- Always use tools when Datadog information is requested.
- Use retrieved context if provided.

MODEL RULES:
- If the user asks which model is running, answer with provider and model.
- Never guess the model name.
`.trim();
}

async function runAzureFoundryModel({
  provider,
  model,
  baseMessages,
  docsContext,
}) {
  const endpoint = config.azureEndpoint;
  const apiKey = config.azureApiKey;

  if (!endpoint || !apiKey) {
    throw new Error("Azure Foundry endpoint or API key is not configured");
  }

  const startedAt = Date.now();

  const response = await withRequestTimeout(
    `${provider} completion`,
    config.llmRequestTimeoutMs,
    (signal) =>
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
        signal,
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: buildSystemPrompt({ provider, model }),
            },
            ...baseMessages,
            ...(docsContext
              ? [{ role: "system", content: docsContext }]
              : []),
          ],
        }),
      })
  );

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(`Azure HTTP ${response.status}`);

    logApiError({
      req: null,
      event: "azure_request_failed",
      error,
      recoverable: true,
      metadata: {
        model,
        status_code: response.status,
        azure_error_code: data?.error?.code,
        azure_error_message: data?.error?.message,
      },
    });

    throw error;
  }

  const content =
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.text ||
    data?.output_text ||
    "응답이 비어 있습니다.";

  const promptTokens = data?.usage?.prompt_tokens ?? 0;
  const completionTokens = data?.usage?.completion_tokens ?? 0;

  return {
    provider,
    model: data?.model || model,
    content,
    promptTokens,
    completionTokens,
    totalTokens: Number(promptTokens) + Number(completionTokens),
    latencyMs: Date.now() - startedAt,
    costEstimate: estimateCost({
      promptTokens,
      completionTokens,
    }),
    usedTools: [],
  };
}

async function executeToolCall({ toolCall, conversationId, userId, provider }) {

  const toolName = toolCall.function?.name;
  const parsedArgs = safeJsonParse(toolCall.function?.arguments || "{}");

  let toolResult;

  if (toolName === "get_current_time") {
    toolResult = getCurrentTimeTool();
  } else if (toolName === "query_datadog") {
    toolResult = await queryDatadogTool(parsedArgs.query);
  } else {
    toolResult = {
      error: `Unknown tool: ${toolName}`,
    };
  }

  logger.info("chat_tool_executed", {
    user_id: userId,
    conversation_id: conversationId,
    provider,
    tool_name: toolName,
    tool_args: parsedArgs,
    tool_result: toolResult,
  });

  await createMessage({
    conversationId,
    role: "tool",
    content: JSON.stringify(toolResult),
    metadata: {
      provider,
      tool_call_id: toolCall.id,
      tool_name: toolName,
      tool_args: parsedArgs,
      source: "tool_execution",
      user_id: userId,
    },
  });

  return {
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify(toolResult),
  };
}

async function runModelWithTools({
  provider,
  client,
  model,
  baseMessages,
  docsContext,
  conversationId,
  userId,
}) 

{
  if (!client) {
    throw new Error(`${provider} client is not configured`);
  }

 

  const firstStartedAt = Date.now();

  const firstCompletion = await withRequestTimeout(
    `${provider} first completion`,
    config.llmRequestTimeoutMs,
    (signal) =>
      client.chat.completions.create(
        {
          model,
          messages: [
            {
              role: "system",
              content: buildSystemPrompt({ provider, model }),
            },
            ...baseMessages,
            ...(docsContext ? [{ role: "system", content: docsContext }] : []),
          ],
          tools: buildToolDefinitions(),
          tool_choice: "auto",
        },
        { signal }
      )
  );

  const firstLatencyMs = Date.now() - firstStartedAt;
  const firstMessage = firstCompletion.choices?.[0]?.message;
  const toolCalls = firstMessage?.tool_calls || [];

  let finalModel = firstCompletion.model || model;
  let finalPromptTokens = firstCompletion.usage?.prompt_tokens ?? 0;
  let finalCompletionTokens = firstCompletion.usage?.completion_tokens ?? 0;
  let finalLatencyMs = firstLatencyMs;
  let answer = firstMessage?.content || "응답이 비어 있습니다.";

  if (toolCalls.length > 0) {
    const secondMessages = [
      {
        role: "system",
        content: buildSystemPrompt({ provider, model }),
      },
      ...baseMessages,
      ...(docsContext ? [{ role: "system", content: docsContext }] : []),
      {
        role: "assistant",
        content: firstMessage.content || "",
        tool_calls: toolCalls,
      },
    ];

    const executedToolKeys = new Set();

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name;
      const parsedArgs = safeJsonParse(toolCall.function?.arguments || "{}");
      const toolKey = `${toolName}:${JSON.stringify(parsedArgs)}`;

      if (executedToolKeys.has(toolKey)) continue;
      executedToolKeys.add(toolKey);

      const toolMessage = await executeToolCall({
        toolCall,
        conversationId,
        userId,
        provider,
      });

      secondMessages.push(toolMessage);
    }

    const secondStartedAt = Date.now();

    const secondCompletion = await withRequestTimeout(
      `${provider} tool completion`,
      config.llmRequestTimeoutMs,
      (signal) =>
        client.chat.completions.create(
          {
            model,
            messages: secondMessages,
          },
          { signal }
        )
    );

    finalLatencyMs = firstLatencyMs + (Date.now() - secondStartedAt);
    finalModel = secondCompletion.model || model;
    finalPromptTokens = secondCompletion.usage?.prompt_tokens ?? 0;
    finalCompletionTokens = secondCompletion.usage?.completion_tokens ?? 0;
    answer =
      secondCompletion.choices?.[0]?.message?.content || "응답이 비어 있습니다.";
  }

  const totalTokens =
    Number(finalPromptTokens || 0) + Number(finalCompletionTokens || 0);

  return {
    provider,
    model: finalModel,
    content: answer,
    promptTokens: finalPromptTokens,
    completionTokens: finalCompletionTokens,
    totalTokens,
    latencyMs: finalLatencyMs,
    costEstimate: estimateCost({
      promptTokens: finalPromptTokens,
      completionTokens: finalCompletionTokens,
    }),
    usedTools: toolCalls.map((t) => t.function?.name).filter(Boolean),
  };
}

app.use("/health", createHealthRouter(runtimeState));
app.use("/auth", createAuthRouter());
app.use("/conversations", createConversationRouter());
app.use("/api/monitoring", createMonitoringRouter({ metricsApi }));
app.use(
  "/api/notifications",
  createNotificationRouter({
    smsService,
    limiter: smsRateLimiter,
  })
);

app.post("/chat", authRequired, async (req, res) => {
  const requestSpan = tracer.scope().active();
  const { conversationId, message, forceError } = req.body ?? {};
  const userId = req.user.userId;

  try {
    if (forceError === true) {
      const error = new Error("Intentional backend error for demo");
      error.name = "ForcedDemoError";
      error.code = "FORCED_DEMO_ERROR";

      logApiError({
        req,
        event: "chat_request_failed",
        error,
        userId,
        conversationId,
        recoverable: false,
        metadata: {
          reason: "forced_demo_error",
          message_preview: String(message ?? "").slice(0, 100),
        },
      });

      markSpanError(requestSpan, error, {
        "app.error.code": "forced_demo_error",
        "app.error.handled": true,
        "http.status_code": 500,
      });

      return sendApiError(req, res, "forced_demo_error");
    }

    if (!message || !String(message).trim()) {
      return sendApiError(req, res, "message_required");
    }

logChatRequest({
  userId,
  conversationId: conversationId || "new",
  requestId: req.requestId,
  message,
  provider: "compare",
  model: providerRegistry
    .map((provider) => `${provider.provider}:${provider.model}`)
    .join(" / "),
});

    let conversation;

if (conversationId) {
  conversation = await getConversationByIdForUser(conversationId, userId);

  if (!conversation) {
logApiWarn({
  req,
  event: "conversation_validation_failed",
  userId,
  conversationId,
  reason: "conversation_not_found",
  recoverable: true,
  metadata: {
    action: "create_new_conversation",
    message_preview: String(message).slice(0, 120),
  },
});

    conversation = await createConversation({
      userId,
      title: String(message).slice(0, 30),
    });

logApiInfo({
  req,
  event: "conversation_auto_recovered",
  userId,
  conversationId: conversation.id,
  metadata: {
    old_conversation_id: conversationId,
    new_conversation_id: conversation.id,
  },
});
  }
} else {
  conversation = await createConversation({
    userId,
    title: String(message).slice(0, 30),
  });
}

    const activeSpan = tracer.scope().active();

    if (activeSpan) {
      activeSpan.setTag("app.feature", "chat");
      activeSpan.setTag("app.route", "POST /chat");
      activeSpan.setTag("app.user_id", userId);
      activeSpan.setTag("app.conversation_id", conversation.id);
      activeSpan.setTag("app.llm.compare.enabled", true);
      setRequestBodyOnSpan(activeSpan, req.body);

      activeSpan.setTag("app.request.message", String(message).slice(0, 50));
    }

    const result = await llmobs.trace(
      {
        kind: "agent",
        name: "chat_agent_compare_models",
        sessionId: String(userId),
        mlApp: ML_APP,
      },
      async () => {
        const workflowResult = await llmobs.trace(
          {
            kind: "workflow",
            name: "process_chat_request_compare_models",
            sessionId: String(userId),
            mlApp: ML_APP,
          },
          async () => {
            await createMessage({
              conversationId: conversation.id,
              role: "user",
              content: String(message),
              metadata: {
                source: "web",
                user_id: userId,
              },
            });

            const history = await getMessagesByConversationId(conversation.id);

            const intent = classifyUserIntent(String(message));

            logger.info("chat_intent_classified", {
              user_id: userId,
              conversation_id: conversation.id,
              need_time_tool: intent.needTimeTool,
              need_docs: intent.needDocs,
            });

            let retrievedChunks = [];
            let retrievalStrategy = "skipped";
            let retrievalDegradedReason = null;

            if (intent.needDocs) {
              try {
                retrievedChunks = await traceOperation(
                  {
                    name: "chat.rag.retrieval",
                    resource: EMBEDDING_MODEL,
                    tags: {
                      component: "toy-chat",
                      "span.kind": "client",
                      "llm.provider": "OpenAI Embeddings",
                      "llm.model": EMBEDDING_MODEL,
                      "app.request_id": req.requestId,
                      "app.conversation_id": conversation.id,
                    },
                  },
                  async () => {
                    let queryEmbedding = null;
                    const hasEmbeddedChunks = VECTOR_STORE.some(
                      (item) => item.embedding?.length
                    );

                    if (openaiClient && hasEmbeddedChunks) {
                      try {
                        queryEmbedding = await embedUserQuery(String(message));
                      } catch (error) {
                        retrievalDegradedReason =
                          error?.code || "query_embedding_failed";
                        logLlmFailed({
                          userId,
                          conversationId: conversation.id,
                          requestId: req.requestId,
                          provider: "OpenAI Embeddings",
                          model: EMBEDDING_MODEL,
                          stage: "chat_query_embedding",
                          error,
                        });
                      }
                    } else {
                      retrievalDegradedReason = openaiClient
                        ? "no_embedded_chunks"
                        : "embedding_provider_disabled";
                    }

                    return retrieveRelevantChunks({
                      query: String(message),
                      queryEmbedding,
                      topK: RAG_TOP_K,
                    });
                  }
                );
                retrievalStrategy =
                  retrievedChunks[0]?.retrievalStrategy ||
                  (retrievalDegradedReason ? "keyword" : "hybrid");

                logger.info("chat_retrieval_completed", {
                  event: "chat_retrieval_completed",
                  request_id: req.requestId,
                  user_id: userId,
                  conversation_id: conversation.id,
                  retrieval_count: retrievedChunks.length,
                  retrieved_chunk_ids: retrievedChunks.map((chunk) => chunk.id),
                  retrieval_scores: retrievedChunks.map((chunk) =>
                    Number(chunk.score.toFixed(6))
                  ),
                  retrieval_strategy: retrievalStrategy,
                  retrieval_degraded_reason: retrievalDegradedReason,
                  rag_status: RAG_INDEX_STATE.status,
                  rag_mode: RAG_INDEX_STATE.mode,
                  embedding_model: EMBEDDING_MODEL,
                });
              } catch (error) {
                // RAG 보강 실패가 Azure/OpenAI의 일반 답변까지 막지 않도록
                // 빈 Context로 계속 진행하되, 실패한 child span과 error log는 남긴다.
                retrievedChunks = [];
                retrievalStrategy = "unavailable";
                retrievalDegradedReason =
                  error?.code || "rag_retrieval_failed";
                logLlmFailed({
                  userId,
                  conversationId: conversation.id,
                  requestId: req.requestId,
                  provider: "OpenAI Embeddings",
                  model: EMBEDDING_MODEL,
                  stage: "chat_rag_retrieval",
                  error,
                });
              }
            }

            const docsContext =
              retrievedChunks.length > 0
                ? "\n\n[Retrieved Context]\n" +
                  retrievedChunks
                    .map(
                      (chunk, idx) =>
                        `${idx + 1}. ${chunk.title || chunk.docId} > ${
                          chunk.section || "본문"
                        }\n${chunk.text}\n(source: ${
                          chunk.sources?.[0] || chunk.docId
                        }, strategy: ${chunk.retrievalStrategy}, score: ${chunk.score.toFixed(
                          4
                        )})`
                    )
                    .join("\n\n")
                : "";

const modelJobs = createProviderJobs({
  providers: providerRegistry,
  runners: {
    openai: (provider) => () =>
      traceProviderOperation(
        {
          provider: provider.provider,
          model: provider.model,
          requestId: req.requestId,
          conversationId: conversation.id,
        },
        () =>
          runModelWithTools({
            provider: provider.provider,
            client: provider.client,
            model: provider.model,
            baseMessages: buildProviderHistory(
              history,
              provider.provider
            ),
            docsContext,
            conversationId: conversation.id,
            userId,
          })
      ),
    azure: (provider) => () =>
      traceProviderOperation(
        {
          provider: provider.provider,
          model: provider.model,
          requestId: req.requestId,
          conversationId: conversation.id,
        },
        () =>
          runAzureFoundryModel({
            provider: provider.provider,
            model: provider.model,
            baseMessages: buildProviderHistory(
              history,
              provider.provider
            ),
            docsContext,
          })
      ),
  },
});

const settled = await runProviderJobs(modelJobs);

            const responses = [];

            for (let index = 0; index < settled.length; index += 1) {
              const job = modelJobs[index];
              const item = settled[index];

              if (item.status === "fulfilled") {
                const value = item.value;
                const responseTrace = {
                  provider: value.provider,
                  model: value.model,
                  totalLatencyMs: value.latencyMs,
                  totalTokens: value.totalTokens,
                  costEstimate: value.costEstimate,
                  promptTokens: value.promptTokens,
                  completionTokens: value.completionTokens,
                  usedTools: value.usedTools,
                  retrievalCount: retrievedChunks.length,
                  rag: buildRagTrace({
                    retrievedChunks,
                    retrievalStrategy,
                    degradedReason: retrievalDegradedReason,
                  }),
                };

                const persistence = await persistAssistantMessageSafely({
                  conversationId: conversation.id,
                  userId,
                  requestId: req.requestId,
                  provider: value.provider,
                  content: value.content,
                  metadata: {
                    status: "success",
                    provider: value.provider,
                    model: value.model,
                    input_tokens: value.promptTokens,
                    output_tokens: value.completionTokens,
                    total_tokens: value.totalTokens,
                    latency_ms: value.latencyMs,
                    cost_estimate: value.costEstimate,
                    used_tools: value.usedTools.length > 0,
                    tool_names: value.usedTools,
                    retrieved_chunk_ids: retrievedChunks.map((chunk) => chunk.id),
                    retrieval_count: retrievedChunks.length,
                    retrieval_strategy: retrievalStrategy,
                    retrieval_degraded_reason: retrievalDegradedReason,
                    retrieval_scores: retrievedChunks.map((chunk) =>
                      Number(chunk.score.toFixed(6))
                    ),
                    user_id: userId,
                    request_id: req.requestId,
                    trace: responseTrace,
                  },
                });
                responseTrace.persistenceStatus = persistence.status;

                responses.push({
                  id:
                    persistence.message?.id ??
                    `assistant-${Date.now()}-${index}`,
                  role: "assistant",
                  status: "success",
                  provider: value.provider,
                  model: value.model,
                  content: value.content,
                  created_at:
                    persistence.message?.created_at || new Date().toISOString(),
                  persistence: {
                    status: persistence.status,
                  },
                  trace: responseTrace,
                });

logLlmCompleted({
  userId,
  conversationId: conversation.id,
  requestId: req.requestId,
  provider: value.provider,
  model: value.model,
  durationMs: value.latencyMs,
  promptTokens: value.promptTokens,
  completionTokens: value.completionTokens,
  totalTokens: value.totalTokens,
  costEstimate: value.costEstimate,
  toolCalls: value.usedTools,
  retrievalCount: retrievedChunks.length,
});
              } else {
                const providerError = toProviderUserError(
                  job.provider,
                  item.reason
                );
                const failedModel = job.model;
                const responseTrace = {
                  provider: job.provider,
                  model: failedModel,
                  error: providerError.message,
                  errorCode: providerError.code,
                  retryable: providerError.retryable,
                  rag: buildRagTrace({
                    retrievedChunks,
                    retrievalStrategy,
                    degradedReason: retrievalDegradedReason,
                  }),
                };

                const persistence = await persistAssistantMessageSafely({
                  conversationId: conversation.id,
                  userId,
                  requestId: req.requestId,
                  provider: job.provider,
                  content: providerError.message,
                  metadata: {
                    status: "failed",
                    provider: job.provider,
                    model: failedModel,
                    error: providerError.message,
                    error_code: providerError.code,
                    retryable: providerError.retryable,
                    user_id: userId,
                    request_id: req.requestId,
                    trace: responseTrace,
                  },
                });
                responseTrace.persistenceStatus = persistence.status;

                responses.push({
                  id:
                    persistence.message?.id ??
                    `assistant-error-${Date.now()}-${index}`,
                  role: "assistant",
                  status: "failed",
                  provider: job.provider,
                  model: failedModel,
                  content: providerError.message,
                  created_at:
                    persistence.message?.created_at || new Date().toISOString(),
                  error: {
                    code: providerError.code,
                    message: providerError.message,
                    retryable: providerError.retryable,
                  },
                  persistence: {
                    status: persistence.status,
                  },
                  trace: responseTrace,
                });

logLlmFailed({
  userId,
  conversationId: conversation.id,
  requestId: req.requestId,
  provider: job.provider,
  model: failedModel,
  stage: "chat_model_compare",
  error: item.reason,
});
              }
            }

            const providerSummary = requireProviderSuccess(responses);
            const outputText = responses
              .map(
                (item) =>
                  `[${item.provider} / ${item.model}]\n${item.content}`
              )
              .join("\n\n---\n\n");

            llmobs.annotate(undefined, {
              inputData: String(message),
              outputData: outputText,
              metadata: {
                message: outputText,
              },
            });

            return {
              responses,
              retrievedChunks,
              providerSummary,
              retrievalStrategy,
              retrievalDegradedReason,
            };
          }
        );

        llmobs.annotate(undefined, {
          inputData: String(message),
          outputData: workflowResult.responses
            .map((item) => `[${item.provider}] ${item.content}`)
            .join("\n\n"),
        });

        return workflowResult;
      }
    );

    const successfulTraces = result.responses
      .filter((item) => item.status === "success")
      .map((item) => item.trace);

    const firstResponse = selectCompatibilityResponse(result.responses);
    const providerSummary = result.providerSummary;
    const ragTrace = buildRagTrace({
      retrievedChunks: result.retrievedChunks,
      retrievalStrategy: result.retrievalStrategy,
      degradedReason: result.retrievalDegradedReason,
    });

    const trace = {
      model: result.responses
        .map((item) => `${item.provider}: ${item.model}`)
        .join(" / "),
      models: result.responses.map((item) => item.trace),
      totalLatencyMs:
        successfulTraces.length > 0
          ? Math.max(
              ...successfulTraces.map((item) => Number(item.totalLatencyMs || 0))
            )
          : undefined,
      totalTokens: successfulTraces.reduce(
        (sum, item) => sum + Number(item.totalTokens || 0),
        0
      ),
      costEstimate: successfulTraces
        .reduce((sum, item) => sum + Number(item.costEstimate || 0), 0)
        .toFixed(6),
      retrievalCount: result.retrievedChunks.length,
      retrievalStrategy: result.retrievalStrategy,
      rag: ragTrace,
    };

    const responseBody = {
      conversationId: conversation.id,
      requestId: req.requestId,
      status: providerSummary.status,
      providerSummary,

      // 기존 프론트 호환용: 배열의 첫 항목이 아니라 첫 성공 응답을 유지한다.
      message: firstResponse
        ? {
            id: firstResponse.id,
            role: "assistant",
            provider: firstResponse.provider,
            model: firstResponse.model,
            content: firstResponse.content,
            created_at: firstResponse.created_at,
          }
        : null,

      // 신규 프론트용: OpenAI / Azure AI 분기 응답
      responses: result.responses,

      trace,
      rag: ragTrace,
    };

    const outcomeMetadata = {
      outcome: providerSummary.status,
      provider_count: providerSummary.totalCount,
      provider_success_count: providerSummary.successCount,
      provider_failure_count: providerSummary.failureCount,
      successful_providers: providerSummary.successfulProviders,
      failed_providers: providerSummary.failedProviders,
      retrieval_count: result.retrievedChunks.length,
      retrieval_strategy: result.retrievalStrategy,
      retrieval_degraded_reason: result.retrievalDegradedReason,
      rag_status: RAG_INDEX_STATE.status,
      rag_mode: RAG_INDEX_STATE.mode,
      total_tokens: trace.totalTokens,
      total_latency_ms: trace.totalLatencyMs,
      cost_estimate: trace.costEstimate,
      success: true,
    };

    if (providerSummary.status === "partial_success") {
      logApiWarn({
        req,
        event: "chat_request_partial_success",
        userId,
        conversationId: conversation.id,
        reason: "one_or_more_providers_failed",
        recoverable: true,
        metadata: outcomeMetadata,
      });
    } else {
      logApiInfo({
        req,
        event: "chat_request_success",
        userId,
        conversationId: conversation.id,
        metadata: outcomeMetadata,
      });
    }

    if (activeSpan) {
      activeSpan.setTag("app.llm.model", trace.model || "unknown");
      activeSpan.setTag("app.chat.outcome", providerSummary.status);
      activeSpan.setTag("app.llm.provider_count", providerSummary.totalCount);
      activeSpan.setTag(
        "app.llm.provider_success_count",
        providerSummary.successCount
      );
      activeSpan.setTag(
        "app.llm.provider_failure_count",
        providerSummary.failureCount
      );
      activeSpan.setTag(
        "app.llm.failed_providers",
        providerSummary.failedProviders.join(",")
      );
      activeSpan.setTag(
        "app.llm.degraded",
        providerSummary.status === "partial_success"
      );
      activeSpan.setTag("app.llm.total_tokens", trace.totalTokens);
      activeSpan.setTag("app.llm.cost_estimate", trace.costEstimate);
      activeSpan.setTag("app.retrieval.count", result.retrievedChunks.length);
      activeSpan.setTag(
        "app.retrieval.strategy",
        result.retrievalStrategy
      );
      if (result.retrievalDegradedReason) {
        activeSpan.setTag(
          "app.retrieval.degraded_reason",
          result.retrievalDegradedReason
        );
      }
      activeSpan.setTag("app.rag.status", RAG_INDEX_STATE.status);
      activeSpan.setTag("app.rag.mode", RAG_INDEX_STATE.mode);
      activeSpan.setTag("app.rag.embedding_model", EMBEDDING_MODEL);
      activeSpan.setTag("app.rag.chunk_size", RAG_CHUNK_SIZE);
      activeSpan.setTag("app.rag.chunk_overlap", RAG_CHUNK_OVERLAP);
      activeSpan.setTag("app.rag.top_k", RAG_TOP_K);
      setResponseBodyOnSpan(
        activeSpan,
        responseBody,
        SPAN_BODY_OPTIONS
      );
    }

    return res.json(responseBody);
    } catch (error) {
    const errorCode = classifyServerError(error, "chat_unavailable");
    const statusCode = Number(
      error?.statusCode || getErrorDefinition(errorCode).status
    );
    const failedProviders =
      error?.providerSummary?.failedProviders?.join(",") || undefined;

    logApiError({
      req,
      event: "chat_request_failed",
      error,
      userId,
      conversationId: req.body?.conversationId || "new",
      recoverable: false,
      metadata: {
        error_code: errorCode,
        outcome: "failed",
        failed_providers: error?.providerSummary?.failedProviders,
        message_preview: String(req.body?.message ?? "").slice(0, 100),
      },
    });

    markSpanError(requestSpan, error, {
      "app.error.code": errorCode,
      "app.error.handled": true,
      "app.chat.outcome": "failed",
      "app.llm.failed_providers": failedProviders,
      "http.status_code": statusCode,
    });

    return sendApiError(req, res, errorCode, { status: statusCode });
  }
});

app.use((req, res) => sendApiError(req, res, "route_not_found"));

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const isInvalidJson =
    error instanceof SyntaxError &&
    error.status === 400 &&
    Object.prototype.hasOwnProperty.call(error, "body");
  const isCorsError = String(error?.message || "").includes(
    "not allowed by CORS"
  );
  const errorCode = isInvalidJson
    ? "invalid_json"
    : isCorsError
    ? "cors_not_allowed"
    : classifyServerError(error, "internal_server_error");

  logApiError({
    req,
    event: "unhandled_api_error",
    error,
    userId: req.user?.userId,
    recoverable: errorCode !== "cors_not_allowed",
    metadata: {
      error_code: errorCode,
    },
  });

  markActiveSpanError(error, {
    "app.error.code": errorCode,
    "app.error.handled": true,
  });

  return sendApiError(req, res, errorCode);
});

async function startApplication() {
  logger.info("app_starting", {
    event: "app_starting",
    port: config.port,
    version: config.version,
    embedding_model: EMBEDDING_MODEL,
    openai_model: OPENAI_MODEL,
    openai_enabled: config.openaiEnabled,
    azure_openai_model: AZURE_OPENAI_MODEL,
    azure_enabled: Boolean(azureClient),
    enabled_providers: providerRegistry.map((provider) => provider.provider),
    rag_chunk_size: RAG_CHUNK_SIZE,
    rag_chunk_overlap: RAG_CHUNK_OVERLAP,
    rag_top_k: RAG_TOP_K,
    rag_min_score: RAG_MIN_SCORE,
    rag_max_chunks_per_document: RAG_MAX_CHUNKS_PER_DOCUMENT,
    rag_embedding_batch_size: RAG_EMBEDDING_BATCH_SIZE,
    llm_request_timeout_ms: config.llmRequestTimeoutMs,
    shutdown_timeout_ms: config.shutdownTimeoutMs,
    span_body_capture_mode: config.spanBodyCaptureMode,
    sms_enabled: config.smsEnabled,
    sms_rate_limit_max: config.smsRateLimitMax,
    sms_rate_limit_window_ms: config.smsRateLimitWindowMs,
  });

  for (const warning of configWarnings) {
    logger.warn("configuration_warning", {
      event: "configuration_warning",
      warning,
    });
  }

  await initDatabase();
  runtimeState.databaseReady = true;

  try {
    const ragState = await initRAG();
    runtimeState.ragReady = ragState.chunkCount > 0;
    runtimeState.ragStatus = ragState.status;
    runtimeState.ragMode = ragState.mode;
    runtimeState.ragDocumentCount = ragState.documentCount;
    runtimeState.ragChunkCount = ragState.chunkCount;
    runtimeState.ragErrorCode = ragState.errorCode;
  } catch (error) {
    // RAG는 선택적 보강 기능이다. 문서/캐시 오류가 핵심 채팅 서버의
    // 시작을 막지 않으며, 요청은 빈 Context로 계속 처리된다.
    runtimeState.ragReady = false;
    runtimeState.ragStatus = "degraded";
    runtimeState.ragMode = "unavailable";
    runtimeState.ragErrorCode =
      error?.code || "RAG_INITIALIZATION_FAILED";
    RAG_INDEX_STATE = {
      ...RAG_INDEX_STATE,
      status: "degraded",
      mode: "unavailable",
      errorCode: runtimeState.ragErrorCode,
    };
    VECTOR_STORE = [];

    logger.error("rag_initialization_failed", {
      event: "rag_initialization_failed",
      severity: "error",
      recoverable: true,
      error,
      error_code: runtimeState.ragErrorCode,
      fallback_mode: "empty_context",
    });
  }

  const server = app.listen(config.port, () => {
    logger.info("app_listening", {
      event: "app_listening",
      url: `http://localhost:${config.port}`,
      readiness_url: `http://localhost:${config.port}/health/ready`,
    });
    console.log(`API listening on http://localhost:${config.port}`);
  });

  const shutdown = createShutdownController({
    server,
    runtimeState,
    closeDatabase,
    logger,
  });
  installProcessHandlers({ shutdown, logger });
}

try {
  await startApplication();
} catch (error) {
  logger.error("app_start_failed", {
    event: "app_start_failed",
    severity: "critical",
    recoverable: false,
    error,
  });

  if (runtimeState.databaseReady) {
    await closeDatabase().catch(() => {});
  }
  logger.close();
  process.exitCode = 1;
}
