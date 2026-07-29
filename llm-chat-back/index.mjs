import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import crypto from "crypto";
import tracer from "dd-trace";
import * as datadogApiClient from "@datadog/datadog-api-client";
import logger, {
  requestLogger,
  logChatRequest,
  logLlmCompleted,
  logLlmFailed,
  logApiError,
  logApiWarn,
  logApiInfo,
} from "./logger.mjs";
import { query, initDatabase } from "./db.mjs";
import {
  hashPassword,
  comparePassword,
  signToken,
  authRequired,
} from "./auth.mjs";
import {
  loadDocuments,
  buildChunkRecords,
  loadEmbeddingCache,
  saveEmbeddingCache,
  cosineSimilarity,
} from "./rag.mjs";
import { serializeTelemetry } from "./telemetry-sanitizer.mjs";
import { buildProviderHistory } from "./conversation-history.mjs";

const app = express();
const llmobs = tracer.llmobs;

const ML_APP =
  process.env.DD_LLMOBS_ML_APP || process.env.DD_SERVICE || "shlim-toy-chat";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const AZURE_OPENAI_MODEL = process.env.AZURE_OPENAI_MODEL || "gpt-4o-mini";
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || "";

const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

const RAG_CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 1000);
const RAG_CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 150);
const RAG_TOP_K = Number(process.env.RAG_TOP_K || 3);

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const azureClient =
  process.env.AZURE_OPENAI_API_KEY && AZURE_OPENAI_ENDPOINT
    ? {
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        endpoint: AZURE_OPENAI_ENDPOINT,
      }
    : null;

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

if (allowedOrigins.length > 0) {
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true);

        if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
          return cb(null, true);
        }

        return cb(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    })
  );
}

app.use((req, res, next) => {
  res.setHeader("Timing-Allow-Origin", "*");
  next();
});

app.use(express.json({ limit: "1mb" }));

app.use(requestLogger);

const ddConfig = datadogApiClient.client.createConfiguration({
  authMethods: {
    apiKeyAuth: process.env.DD_API_KEY?.trim(),
    appKeyAuth: process.env.DD_APP_KEY?.trim(),
  },
});

ddConfig.setServerVariables({
  site: process.env.DD_SITE || "datadoghq.com",
});

const incidentsApi = new datadogApiClient.v2.IncidentsApi(ddConfig);
const metricsApi = new datadogApiClient.v1.MetricsApi(ddConfig);

process.on("uncaughtException", (error) => {
  logger.error("uncaught_exception", {
    event: "uncaught_exception",
    severity: "critical",
    process: process.pid,
    node_version: process.version,
    uptime_sec: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
  });
});

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled_rejection", {
    reason:
      reason instanceof Error ? reason.message : String(reason ?? "unknown"),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

function generateId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 64);
}

function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const SPAN_BODY_TAG_MAX = Number(process.env.SPAN_BODY_TAG_MAX || 8192);

function truncateForSpan(str) {
  if (typeof str !== "string") return str;
  if (str.length <= SPAN_BODY_TAG_MAX) return str;
  return `${str.slice(0, SPAN_BODY_TAG_MAX)}...[truncated ${
    str.length - SPAN_BODY_TAG_MAX
  } chars]`;
}

function setRequestBodyOnSpan(span, body) {
  if (!span) return;
  span.setTag(
    "http.request.body",
    truncateForSpan(serializeTelemetry(body, { maxStringLength: SPAN_BODY_TAG_MAX }))
  );
}

function setResponseBodyOnSpan(span, body) {
  if (!span) return;
  span.setTag(
    "http.response.body",
    truncateForSpan(serializeTelemetry(body, { maxStringLength: SPAN_BODY_TAG_MAX }))
  );
}

