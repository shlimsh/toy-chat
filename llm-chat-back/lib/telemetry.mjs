import crypto from "node:crypto";
import tracer from "dd-trace";
import { serializeTelemetry } from "../telemetry-sanitizer.mjs";

const DEFAULT_SPAN_BODY_TAG_MAX = Number(
  process.env.SPAN_BODY_TAG_MAX || 8192
);

export function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function truncateForSpan(value, maxLength = DEFAULT_SPAN_BODY_TAG_MAX) {
  if (typeof value !== "string") return value;
  if (value.length <= maxLength) return value;

  return `${value.slice(0, maxLength)}...[truncated ${
    value.length - maxLength
  } chars]`;
}

function serializeForSpan(body, maxLength = DEFAULT_SPAN_BODY_TAG_MAX) {
  return truncateForSpan(
    serializeTelemetry(body, { maxStringLength: maxLength }),
    maxLength
  );
}

function hashText(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return undefined;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function setDefinedTags(span, tags) {
  for (const [key, value] of Object.entries(tags)) {
    if (value !== undefined && value !== null && value !== "") {
      span.setTag(key, value);
    }
  }
}

function bodyByteLength(body) {
  return Buffer.byteLength(serializeTelemetry(body), "utf8");
}

export function buildRequestBodyMetadata(body) {
  const message =
    body && typeof body === "object" && typeof body.message === "string"
      ? body.message
      : "";

  return {
    "http.request.body_size": bodyByteLength(body),
    "app.request.body_field_count":
      body && typeof body === "object" && !Array.isArray(body)
        ? Object.keys(body).length
        : undefined,
    "app.request.message_length": message.length || undefined,
    "app.request.message_sha256": hashText(message),
    "app.request.has_conversation_id": Boolean(body?.conversationId),
    "app.request.force_error": body?.forceError === true,
  };
}

export function buildResponseBodyMetadata(body) {
  const responses = Array.isArray(body?.responses) ? body.responses : [];
  const models = [
    ...new Set(
      responses
        .map((response) => response?.model)
        .filter(Boolean)
        .map(String)
    ),
  ];

  return {
    "http.response.body_size": bodyByteLength(body),
    "app.response.outcome": body?.status,
    "app.response.provider_count": responses.length || undefined,
    "app.response.models": models.length ? models.join(",") : undefined,
    "app.response.has_error": Boolean(body?.error),
  };
}

function setBodyTelemetry(
  span,
  body,
  {
    kind,
    mode = "metadata",
    maxLength = DEFAULT_SPAN_BODY_TAG_MAX,
  }
) {
  if (!span || mode === "off") return;

  const metadata =
    kind === "request"
      ? buildRequestBodyMetadata(body)
      : buildResponseBodyMetadata(body);
  setDefinedTags(span, metadata);

  if (mode === "full") {
    span.setTag(
      `http.${kind}.body`,
      serializeForSpan(body, maxLength)
    );
  }
}

export function setRequestBodyOnSpan(span, body, options = {}) {
  setBodyTelemetry(span, body, {
    ...options,
    kind: "request",
  });
}

export function setResponseBodyOnSpan(span, body, options = {}) {
  setBodyTelemetry(span, body, {
    ...options,
    kind: "response",
  });
}

export function markSpanError(error, extraTags = {}, spanOverride = null) {
  const span = spanOverride || tracer.scope().active();
  if (!span || !error) return;

  span.setTag("error", true);
  span.setTag("error.type", error.name || "Error");
  span.setTag("error.message", error.message || "unknown error");
  span.setTag("error.stack", error.stack || `${error.name || "Error"}: ${error.message || "unknown error"}`);

  for (const [key, value] of Object.entries(extraTags)) {
    if (value !== undefined && value !== null) {
      span.setTag(key, value);
    }
  }
}

export function createTrackedError({
  name = "Error",
  message,
  code,
  cause,
}) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.name = name;
  if (code) error.code = code;
  return error;
}
