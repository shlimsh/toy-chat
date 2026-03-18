import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import tracer from "dd-trace";
import logger from "./logger.mjs";
import {
  loadDocuments,
  buildChunkRecords,
  loadEmbeddingCache,
  saveEmbeddingCache,
  cosineSimilarity,
} from "./rag.mjs";

const app = express();
const llmobs = tracer.llmobs;
const ML_APP =
  process.env.DD_LLMOBS_ML_APP || process.env.DD_SERVICE || "shlim-toy-chat";

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

const RAG_CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 1000);
const RAG_CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 150);
const RAG_TOP_K = Number(process.env.RAG_TOP_K || 3);

/**
 * SQLite 초기화
 */
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "chat.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    latency_ms INTEGER,
    metadata TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_session_id
    ON conversations(session_id);

  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
    ON messages(conversation_id);

  CREATE INDEX IF NOT EXISTS idx_messages_created_at
    ON messages(created_at);
`);

/**
 * 전역 예외 로그
 */
process.on("uncaughtException", (error) => {
  logger.error("uncaught_exception", {
    error_message: error.message,
    error_stack: error.stack,
  });
});

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled_rejection", {
    reason:
      reason instanceof Error ? reason.message : String(reason ?? "unknown"),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

/**
 * 유틸
 */
function generateId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function shouldUseTimeTool(message) {
  return /현재 시간|지금 시간|몇 시|시각|time/i.test(String(message));
}

function shouldUseDocs(message) {
  return String(message ?? "").trim().length > 0;
}

/**
 * DB 헬퍼
 */
function createConversation({ sessionId, title }) {
  const id = generateId("conv");
  const now = nowIso();

  const stmt = db.prepare(`
    INSERT INTO conversations (id, session_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(id, sessionId, title, now, now);

  return {
    id,
    session_id: sessionId,
    title,
    created_at: now,
    updated_at: now,
  };
}

function getConversationById(conversationId) {
  const stmt = db.prepare(`
    SELECT *
    FROM conversations
    WHERE id = ?
  `);

  return stmt.get(conversationId);
}

function updateConversationTimestamp(conversationId) {
  const stmt = db.prepare(`
    UPDATE conversations
    SET updated_at = ?
    WHERE id = ?
  `);

  stmt.run(nowIso(), conversationId);
}