function markSpanError(error, extraTags = {}) {
  const span = tracer.scope().active();
  if (!span || !error) return;

  span.setTag("error", true);
  span.setTag("error.type", error.name || "Error");
  span.setTag("error.message", error.message || "unknown error");
  span.setTag("error.stack", error.stack || "");

  for (const [key, value] of Object.entries(extraTags)) {
    if (value !== undefined && value !== null) {
      span.setTag(key, value);
    }
  }
}

app.use((req, res, next) => {
  const span = tracer.scope().active();

  if (span) {
    span.setTag("http.method", req.method);
    span.setTag("http.route.path", req.path);
    setRequestBodyOnSpan(span, req.body);
  }

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = function patchedJson(body) {
    const currentSpan = tracer.scope().active() || span;
    if (currentSpan) {
      setResponseBodyOnSpan(currentSpan, body);
      currentSpan.setTag("http.status_code", res.statusCode);
    }
    return originalJson(body);
  };

  res.send = function patchedSend(body) {
    const currentSpan = tracer.scope().active() || span;
    if (currentSpan) {
      const parsed = typeof body === "string" ? safeJsonParse(body, body) : body;
      setResponseBodyOnSpan(currentSpan, parsed);
      currentSpan.setTag("http.status_code", res.statusCode);
    }
    return originalSend(body);
  };

  next();
});

async function getUserByEmail(email) {
  const rows = await query(
    `
    SELECT id, email, password_hash, name, created_at, updated_at
    FROM users
    WHERE email = ?
    LIMIT 1
    `,
    [email]
  );

  return rows[0] || null;
}

