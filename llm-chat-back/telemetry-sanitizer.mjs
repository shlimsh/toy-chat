const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_PATTERN =
  /^(?:password|password_hash|passcode|pin|token|access_token|refresh_token|id_token|authorization|proxy-authorization|api[-_]?key|client[-_]?token|cookie|set-cookie|secret|jwt)$/i;

const BEARER_PATTERN = /\bBearer\s+[^\s,;]+/gi;
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{12,}\b/g;

function redactString(value) {
  return value
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(JWT_PATTERN, REDACTED)
    .replace(OPENAI_KEY_PATTERN, REDACTED);
}

export function sanitizeTelemetry(value, options = {}, state = undefined) {
  const {
    maxDepth = 8,
    maxArrayLength = 50,
    maxStringLength = 8192,
  } = options;

  const currentState =
    state || {
      depth: 0,
      seen: new WeakSet(),
    };

  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    const redacted = redactString(value);
    return redacted.length <= maxStringLength
      ? redacted
      : `${redacted.slice(0, maxStringLength)}...[truncated]`;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return String(value);

  if (currentState.depth >= maxDepth) return "[MAX_DEPTH]";
  if (currentState.seen.has(value)) return "[CIRCULAR]";

  currentState.seen.add(value);
  const nextState = {
    depth: currentState.depth + 1,
    seen: currentState.seen,
  };

  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, maxArrayLength)
      .map((item) => sanitizeTelemetry(item, options, nextState));

    if (value.length > maxArrayLength) {
      sanitized.push(`[${value.length - maxArrayLength} more items]`);
    }

    return sanitized;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeTelemetry(value.message, options, nextState),
      code: value.code,
    };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED
        : sanitizeTelemetry(item, options, nextState),
    ])
  );
}

export function serializeTelemetry(value, options = {}) {
  try {
    return JSON.stringify(sanitizeTelemetry(value, options));
  } catch (error) {
    return JSON.stringify({
      serialization_error: error?.message || "unknown error",
    });
  }
}

