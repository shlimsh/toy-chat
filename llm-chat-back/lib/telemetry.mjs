import tracer from "dd-trace";
import { serializeTelemetry } from "../telemetry-sanitizer.mjs";

const SPAN_BODY_TAG_MAX = Number(process.env.SPAN_BODY_TAG_MAX || 8192);

export function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function truncateForSpan(value) {
  if (typeof value !== "string") return value;
  if (value.length <= SPAN_BODY_TAG_MAX) return value;

  return `${value.slice(0, SPAN_BODY_TAG_MAX)}...[truncated ${
    value.length - SPAN_BODY_TAG_MAX
  } chars]`;
}

function serializeForSpan(body) {
  return truncateForSpan(
    serializeTelemetry(body, { maxStringLength: SPAN_BODY_TAG_MAX })
  );
}

export function setRequestBodyOnSpan(span, body) {
  if (!span) return;
  span.setTag("http.request.body", serializeForSpan(body));
}

export function setResponseBodyOnSpan(span, body) {
  if (!span) return;
  span.setTag("http.response.body", serializeForSpan(body));
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