async function getUserById(userId) {
  const rows = await query(
    `
    SELECT id, email, name, created_at, updated_at
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
}

async function createUser({ name, email, passwordHash }) {
  const result = await query(
    `
    INSERT INTO users (name, email, password_hash)
    VALUES (?, ?, ?)
    `,
    [name, email, passwordHash]
  );

  return getUserById(result.insertId);
}

async function createConversation({ userId, title }) {
  const id = generateId("conv");

  await query(
    `
    INSERT INTO conversations (id, user_id, title)
    VALUES (?, ?, ?)
    `,
    [id, userId, title]
  );

  const rows = await query(
    `
    SELECT id, user_id, title, created_at, updated_at
    FROM conversations
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
}

async function getConversationByIdForUser(conversationId, userId) {
  const rows = await query(
    `
    SELECT id, user_id, title, created_at, updated_at
    FROM conversations
    WHERE id = ? AND user_id = ?
    LIMIT 1
    `,
    [conversationId, userId]
  );

  return rows[0] || null;
}

async function updateConversationTimestamp(conversationId) {
  await query(
    `
    UPDATE conversations
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    [conversationId]
  );
}

async function createMessage({
  conversationId,
  role,
  content,
  metadata = null,
}) {
  const result = await query(
    `
    INSERT INTO messages (
      conversation_id,
      role,
      content,
      metadata_json
    )
    VALUES (?, ?, ?, ?)
    `,
    [
      conversationId,
      role,
      content,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );

  await updateConversationTimestamp(conversationId);

  const rows = await query(
    `
    SELECT
      id,
      conversation_id,
      role,
      content,
      metadata_json,
      created_at
    FROM messages
    WHERE id = ?
    LIMIT 1
    `,
    [result.insertId]
  );

  const row = rows[0] || null;
  if (!row) return null;

  return {
    ...row,
    metadata: row.metadata_json ? safeJsonParse(row.metadata_json, null) : null,
  };
}

async function getMessagesByConversationId(conversationId) {
  const rows = await query(
    `
    SELECT
      id,
      conversation_id,
      role,
      content,
      metadata_json,
      created_at
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC, id ASC
    `,
    [conversationId]
  );

  return rows.map((row) => ({
    ...row,
    metadata: row.metadata_json ? safeJsonParse(row.metadata_json, null) : null,
  }));
}

async function getConversationsByUserId(userId) {
  return query(
    `
    SELECT id, user_id, title, created_at, updated_at
    FROM conversations
    WHERE user_id = ?
    ORDER BY updated_at DESC, created_at DESC
    `,
    [userId]
  );
}

const embedTextForIndexing = llmobs.wrap(
  { kind: "embedding", name: "embed_document_chunk" },
  async function embedTextForIndexing({ text, chunkId, docId }) {
    const safeText = String(text ?? "");

    const response = await openaiClient.embeddings.create({
      model: EMBEDDING_MODEL,
      input: safeText,
    });

    const embedding = response.data?.[0]?.embedding || [];

    llmobs.annotate(undefined, {
      inputData: safeText,
      outputData: `embedding_dimensions=${embedding.length}`,
      tags: {
        "embedding.model": EMBEDDING_MODEL,
        "embedding.scope": "document",
        "rag.chunk_id": chunkId,
        "rag.doc_id": docId,
      },
    });

    return embedding;
  }
);

let VECTOR_STORE = [];

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
    version: 1,
    embeddingModel: EMBEDDING_MODEL,
    updatedAt: new Date().toISOString(),
    chunks: {},
  };

  VECTOR_STORE = [];

  let reusedCount = 0;
  let generatedCount = 0;

  await llmobs.trace(
    {
      kind: "workflow",
      name: "initialize_rag_index",
      mlApp: ML_APP,
    },
    async () => {
      for (const chunk of chunkRecords) {
        let embedding = null;

        const cached =
          !cacheModelMismatch && cache.chunks ? cache.chunks[chunk.hash] : null;

        if (cached?.embedding?.length) {
          embedding = cached.embedding;
          reusedCount += 1;
        } else {
          embedding = await embedTextForIndexing({
            text: chunk.text,
            chunkId: chunk.id,
            docId: chunk.docId,
          });
          generatedCount += 1;
        }

        const item = {
          ...chunk,
          embedding,
        };

        VECTOR_STORE.push(item);
        nextCache.chunks[chunk.hash] = item;
      }

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
        }),
      });
    }
  );

  saveEmbeddingCache(nextCache);

  logger.info("rag_initialized", {
    chunk_count: VECTOR_STORE.length,
    document_count: docs.length,
    reused_embedding_count: reusedCount,
    generated_embedding_count: generatedCount,
    embedding_model: EMBEDDING_MODEL,
  });

  console.log(
    `RAG initialized with ${VECTOR_STORE.length} chunks (reused=${reusedCount}, generated=${generatedCount})`
  );
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
      return {
        source: "datadog",
        error: error.message,
      };
    }
  }
);

const embedUserQuery = llmobs.wrap(
  { kind: "embedding", name: "embed_user_query" },
  async function embedUserQuery(queryText) {
    const safeQuery = String(queryText ?? "");

    const response = await openaiClient.embeddings.create({
      model: EMBEDDING_MODEL,
      input: safeQuery,
    });

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

    const scored = VECTOR_STORE.map((item) => {
      const score = cosineSimilarity(queryEmbedding, item.embedding);
      return {
        ...item,
        score,
      };
    });

    const top = scored
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    llmobs.annotate(undefined, {
      inputData: safeQuery,
      outputData: JSON.stringify(
        top.map((item) => ({
          id: item.id,
          docId: item.docId,
          name: item.name,
          score: Number(item.score.toFixed(6)),
          textPreview: item.text.slice(0, 200),
        }))
      ),
      tags: {
        "retrieval.strategy": "cosine_similarity",
        "retrieval.top_k": String(topK),
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
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim();

  if (!endpoint || !apiKey) {
    throw new Error("Azure Foundry endpoint or API key is not configured");
  }

  const startedAt = Date.now();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
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
  });

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

  const firstCompletion = await client.chat.completions.create({
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
  });

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

    const secondCompletion = await client.chat.completions.create({
      model,
      messages: secondMessages,
    });

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

app.get("/health", (_req, res) => {
  return res.json({
    ok: true,
    service: process.env.DD_SERVICE || "shlim-toy-chat-api",
    openaiModel: OPENAI_MODEL,
    azureOpenAIModel: AZURE_OPENAI_MODEL,
    azureEnabled: Boolean(azureClient),
  });
});

app.get("/monitoring/test", (_req, res) => {
  return res.json({
    ok: true,
    message: "monitoring route alive",
  });
});

function monitoringGetTodayRangeSecKST() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;

  const from = new Date(`${y}-${m}-${d}T00:00:00+09:00`);

  return {
    fromSec: Math.floor(from.getTime() / 1000),
    toSec: Math.floor(now.getTime() / 1000),
  };
}

function monitoringGetHostFromScope(scope = "") {
  const match = String(scope).match(/host:([^,\s]+)/);
  return match?.[1] || "unknown";
}

function monitoringGetResourceFromScope(scope = "") {
  const match =
    String(scope).match(/resource_name:([^,\s]+)/) ||
    String(scope).match(/resource:([^,\s]+)/);

  return match?.[1] || "unknown";
}

function monitoringGetUserFromScope(scope = "") {
  const match =
    String(scope).match(/usr\.name:([^,\s]+)/) ||
    String(scope).match(/usr_name:([^,\s]+)/) ||
    String(scope).match(/user\.name:([^,\s]+)/) ||
    String(scope).match(/name:([^,\s]+)/);

  return match?.[1] || "unknown";
}

function monitoringGetSeriesValues(pointlist = []) {
  return pointlist
    .map((point) => point?.[1])
    .filter((value) => typeof value === "number" && Number.isFinite(value));
}

function monitoringAverage(values = []) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function monitoringTotal(values = []) {
  return values.reduce((sum, value) => sum + value, 0);
}

function monitoringGetAllValues(result) {
  return (result.series || []).flatMap((item) =>
    monitoringGetSeriesValues(item.pointlist || [])
  );
}

function monitoringFormatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${Number(value).toFixed(1)}%`;
}

function monitoringFormatLatency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";

  const num = Number(value);

  if (num < 1) {
    return `${(num * 1000).toFixed(0)} ms`;
  }

  return `${num.toFixed(2)} s`;
}

function monitoringFormatSessions(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const count = Math.round(Number(value));
  return count === 1 ? "1 session" : `${count} sessions`;
}

function monitoringGetTopCpuHosts(result, limit = 3) {
  return (result.series || [])
    .map((item) => {
      const idleAvg = monitoringAverage(
        monitoringGetSeriesValues(item.pointlist || [])
      );

      const idlePercent =
        idleAvg === null ? null : idleAvg <= 1 ? idleAvg * 100 : idleAvg;

      const usage = idlePercent === null ? null : 100 - idlePercent;

      return {
        host: monitoringGetHostFromScope(item.scope),
        value: usage,
        displayValue: monitoringFormatPercent(usage),
      };
    })
    .filter((item) => item.value !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function monitoringGetTopMemoryHosts(result, limit = 3) {
  return (result.series || [])
    .map((item) => {
      const usableAvgRaw = monitoringAverage(
        monitoringGetSeriesValues(item.pointlist || [])
      );

      const usableAvg =
        usableAvgRaw === null
          ? null
          : usableAvgRaw <= 1
          ? usableAvgRaw * 100
          : usableAvgRaw;

      const usage = usableAvg === null ? null : 100 - usableAvg;

      return {
        host: monitoringGetHostFromScope(item.scope),
        value: usage,
        displayValue: monitoringFormatPercent(usage),
      };
    })
    .filter((item) => item.value !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function monitoringGetTopLatencyResources(result, limit = 3) {
  return (result.series || [])
    .map((item) => {
      const latencyAvg = monitoringAverage(
        monitoringGetSeriesValues(item.pointlist || [])
      );

      return {
        resource: monitoringGetResourceFromScope(item.scope),
        value: latencyAvg,
        displayValue: monitoringFormatLatency(latencyAvg),
      };
    })
    .filter((item) => item.value !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function monitoringGetTopVisitorUsers(result, limit = 3) {
  return (result.series || [])
    .map((item) => {
      const total = monitoringTotal(
        monitoringGetSeriesValues(item.pointlist || [])
      );

      return {
        username: monitoringGetUserFromScope(item.scope),
        value: total,
        displayValue: monitoringFormatSessions(total),
      };
    })
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

app.get("/api/monitoring/summary", async (req, res) => {
  try {
    const { fromSec, toSec } = monitoringGetTodayRangeSecKST();

    const [cpuIdleResult, memoryUsableResult, latencyResult, visitorsResult] =
      await Promise.all([
        metricsApi.queryMetrics({
          from: fromSec,
          to: toSec,
          query: "avg:system.cpu.idle{*} by {host}",
        }),
        metricsApi.queryMetrics({
          from: fromSec,
          to: toSec,
          query: "avg:system.mem.pct_usable{*} by {host}",
        }),
        metricsApi.queryMetrics({
          from: fromSec,
          to: toSec,
          query:
            "avg:trace.express.request{env:dev,service:shlim-toy-chat-api} by {resource_name}",
        }),
        metricsApi.queryMetrics({
          from: fromSec,
          to: toSec,
          query: "sum:custom.user{*} by {usr.name}.as_count()",
        }),
      ]);

    const topCpuHosts = monitoringGetTopCpuHosts(cpuIdleResult, 3);
    const topMemoryHosts = monitoringGetTopMemoryHosts(memoryUsableResult, 3);
    const topLatencyResources = monitoringGetTopLatencyResources(
      latencyResult,
      3
    );
    const topVisitorUsers = monitoringGetTopVisitorUsers(visitorsResult, 3);
    const visitorsTotal = monitoringTotal(monitoringGetAllValues(visitorsResult));

    return res.json({
      range: {
        timezone: "Asia/Seoul",
        from: fromSec,
        to: toSec,
      },
      metrics: {
        cpu: topCpuHosts[0]?.displayValue || "-",
        memory: topMemoryHosts[0]?.displayValue || "-",
        latency: topLatencyResources[0]?.displayValue || "-",
        visitors: `${Math.round(visitorsTotal)} sessions`,
      },
      details: {
        cpuHosts: topCpuHosts,
        memoryHosts: topMemoryHosts,
        latencyResources: topLatencyResources,
        visitorsUsers: topVisitorUsers,
      },
    });
  } catch (error) {
    logApiError({
      req,
      event: "monitoring_summary_failed",
      error,
      recoverable: true,
      metadata: {
        datadog_site: process.env.DD_SITE,
      },
    });

    return res.status(500).json({
      error: "monitoring_summary_failed",
      message: error?.message || "failed to load monitoring summary",
    });
  }
});

app.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body ?? {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: "email is required" });
    }

    if (!password || !String(password).trim()) {
      return res.status(400).json({ error: "password is required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await getUserByEmail(normalizedEmail);

    if (existingUser) {
      return res.status(409).json({ error: "email already exists" });
    }

    const passwordHash = await hashPassword(String(password));

    const user = await createUser({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
    });

    const token = signToken(user);

logApiInfo({
  req,
  event: "auth_register_success",
  userId: user.id,
  metadata: {
    email: user.email,
  },
});

    return res.json({
      token,
      user,
    });
  } catch (error) {
logApiError({
    req,
    event: "auth_register_failed",
    error,
    recoverable:false,
    metadata:{
        email:req.body?.email
    }
});

    markSpanError(error, {
      "app.feature": "auth",
      "app.route": "POST /auth/register",
    });

    return res.status(500).json({
      error: error?.message || "internal server error",
    });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !String(email).trim()) {
      return res.status(400).json({
        error: "email_required",
        message: "이메일을 입력해주세요.",
      });
    }

    if (!password || !String(password).trim()) {
      return res.status(400).json({
        error: "password_required",
        message: "비밀번호를 입력해주세요.",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await getUserByEmail(normalizedEmail);

    if (!user) {
      logApiWarn({
        req,
        event: "auth_login_failed",
        reason: "user_not_found",
        recoverable: true,
        metadata: {
          email: normalizedEmail,
        },
      });

      return res.status(404).json({
        error: "user_not_found",
        message: "존재하지 않는 이메일입니다.",
      });
    }

    const matched = await comparePassword(String(password), user.password_hash);

    if (!matched) {
      logApiWarn({
        req,
        event: "auth_login_failed",
        reason: "invalid_password",
        recoverable: true,
        metadata: {
          email: normalizedEmail,
          user_id: user.id,
        },
      });

      return res.status(401).json({
        error: "invalid_password",
        message: "비밀번호가 올바르지 않습니다.",
      });
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };

    const token = signToken(safeUser);

logApiInfo({
  req,
  event: "auth_login_success",
  userId: safeUser.id,
  metadata: {
    email: safeUser.email,
  },
});

    return res.json({
      token,
      user: safeUser,
    });
  } catch (error) {
    logApiError({
      req,
      event: "auth_login_failed",
      error,
      recoverable: false,
      metadata: {
        email: req.body?.email,
      },
    });

    markSpanError(error, {
      "app.feature": "auth",
      "app.route": "POST /auth/login",
    });

    return res.status(500).json({
      error: "internal_server_error",
      message: error?.message || "internal server error",
    });
  }
});

app.get("/auth/me", authRequired, async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);

    if (!user) {
      return res.status(401).json({ error: "invalid token" });
    }

    return res.json({ user });
  } catch (error) {
logApiError({
    req,
    event:"auth_me_failed",
    error,
    userId:req.user?.userId,
    recoverable:false
});

    markSpanError(error, {
      "app.feature": "auth",
      "app.route": "GET /auth/me",
      "app.user_id": req.user?.userId,
    });

    return res.status(500).json({
      error: error?.message || "internal server error",
    });
  }
});

app.get("/conversations", authRequired, async (req, res) => {
  try {
    const userId = req.user.userId;
    const conversations = await getConversationsByUserId(userId);

    logger.info("conversations_request_success", {
      user_id: userId,
      conversation_count: conversations.length,
    });

    return res.json({ conversations });
  } catch (error) {
logApiError({
    req,
    event:"conversations_failed",
    error,
    userId:req.user?.userId,
    recoverable:false
});

    markSpanError(error, {
      "app.feature": "conversations",
      "app.route": "GET /conversations",
      "app.user_id": req.user?.userId,
    });

    return res.status(500).json({
      error: error?.message || "internal server error",
    });
  }
});

app.get(
  "/conversations/:conversationId/messages",
  authRequired,
  async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user.userId;

      const conversation = await getConversationByIdForUser(
        conversationId,
        userId
      );

      if (!conversation) {
        return res.status(404).json({ error: "conversation not found" });
      }

      const messages = await getMessagesByConversationId(conversationId);

      const normalizedMessages = messages.map((msg) => ({
        ...msg,
        provider: msg.metadata?.provider || null,
        model: msg.metadata?.model || null,
        trace: msg.metadata?.trace || null,
      }));

      logger.info("conversation_messages_request_success", {
        user_id: userId,
        conversation_id: conversationId,
        message_count: messages.length,
      });

      return res.json({ messages: normalizedMessages });
    } catch (error) {
logApiError({
    req,
    event:"conversation_messages_failed",
    error,
    userId:req.user?.userId,
    conversationId:req.params.conversationId,
    recoverable:false
});

      markSpanError(error, {
        "app.feature": "conversation_messages",
        "app.route": "GET /conversations/:conversationId/messages",
        "app.user_id": req.user?.userId,
        "app.conversation_id": req.params?.conversationId,
      });

      return res.status(500).json({
        error: error?.message || "internal server error",
      });
    }
  }
);

app.post("/chat", authRequired, async (req, res) => {
  const requestSpan = tracer.scope().active();
  const { conversationId, message, forceError } = req.body ?? {};
  const userId = req.user.userId;

  try {
    if (forceError === true) {
      const error = new Error("Intentional backend error for demo");

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

      return res.status(500).json({
        error: "forced_demo_error",
        message: error.message,
      });
    }

    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "message is required" });
    }

logChatRequest({
  userId,
  conversationId: conversationId || "new",
  requestId: req.requestId,
  message,
  provider: "compare",
  model: `${OPENAI_MODEL} / ${AZURE_OPENAI_MODEL}`,
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

            if (intent.needDocs) {
              const queryEmbedding = await embedUserQuery(String(message));

              retrievedChunks = retrieveRelevantChunks({
                query: String(message),
                queryEmbedding,
                topK: RAG_TOP_K,
              });

              logger.info("chat_retrieval_completed", {
                user_id: userId,
                conversation_id: conversation.id,
                retrieval_count: retrievedChunks.length,
                retrieved_chunk_ids: retrievedChunks.map((chunk) => chunk.id),
                retrieval_scores: retrievedChunks.map((chunk) =>
                  Number(chunk.score.toFixed(6))
                ),
                embedding_model: EMBEDDING_MODEL,
              });
            }

            const docsContext =
              retrievedChunks.length > 0
                ? "\n\n[Retrieved Context]\n" +
                  retrievedChunks
                    .map(
                      (chunk, idx) =>
                        `${idx + 1}. ${chunk.docId}\n${chunk.text}\n(score: ${chunk.score.toFixed(
                          4
                        )})`
                    )
                    .join("\n\n")
                : "";

const modelJobs = [
  {
    provider: "OpenAI",
    runner: () =>
      runModelWithTools({
        provider: "OpenAI",
        client: openaiClient,
        model: OPENAI_MODEL,
        baseMessages: buildProviderHistory(history, "OpenAI"),
        docsContext,
        conversationId: conversation.id,
        userId,
      }),
  },
  {
    provider: "Azure AI",
    runner: () =>
      runAzureFoundryModel({
        provider: "Azure AI",
        model: AZURE_OPENAI_MODEL,
        baseMessages: buildProviderHistory(history, "Azure AI"),
        docsContext,
      }),
  },
];

const settled = await Promise.allSettled(
  modelJobs.map((job) => job.runner())
);

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
                };

                const assistantMessage = await createMessage({
                  conversationId: conversation.id,
                  role: "assistant",
                  content: value.content,
                  metadata: {
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
                    user_id: userId,
                    request_id: req.requestId,
                    trace: responseTrace,
                  },
                });

                responses.push({
                  id: assistantMessage?.id ?? `assistant-${Date.now()}-${index}`,
                  role: "assistant",
                  provider: value.provider,
                  model: value.model,
                  content: value.content,
                  created_at:
                    assistantMessage?.created_at || new Date().toISOString(),
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
                const errorMessage =
                  item.reason?.message || `${job.provider} request failed`;
                const failedModel =
                  job.provider === "Azure AI"
                    ? AZURE_OPENAI_MODEL
                    : OPENAI_MODEL;
                const responseTrace = {
                  provider: job.provider,
                  model: failedModel,
                  error: errorMessage,
                };

                const assistantMessage = await createMessage({
                  conversationId: conversation.id,
                  role: "assistant",
                  content: `에러 발생: ${errorMessage}`,
                  metadata: {
                    provider: job.provider,
                    model: failedModel,
                    error: errorMessage,
                    user_id: userId,
                    request_id: req.requestId,
                    trace: responseTrace,
                  },
                });

                responses.push({
                  id: assistantMessage?.id ?? `assistant-error-${Date.now()}`,
                  role: "assistant",
                  provider: job.provider,
                  model: failedModel,
                  content: `에러 발생: ${errorMessage}`,
                  created_at:
                    assistantMessage?.created_at || new Date().toISOString(),
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
      .map((item) => item.trace)
      .filter((trace) => !trace.error);

    const firstResponse = result.responses[0];

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
    };

    const responseBody = {
      conversationId: conversation.id,

      // 기존 프론트 호환용: 첫 번째 응답을 message로 유지
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
    };

logApiInfo({
  req,
  event: "chat_request_success",
  userId,
  conversationId: conversation.id,
  metadata: {
    provider_count: result.responses.length,
    retrieval_count: result.retrievedChunks.length,
    total_tokens: trace.totalTokens,
    total_latency_ms: trace.totalLatencyMs,
    cost_estimate: trace.costEstimate,
    success: true,
  },
});

    if (activeSpan) {
      activeSpan.setTag("app.llm.model", trace.model || "unknown");
      activeSpan.setTag("app.llm.provider_count", result.responses.length);
      activeSpan.setTag("app.llm.total_tokens", trace.totalTokens);
      activeSpan.setTag("app.llm.cost_estimate", trace.costEstimate);
      activeSpan.setTag("app.retrieval.count", result.retrievedChunks.length);
      activeSpan.setTag("app.rag.embedding_model", EMBEDDING_MODEL);
      activeSpan.setTag("app.rag.chunk_size", RAG_CHUNK_SIZE);
      activeSpan.setTag("app.rag.chunk_overlap", RAG_CHUNK_OVERLAP);
      activeSpan.setTag("app.rag.top_k", RAG_TOP_K);
      setResponseBodyOnSpan(activeSpan, responseBody);
    }

    return res.json(responseBody);
    } catch (error) {
    logApiError({
      req,
      event: "chat_request_failed",
      error,
      userId,
      conversationId: req.body?.conversationId || "new",
      recoverable: false,
      metadata: {
        message_preview: String(req.body?.message ?? "").slice(0, 100),
      },
    });

    if (requestSpan) {
      requestSpan.setTag("error", true);
      requestSpan.setTag("error.type", error.name || "Error");
      requestSpan.setTag("error.message", error.message || "unknown error");
      requestSpan.setTag("error.stack", error.stack || "");
      requestSpan.setTag("http.status_code", 500);
      requestSpan.setTag("app.error.handled", true);
    }

    return res.status(500).json({
      error: error?.message || "internal server error",
    });
  }
});

const port = Number(process.env.PORT || 3001);

logger.info("app_starting", {
  port,
  embedding_model: EMBEDDING_MODEL,
  openai_model: OPENAI_MODEL,
  azure_openai_model: AZURE_OPENAI_MODEL,
  azure_enabled: Boolean(azureClient),
  rag_chunk_size: RAG_CHUNK_SIZE,
  rag_chunk_overlap: RAG_CHUNK_OVERLAP,
  rag_top_k: RAG_TOP_K,
});

try {
  await initDatabase();
} catch (error) {
logger.error("db_init_failed", {
    event: "db_init_failed",
    severity: "critical",
    database: "mysql",
    host: process.env.MYSQL_HOST,
    database_name: process.env.MYSQL_DATABASE,
    recoverable: false,
    error: {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack,
    },
});

  console.error("FATAL: failed to initialize database:", error.message);
  process.exit(1);
}

try {
  await initRAG();
} catch (error) {
logger.error("rag_init_failed", {
    event: "rag_init_failed",
    embedding_model: EMBEDDING_MODEL,
    chunk_size: RAG_CHUNK_SIZE,
    overlap: RAG_CHUNK_OVERLAP,
    top_k: RAG_TOP_K,
    recoverable: false,
    error: {
        message: error.message,
        stack: error.stack,
    },
});

  console.error("FATAL: failed to initialize RAG index:", error.message);
  process.exit(1);
}

app.listen(port, () => {
  logger.info("app_listening", {
    url: `http://localhost:${port}`,
  });

  console.log(`API listening on http://localhost:${port}`);
});
