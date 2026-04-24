import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import crypto from "crypto";
import tracer from "dd-trace";
import logger from "./logger.mjs";
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

console.log("DD_GIT_REPOSITORY_URL =", process.env.DD_GIT_REPOSITORY_URL);
console.log("DD_GIT_COMMIT_SHA =", process.env.DD_GIT_COMMIT_SHA);
console.log("DD_SERVICE =", process.env.DD_SERVICE);
console.log("DD_VERSION =", process.env.DD_VERSION);
console.log("DD_ENV =", process.env.DD_ENV);
console.log("DD_TAGS =", process.env.DD_TAGS);

const app = express();
const llmobs = tracer.llmobs;
const ML_APP =
  process.env.DD_LLMOBS_ML_APP || process.env.DD_SERVICE || "shlim-toy-chat";

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const RAG_CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 1000);
const RAG_CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 150);
const RAG_TOP_K = Number(process.env.RAG_TOP_K || 3);

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
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 64);
}

function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return JSON.stringify({
      stringify_error: error.message,
    });
  }
}

function shouldUseTimeTool(message) {
  return /현재 시간|지금 시간|몇 시|시각|time/i.test(String(message));
}

function shouldUseDocs(message) {
  return String(message ?? "").trim().length > 0;
}

function setRequestBodyOnSpan(span, body) {
  if (!span) return;
  span.setTag("http.request.body", safeStringify(body));
}

function setResponseBodyOnSpan(span, body) {
  if (!span) return;
  span.setTag("http.response.body", safeStringify(body));
}

function markSpanError(error, extraTags = {}) {
  const span = tracer.scope().active();
  if (!span || !error) return;

  span.setTag("error", error);
  span.setTag("error.type", error.name || "Error");
  span.setTag("error.message", error.message || "unknown error");
  span.setTag("error.stack", error.stack || "");

  for (const [key, value] of Object.entries(extraTags)) {
    if (value !== undefined && value !== null) {
      span.setTag(key, value);
    }
  }
}

/**
 * 공통 request/response body 추적 middleware
 */
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
      const parsed =
        typeof body === "string" ? safeJsonParse(body, body) : body;
      setResponseBodyOnSpan(currentSpan, parsed);
      currentSpan.setTag("http.status_code", res.statusCode);
    }
    return originalSend(body);
  };

  next();
});

/**
 * DB 헬퍼
 */
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

