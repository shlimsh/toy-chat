import winston from "winston";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import tracer from "dd-trace";

const logDir = path.join(process.cwd(), "logs");



if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const SERVICE = process.env.DD_SERVICE || "shlim-toy-chat-api";
const ENV = process.env.DD_ENV || "dev";
const VERSION = process.env.DD_VERSION || "0.2.0";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

console.log("[LOGGER] cwd =", process.cwd());
console.log("[LOGGER] logDir =", logDir);
console.log("[LOGGER] service =", SERVICE);
console.log("[LOGGER] env =", ENV);
console.log("[LOGGER] version =", VERSION);

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix = "req") {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function getActiveTraceContext() {
  const span = tracer.scope().active();

  if (!span) return {};

  const context = span.context();

  return {
    dd: {
      trace_id: context.toTraceId(),
      span_id: context.toSpanId(),
      service: SERVICE,
      env: ENV,
      version: VERSION,
    },
  };
}

function safePreview(value, maxLength = 120) {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();

  if (!trimmed) return undefined;

  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength)}...`
    : trimmed;
}

function safeLength(value) {
  if (typeof value !== "string") return 0;
  return value.length;
}

function normalizeError(error) {
  if (!error) return undefined;

  const kind = error.name || "Error";
  const message = error.message || String(error);

  return {
    kind,
    name: kind,
    message,
    stack: error.stack || `${kind}: ${message}`,
    code: error.code,
    status_code: error.status || error.statusCode,
  };
}

function cleanUndefined(obj) {
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined);
  }

  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, cleanUndefined(value)])
  );
}

const enrichFormat = winston.format((info) => {
  Object.assign(info, {
    ...getActiveTraceContext(),
    service: SERVICE,
    env: ENV,
    version: VERSION,
    timestamp: info.timestamp || nowIso(),
  });

  return info;
});

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    enrichFormat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logDir, "app.log"),
      options: { flags: "a" },
    }),
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      options: { flags: "a" },
    }),
  ],
});

export function createRequestId() {
  return createId("req");
}

export function requestLogger(req, res, next) {
  const startedAt = Date.now();

  req.requestId =
    req.headers["x-request-id"] ||
    req.headers["x-correlation-id"] ||
    createRequestId();

  res.setHeader("x-request-id", req.requestId);

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;

    const userId = req.user?.userId || req.user?.id;
    const conversationId =
      req.body?.conversationId || req.params?.conversationId;

    const statusCode = res.statusCode;
    const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

    logger.log(level, "http_request_completed", {
      event: "http_request_completed",
      request_id: req.requestId,
      user_id: userId,
      conversation_id: conversationId,
      http: {
        method: req.method,
        path: req.path,
        original_url: req.originalUrl,
        route: req.route?.path,
        status_code: statusCode,
        duration_ms: durationMs,
        user_agent: req.headers["user-agent"],
        ip:
          req.headers["x-forwarded-for"] ||
          req.socket?.remoteAddress ||
          req.ip,
      },
    });
  });

  next();
}

export function logChatRequest({
  userId,
  conversationId,
  requestId,
  message,
  provider,
  model,
}) {
  logger.info("chat_request_received", {
    event: "chat_request_received",
    user_id: userId,
    conversation_id: conversationId || "new",
    request_id: requestId,
    provider,
    model,
    message: {
      input_length: safeLength(message),
      preview: safePreview(message),
    },
  });
}

export function logLlmStarted({
  userId,
  conversationId,
  requestId,
  provider,
  model,
}) {
  logger.info("llm_request_started", {
    event: "llm_request_started",
    user_id: userId,
    conversation_id: conversationId,
    request_id: requestId,
    provider,
    model,
  });
}

export function logLlmCompleted({
  userId,
  conversationId,
  requestId,
  provider,
  model,
  durationMs,
  usage,
  promptTokens,
  completionTokens,
  totalTokens,
  costEstimate,
  toolCalls,
  retrievalCount,
}) {
  const finalPromptTokens = usage?.prompt_tokens ?? promptTokens;
  const finalCompletionTokens = usage?.completion_tokens ?? completionTokens;
  const finalTotalTokens =
    usage?.total_tokens ??
    totalTokens ??
    Number(finalPromptTokens || 0) + Number(finalCompletionTokens || 0);

  logger.info("llm_request_completed", {
    event: "llm_request_completed",
    user_id: userId,
    conversation_id: conversationId,
    request_id: requestId,
    provider,
    model,
    llm: {
      duration_ms: durationMs,
      prompt_tokens: finalPromptTokens,
      completion_tokens: finalCompletionTokens,
      total_tokens: finalTotalTokens,
      cost_estimate: costEstimate,
      tool_call_count: Array.isArray(toolCalls) ? toolCalls.length : 0,
      retrieval_count: retrievalCount,
    },
  });
}

export function logLlmFailed({
  userId,
  conversationId,
  requestId,
  provider,
  model,
  stage,
  error,
}) {
  logger.error("llm_request_failed", {
    event: "llm_request_failed",
    user_id: userId,
    conversation_id: conversationId,
    request_id: requestId,
    provider,
    model,
    error: {
      stage,
      ...normalizeError(error),
    },
  });
}

export function logPersistenceFailed({
  userId,
  conversationId,
  requestId,
  provider,
  role,
  error,
}) {
  logger.error("chat_message_persistence_failed", {
    event: "chat_message_persistence_failed",
    user_id: userId,
    conversation_id: conversationId,
    request_id: requestId,
    provider,
    message_role: role,
    recoverable: true,
    error: normalizeError(error),
  });
}

export function logToolExecuted({
  userId,
  conversationId,
  requestId,
  provider,
  toolName,
  toolArgs,
  durationMs,
  success = true,
}) {
  logger.info("chat_tool_executed", {
    event: "chat_tool_executed",
    user_id: userId,
    conversation_id: conversationId,
    request_id: requestId,
    provider,
    tool: {
      name: toolName,
      success,
      duration_ms: durationMs,
      args: toolArgs,
    },
  });
}

export function logRetrievalCompleted({
  userId,
  conversationId,
  requestId,
  query,
  embeddingModel,
  chunkIds,
  scores,
}) {
  logger.info("chat_retrieval_completed", {
    event: "chat_retrieval_completed",
    user_id: userId,
    conversation_id: conversationId,
    request_id: requestId,
    retrieval: {
      query_length: safeLength(query),
      query_preview: safePreview(query),
      embedding_model: embeddingModel,
      count: Array.isArray(chunkIds) ? chunkIds.length : 0,
      chunk_ids: chunkIds,
      scores,
    },
  });
}

export function logAudit({
  userId,
  action,
  result = "success",
  target,
  metadata = {},
}) {
  logger.info("audit_event", {
    event: "audit_event",
    user_id: userId,
    audit: {
      action,
      result,
      target,
      ...metadata,
    },
  });
}

export function logSecurity({
  userId,
  action,
  result,
  reason,
  ip,
  userAgent,
}) {
  logger.warn("security_event", {
    event: "security_event",
    user_id: userId,
    security: {
      action,
      result,
      reason,
      ip,
      user_agent: userAgent,
    },
  });
}

export function logDbQuery({
  operation,
  table,
  durationMs,
  rows,
  error,
}) {
  if (error) {
    logger.error("db_query_failed", {
      event: "db_query_failed",
      db: {
        operation,
        table,
        duration_ms: durationMs,
        rows,
      },
      error: normalizeError(error),
    });
    return;
  }

  logger.info("db_query_completed", {
    event: "db_query_completed",
    db: {
      operation,
      table,
      duration_ms: durationMs,
      rows,
    },
  });
}

export function logError(message, error, metadata = {}) {
  logger.error(message, {
    event: message,
    ...metadata,
    error: normalizeError(error),
  });
}

export function logApiError({
  req,
  event,
  error,
  userId,
  conversationId,
  severity = "error",
  recoverable = false,
  reason,
  metadata = {},
}) {
  const payload = {
    event,
    request_id: req?.requestId,
    user_id: userId || req?.user?.userId || req?.user?.id,
    conversation_id:
      conversationId || req?.body?.conversationId || req?.params?.conversationId,
    recoverable,
    reason,
    http: {
      method: req?.method,
      path: req?.path,
      original_url: req?.originalUrl,
      ip: req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || req?.ip,
      user_agent: req?.headers?.["user-agent"],
    },
    error: normalizeError(error),
    ...metadata,
  };

  if (severity === "warn") {
    logger.warn(event, payload);
    return;
  }

  const span = tracer.scope().active();

  if (span && error) {
    const normalized = normalizeError(error);
    span.setTag("error", error);
    span.setTag("error.type", normalized.kind);
    span.setTag("error.msg", normalized.message);
    span.setTag("error.message", normalized.message);
    span.setTag("error.stack", normalized.stack);
    span.setTag("app.error.handled", true);

    if (event) {
      span.setTag("app.error.event", event);
    }

    if (reason) {
      span.setTag("app.error.reason", reason);
    }
  }

  logger.error(event, payload);
}

export function logApiWarn({
  req,
  event,
  userId,
  conversationId,
  reason,
  recoverable = true,
  metadata = {},
}) {
  logger.warn(event, {
    event,
    request_id: req?.requestId,
    user_id: userId || req?.user?.userId || req?.user?.id,
    conversation_id:
      conversationId || req?.body?.conversationId || req?.params?.conversationId,
    reason,
    recoverable,
    http: {
      method: req?.method,
      path: req?.path,
      original_url: req?.originalUrl,
      ip: req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || req?.ip,
      user_agent: req?.headers?.["user-agent"],
    },
    ...metadata,
  });
}

export function logApiInfo({
  req,
  event,
  userId,
  conversationId,
  metadata = {},
}) {
  logger.info(event, {
    event,
    request_id: req?.requestId,
    user_id: userId || req?.user?.userId || req?.user?.id,
    conversation_id:
      conversationId || req?.body?.conversationId || req?.params?.conversationId,
    http: {
      method: req?.method,
      path: req?.path,
      original_url: req?.originalUrl,
      ip:
        req?.headers?.["x-forwarded-for"] ||
        req?.socket?.remoteAddress ||
        req?.ip,
      user_agent: req?.headers?.["user-agent"],
    },
    ...metadata,
  });
}

export default logger;

logger.info("logger_initialized", {
  event: "logger_initialized",
});