function createMessage({
  conversationId,
  role,
  content,
  model = null,
  inputTokens = null,
  outputTokens = null,
  latencyMs = null,
  metadata = null,
}) {
  const id = generateId("msg");
  const createdAt = nowIso();

  const stmt = db.prepare(`
    INSERT INTO messages (
      id,
      conversation_id,
      role,
      content,
      model,
      input_tokens,
      output_tokens,
      latency_ms,
      metadata,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    conversationId,
    role,
    content,
    model,
    inputTokens,
    outputTokens,
    latencyMs,
    metadata ? JSON.stringify(metadata) : null,
    createdAt
  );

  updateConversationTimestamp(conversationId);

  return {
    id,
    conversation_id: conversationId,
    role,
    content,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    latency_ms: latencyMs,
    metadata,
    created_at: createdAt,
  };
}

function getMessagesByConversationId(conversationId) {
  const stmt = db.prepare(`
    SELECT *
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `);

  const rows = stmt.all(conversationId);

  return rows.map((row) => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  }));
}

function getConversationsBySessionId(sessionId) {
  const stmt = db.prepare(`
    SELECT *
    FROM conversations
    WHERE session_id = ?
    ORDER BY updated_at DESC
  `);

  return stmt.all(sessionId);
}

/**
 * RAG 인덱싱용 문서 embedding
 */
const embedTextForIndexing = llmobs.wrap(
  { kind: "embedding", name: "embed_document_chunk" },
  async function embedTextForIndexing({ text, chunkId, docId }) {
    const safeText = String(text ?? "");

    const response = await client.embeddings.create({
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

/**
 * LLMObs spans
 */
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
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      localTime: new Date().toLocaleString(),
      epochMs: Date.now(),
    };

    llmobs.annotate(undefined, {
      inputData: "current local server time",
      outputData: JSON.stringify(result),
    });

    return result;
  }
);

/**
 * Query embedding 생성
 */
const embedUserQuery = llmobs.wrap(
  { kind: "embedding", name: "embed_user_query" },
  async function embedUserQuery(query) {
    const safeQuery = String(query ?? "");

    const response = await client.embeddings.create({
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
  function retrieveRelevantChunks({ query, queryEmbedding, topK = 3 }) {
    const safeQuery = String(query ?? "");

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
  ];
}

/**
 * 헬스체크
 */
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

/**
 * 대화 목록 조회
 */
app.get("/conversations", (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const conversations = getConversationsBySessionId(sessionId);
    return res.json({ conversations });
  } catch (error) {
    console.error("conversations error:", error);
    return res.status(500).json({
      error: error?.message || "internal server error",
    });
  }
});

/**
 * 특정 대화 메시지 조회
 */
app.get("/conversations/:conversationId/messages", (req, res) => {
  try {
    const { conversationId } = req.params;
    const messages = getMessagesByConversationId(conversationId);

    return res.json({ messages });
  } catch (error) {
    console.error("conversation messages error:", error);
    return res.status(500).json({
      error: error?.message || "internal server error",
    });
  }
});

/**
 * 채팅
 */
app.post("/chat", async (req, res) => {
  try {
    const { sessionId, conversationId, message } = req.body ?? {};

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    logger.info("chat_request_started", {
      session_id: sessionId,
      conversation_id: conversationId || "new",
      message_preview: String(message).slice(0, 120),
    });

    let conversation;

    if (conversationId) {
      conversation = getConversationById(conversationId);

      if (!conversation) {
        return res.status(404).json({ error: "conversation not found" });
      }
    } else {
      conversation = createConversation({
        sessionId,
        title: String(message).slice(0, 30),
      });
    }

    const activeSpan = tracer.scope().active();
    if (activeSpan) {
      activeSpan.setTag("app.session_id", sessionId);
      activeSpan.setTag("app.conversation_id", conversation.id);
      activeSpan.setTag("app.feature", "chat");
    }

    const result = await llmobs.trace(
      {
        kind: "agent",
        name: "chat_agent",
        sessionId,
        mlApp: ML_APP,
      },
      async () => {
        const workflowResult = await llmobs.trace(
          {
            kind: "workflow",
            name: "process_chat_request",
            sessionId,
            mlApp: ML_APP,
          },
          async () => {
            createMessage({
              conversationId: conversation.id,
              role: "user",
              content: String(message),
              metadata: {
                source: "web",
              },
            });

            const history = getMessagesByConversationId(conversation.id);

            const recentHistory = history
              .filter((msg) => msg.role === "user" || msg.role === "assistant")
              .slice(-8);

            const llmMessages = [
              {
                role: "system",
                content: `
You are a helpful assistant for a Datadog demo application.

IMPORTANT RULES:
- If the user asks about current time, you MUST use the get_current_time tool.
- Do NOT generate time yourself.
- Always prefer using tools when available.
- Use retrieved context if provided.
`,
              },
              ...recentHistory.map((msg) => ({
                role: msg.role,
                content: msg.content,
              })),
            ];

            const intent = classifyUserIntent(String(message));

            logger.info("chat_intent_classified", {
              session_id: sessionId,
              conversation_id: conversation.id,
              need_time_tool: intent.needTimeTool,
              need_docs: intent.needDocs,
            });

            let retrievedChunks = [];

            if (intent.needDocs) {
              logger.info("chat_before_query_embedding", {
                session_id: sessionId,
                conversation_id: conversation.id,
                message_preview: String(message).slice(0, 120),
              });

              const queryEmbedding = await embedUserQuery(String(message));

              logger.info("chat_after_query_embedding", {
                session_id: sessionId,
                conversation_id: conversation.id,
                embedding_length: queryEmbedding.length,
              });

              retrievedChunks = retrieveRelevantChunks({
                query: String(message),
                queryEmbedding,
                topK: RAG_TOP_K,
              });

              logger.info("chat_retrieval_completed", {
                session_id: sessionId,
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
                        `${idx + 1}. ${chunk.docId}\n${chunk.text}\n(score: ${chunk.score.toFixed(4)})`
                    )
                    .join("\n\n")
                : "";

            const firstStartedAt = Date.now();

            const firstCompletion = await client.chat.completions.create({
              model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
              messages: [
                ...llmMessages,
                ...(docsContext
                  ? [{ role: "system", content: docsContext }]
                  : []),
              ],
              tools: buildToolDefinitions(),
              tool_choice: "auto",
            });

            const firstLatencyMs = Date.now() - firstStartedAt;

            const firstMessage = firstCompletion.choices?.[0]?.message;
            const toolCalls = firstMessage?.tool_calls || [];

            let finalModel = firstCompletion.model;
            let finalPromptTokens = firstCompletion.usage?.prompt_tokens ?? null;
            let finalCompletionTokens =
              firstCompletion.usage?.completion_tokens ?? null;
            let finalLatencyMs = firstLatencyMs;
            let answer = firstMessage?.content || "응답이 비어 있습니다.";

            if (toolCalls.length > 0) {
              const secondMessages = [
                ...llmMessages,
                ...(docsContext
                  ? [{ role: "system", content: docsContext }]
                  : []),
                {
                  role: "assistant",
                  content: firstMessage.content || "",
                  tool_calls: toolCalls,
                },
              ];

              const executedToolKeys = new Set();

              for (const toolCall of toolCalls) {
                const toolName = toolCall.function?.name;
                const parsedArgs = safeJsonParse(
                  toolCall.function?.arguments || "{}"
                );
                const toolKey = `${toolName}:${JSON.stringify(parsedArgs)}`;

                if (executedToolKeys.has(toolKey)) {
                  continue;
                }
                executedToolKeys.add(toolKey);

                let toolResult;

                if (toolName === "get_current_time") {
                  toolResult = getCurrentTimeTool();
                } else {
                  toolResult = { error: `Unknown tool: ${toolName}` };
                }

                logger.info("chat_tool_executed", {
                  session_id: sessionId,
                  conversation_id: conversation.id,
                  tool_name: toolName,
                  tool_args: parsedArgs,
                });

                createMessage({
                  conversationId: conversation.id,
                  role: "tool",
                  content: JSON.stringify(toolResult),
                  metadata: {
                    tool_call_id: toolCall.id,
                    tool_name: toolName,
                    tool_args: parsedArgs,
                    source: "tool_execution",
                  },
                });

                secondMessages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: JSON.stringify(toolResult),
                });
              }

              const secondStartedAt = Date.now();

              const secondCompletion = await client.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
                messages: secondMessages,
              });

              finalLatencyMs = firstLatencyMs + (Date.now() - secondStartedAt);
              finalModel = secondCompletion.model;
              finalPromptTokens = secondCompletion.usage?.prompt_tokens ?? null;
              finalCompletionTokens =
                secondCompletion.usage?.completion_tokens ?? null;
              answer =
                secondCompletion.choices?.[0]?.message?.content ||
                "응답이 비어 있습니다.";
            }

            createMessage({
              conversationId: conversation.id,
              role: "assistant",
              content: answer,
              model: finalModel,
              inputTokens: finalPromptTokens,
              outputTokens: finalCompletionTokens,
              latencyMs: finalLatencyMs,
              metadata: {
                used_tools: toolCalls.length > 0,
                tool_names: toolCalls
                  .map((t) => t.function?.name)
                  .filter(Boolean),
                retrieved_chunk_ids: retrievedChunks.map((chunk) => chunk.id),
                retrieval_count: retrievedChunks.length,
              },
            });

            logger.info("chat_request_completed", {
              session_id: sessionId,
              conversation_id: conversation.id,
              model: finalModel,
              latency_ms: finalLatencyMs,
              prompt_tokens: finalPromptTokens,
              completion_tokens: finalCompletionTokens,
              used_tools: toolCalls.map((t) => t.function?.name).filter(Boolean),
              retrieval_count: retrievedChunks.length,
            });

            if (activeSpan) {
              activeSpan.setTag("app.llm.model", finalModel || "unknown");
              activeSpan.setTag("app.llm.latency_ms", finalLatencyMs);
              activeSpan.setTag("app.llm.input_tokens", finalPromptTokens ?? 0);
              activeSpan.setTag(
                "app.llm.output_tokens",
                finalCompletionTokens ?? 0
              );
              activeSpan.setTag("app.tool.used", toolCalls.length > 0);
              activeSpan.setTag("app.tool.count", toolCalls.length);
              activeSpan.setTag("app.retrieval.count", retrievedChunks.length);
              activeSpan.setTag("app.rag.embedding_model", EMBEDDING_MODEL);
              activeSpan.setTag("app.rag.chunk_size", RAG_CHUNK_SIZE);
              activeSpan.setTag("app.rag.chunk_overlap", RAG_CHUNK_OVERLAP);
              activeSpan.setTag("app.rag.top_k", RAG_TOP_K);
            }

            llmobs.annotate(undefined, {
              inputData: String(message),
              outputData: String(answer),
            });

            return {
              answer,
              finalModel,
              finalPromptTokens,
              finalCompletionTokens,
              finalLatencyMs,
              usedTools: toolCalls.map((t) => t.function?.name).filter(Boolean),
              retrievedChunks,
            };
          }
        );

        llmobs.annotate(undefined, {
          inputData: String(message),
          outputData: String(workflowResult.answer),
        });

        return workflowResult;
      }
    );

    return res.json({
      conversationId: conversation.id,
      text: result.answer,
      model: result.finalModel || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      promptTokens: result.finalPromptTokens,
      completionTokens: result.finalCompletionTokens,
      totalTokens:
        (result.finalPromptTokens ?? 0) + (result.finalCompletionTokens ?? 0),
      llmLatencyMs: result.finalLatencyMs,
      usedTools: result.usedTools,
      retrievalCount: result.retrievedChunks.length,
    });
  } catch (error) {
    console.error("chat error:", error);

    logger.error("chat_request_failed", {
      session_id: req.body?.sessionId || "unknown",
      conversation_id: req.body?.conversationId || "unknown",
      error_message: error.message,
      error_stack: error.stack,
    });

    const activeSpan = tracer.scope().active();
    if (activeSpan) {
      activeSpan.setTag("error", error);
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
  openai_model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  rag_chunk_size: RAG_CHUNK_SIZE,
  rag_chunk_overlap: RAG_CHUNK_OVERLAP,
  rag_top_k: RAG_TOP_K,
});

await initRAG();

app.listen(port, () => {
  logger.info("app_listening", {
    url: `http://localhost:${port}`,
  });
  console.log(`API listening on http://localhost:${port}`);
});