async function getConversationById(conversationId) {
  const rows = await query(
    `
    SELECT id, user_id, title, created_at, updated_at
    FROM conversations
    WHERE id = ?
    LIMIT 1
    `,
    [conversationId]
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

/**
 * RAG
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

const embedUserQuery = llmobs.wrap(
  { kind: "embedding", name: "embed_user_query" },
  async function embedUserQuery(queryText) {
    const safeQuery = String(queryText ?? "");

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

/**
 * 헬스체크
 */
app.get("/health", (_req, res) => {
  return res.json({ ok: true });
});

/**
 * 인증
 */
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

    logger.info("auth_register_success", {
      user_id: user.id,
      email: user.email,
    });

    return res.json({
      token,
      user,
    });
  } catch (error) {
    logger.error("auth_register_failed", {
      error_message: error.message,
      error_stack: error.stack,
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
      return res.status(404).json({
        error: "user_not_found",
        message: "존재하지 않는 이메일입니다.",
      });
    }

    const matched = await comparePassword(String(password), user.password_hash);

    if (!matched) {
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

    logger.info("auth_login_success", {
      user_id: safeUser.id,
      email: safeUser.email,
    });

    return res.json({
      token,
      user: safeUser,
    });
  } catch (error) {
    logger.error("auth_login_failed", {
      error_message: error.message,
      error_stack: error.stack,
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
    logger.error("auth_me_failed", {
      user_id: req.user?.userId,
      error_message: error.message,
      error_stack: error.stack,
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

/**
 * 대화 목록 조회
 */
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
    logger.error("conversations_failed", {
      user_id: req.user?.userId,
      error_message: error.message,
      error_stack: error.stack,
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

/**
 * 특정 대화 메시지 조회
 */
app.get(
  "/conversations/:conversationId/messages",
  authRequired,
  async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user.userId;

      const conversation = await getConversationByIdForUser(conversationId, userId);

      if (!conversation) {
        return res.status(404).json({ error: "conversation not found" });
      }

      const messages = await getMessagesByConversationId(conversationId);

      logger.info("conversation_messages_request_success", {
        user_id: userId,
        conversation_id: conversationId,
        message_count: messages.length,
      });

      return res.json({ messages });
    } catch (error) {
      logger.error("conversation_messages_failed", {
        user_id: req.user?.userId,
        conversation_id: req.params?.conversationId,
        error_message: error.message,
        error_stack: error.stack,
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

/**
 * 채팅
 */
app.post("/chat", authRequired, async (req, res) => {
  const requestSpan = tracer.scope().active();
  const { conversationId, message, forceError } = req.body ?? {};
  const userId = req.user.userId;

  try {
    if (forceError === true) {
      const error = new Error("Intentional backend error for demo");

      if (requestSpan) {
        requestSpan.setTag("error", true);
        requestSpan.setTag("error.type", error.name);
        requestSpan.setTag("error.message", error.message);
        requestSpan.setTag("http.status_code", 500);
        requestSpan.setTag("app.error.handled", true);
      }

      logger.error("chat_request_failed", {
        user_id: userId,
        conversation_id: conversationId || "new",
        request_body: req.body,
        error_message: error.message,
        error_stack: error.stack,
      });

      return res.status(500).json({
        error: error.message,
      });
    }

    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    logger.info("chat_request_received", {
      user_id: userId,
      conversation_id: conversationId || "new",
      request_body: req.body,
    });

    let conversation;

    if (conversationId) {
      conversation = await getConversationByIdForUser(conversationId, userId);

      if (!conversation) {
        return res.status(404).json({ error: "conversation not found" });
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
      setRequestBodyOnSpan(activeSpan, req.body);

      if (req.body?.message) {
        activeSpan.setTag(
          "app.request.message",
          String(req.body.message).slice(0, 50)
        );
      }
    }

    const result = await llmobs.trace(
      {
        kind: "agent",
        name: "chat_agent",
        sessionId: String(userId),
        mlApp: ML_APP,
      },
      async () => {
        const workflowResult = await llmobs.trace(
          {
            kind: "workflow",
            name: "process_chat_request",
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
                `.trim(),
              },
              ...recentHistory.map((msg) => ({
                role: msg.role,
                content: msg.content,
              })),
            ];

            const intent = classifyUserIntent(String(message));

            logger.info("chat_intent_classified", {
              user_id: userId,
              conversation_id: conversation.id,
              need_time_tool: intent.needTimeTool,
              need_docs: intent.needDocs,
            });

            let retrievedChunks = [];

            if (intent.needDocs) {
              logger.info("chat_before_query_embedding", {
                user_id: userId,
                conversation_id: conversation.id,
                message_preview: String(message).slice(0, 120),
              });

              const queryEmbedding = await embedUserQuery(String(message));

              logger.info("chat_after_query_embedding", {
                user_id: userId,
                conversation_id: conversation.id,
                embedding_length: queryEmbedding.length,
              });

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
                        `${idx + 1}. ${chunk.docId}\n${chunk.text}\n(score: ${chunk.score.toFixed(4)})`
                    )
                    .join("\n\n")
                : "";

            const firstStartedAt = Date.now();

            const firstCompletion = await client.chat.completions.create({
              model: OPENAI_MODEL,
              messages: [
                ...llmMessages,
                ...(docsContext ? [{ role: "system", content: docsContext }] : []),
              ],
              tools: buildToolDefinitions(),
              tool_choice: "auto",
            });

            const firstLatencyMs = Date.now() - firstStartedAt;

            const firstMessage = firstCompletion.choices?.[0]?.message;
            const toolCalls = firstMessage?.tool_calls || [];

            let finalModel = firstCompletion.model;
            let finalPromptTokens = firstCompletion.usage?.prompt_tokens ?? 0;
            let finalCompletionTokens =
              firstCompletion.usage?.completion_tokens ?? 0;
            let finalLatencyMs = firstLatencyMs;
            let answer = firstMessage?.content || "응답이 비어 있습니다.";

            if (toolCalls.length > 0) {
              const secondMessages = [
                ...llmMessages,
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
                const parsedArgs = safeJsonParse(
                  toolCall.function?.arguments || "{}"
                );
                const toolKey = `${toolName}:${JSON.stringify(parsedArgs)}`;

                if (executedToolKeys.has(toolKey)) continue;
                executedToolKeys.add(toolKey);

                let toolResult;

                if (toolName === "get_current_time") {
                  toolResult = getCurrentTimeTool();
                } else {
                  toolResult = { error: `Unknown tool: ${toolName}` };
                }

                logger.info("chat_tool_executed", {
                  user_id: userId,
                  conversation_id: conversation.id,
                  tool_name: toolName,
                  tool_args: parsedArgs,
                  tool_result: toolResult,
                });

                await createMessage({
                  conversationId: conversation.id,
                  role: "tool",
                  content: JSON.stringify(toolResult),
                  metadata: {
                    tool_call_id: toolCall.id,
                    tool_name: toolName,
                    tool_args: parsedArgs,
                    source: "tool_execution",
                    user_id: userId,
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
                model: OPENAI_MODEL,
                messages: secondMessages,
              });

              finalLatencyMs = firstLatencyMs + (Date.now() - secondStartedAt);
              finalModel = secondCompletion.model;
              finalPromptTokens = secondCompletion.usage?.prompt_tokens ?? 0;
              finalCompletionTokens =
                secondCompletion.usage?.completion_tokens ?? 0;
              answer =
                secondCompletion.choices?.[0]?.message?.content ||
                "응답이 비어 있습니다.";
            }

            const assistantMessage = await createMessage({
              conversationId: conversation.id,
              role: "assistant",
              content: answer,
              metadata: {
                model: finalModel,
                input_tokens: finalPromptTokens,
                output_tokens: finalCompletionTokens,
                latency_ms: finalLatencyMs,
                used_tools: toolCalls.length > 0,
                tool_names: toolCalls
                  .map((t) => t.function?.name)
                  .filter(Boolean),
                retrieved_chunk_ids: retrievedChunks.map((chunk) => chunk.id),
                retrieval_count: retrievedChunks.length,
                user_id: userId,
              },
            });

            logger.info("chat_request_completed", {
              user_id: userId,
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
              activeSpan.setTag("app.llm.input_tokens", finalPromptTokens);
              activeSpan.setTag("app.llm.output_tokens", finalCompletionTokens);
              activeSpan.setTag("app.tool.used", toolCalls.length > 0);
              activeSpan.setTag("app.tool.count", toolCalls.length);
              activeSpan.setTag("app.retrieval.count", retrievedChunks.length);
              activeSpan.setTag("app.rag.embedding_model", EMBEDDING_MODEL);
              activeSpan.setTag("app.rag.chunk_size", RAG_CHUNK_SIZE);
              activeSpan.setTag("app.rag.chunk_overlap", RAG_CHUNK_OVERLAP);
              activeSpan.setTag("app.rag.top_k", RAG_TOP_K);
              activeSpan.setTag(
                "app.response.message",
                String(answer).slice(0, 100)
              );
            }

            llmobs.annotate(undefined, {
              inputData: String(message),
              outputData: answer,
              metadata: {
                message: answer,
              },
            });

            return {
              answer,
              assistantMessage,
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
          outputData: workflowResult.answer,
          metadata: {
            message: workflowResult.answer,
          },
        });

        return workflowResult;
      }
    );

    const totalTokens =
      Number(result.finalPromptTokens || 0) +
      Number(result.finalCompletionTokens || 0);

    const trace = {
      model: result.finalModel || OPENAI_MODEL,
      totalLatencyMs: result.finalLatencyMs,
      totalTokens,
      costEstimate: estimateCost({
        promptTokens: result.finalPromptTokens,
        completionTokens: result.finalCompletionTokens,
      }),
      promptTokens: result.finalPromptTokens,
      completionTokens: result.finalCompletionTokens,
      usedTools: result.usedTools,
      retrievalCount: result.retrievedChunks.length,
    };

    const responseBody = {
      conversationId: conversation.id,
      message: {
        id: result.assistantMessage?.id,
        role: "assistant",
        content: result.answer,
        created_at: result.assistantMessage?.created_at,
      },
      trace,
    };

    logger.info("chat_request_success", {
      user_id: userId,
      conversation_id: conversation.id,
      request_body: req.body,
      response_body: responseBody,
    });

    if (activeSpan) {
      setResponseBodyOnSpan(activeSpan, responseBody);
    }

    return res.json(responseBody);
  } catch (error) {
    logger.error("chat_request_failed", {
      user_id: userId,
      conversation_id: req.body?.conversationId || "new",
      request_body: req.body,
      error_message: error.message,
      error_stack: error.stack,
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
  rag_chunk_size: RAG_CHUNK_SIZE,
  rag_chunk_overlap: RAG_CHUNK_OVERLAP,
  rag_top_k: RAG_TOP_K,
});

await initDatabase();
await initRAG();

app.listen(port, () => {
  logger.info("app_listening", {
    url: `http://localhost:${port}`,
  });
  console.log(`API listening on http://localhost:${port}`);
});