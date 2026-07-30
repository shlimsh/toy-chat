import tracer from "dd-trace";

function normalizedError(error) {
  if (error instanceof Error) return error;

  const normalized = new Error(
    typeof error === "string" ? error : "Unknown backend error"
  );
  normalized.name = "BackendError";
  return normalized;
}

export function markSpanError(span, error, extraTags = {}) {
  if (!span || !error) return;

  const normalized = normalizedError(error);
  const type = normalized.name || "Error";
  const message = normalized.message || "unknown error";
  const stack = normalized.stack || `${type}: ${message}`;

  // dd-trace의 Error 객체 처리와 Datadog 표준 오류 필드를 모두 기록한다.
  span.setTag("error", normalized);
  span.setTag("error.type", type);
  span.setTag("error.msg", message);
  span.setTag("error.message", message);
  span.setTag("error.stack", stack);

  for (const [key, value] of Object.entries(extraTags)) {
    if (value !== undefined && value !== null) {
      span.setTag(key, value);
    }
  }
}

export function markActiveSpanError(error, extraTags = {}) {
  markSpanError(tracer.scope().active(), error, extraTags);
}

export async function traceOperation(
  { name, resource, type = "custom", tags = {} },
  operation
) {
  return tracer.trace(
    name,
    {
      resource,
      type,
      tags,
    },
    async (span) => {
      try {
        const result = await operation();
        span.setTag("app.operation.outcome", "success");
        return result;
      } catch (error) {
        markSpanError(span, error, {
          "app.operation.outcome": "failed",
          "app.error.handled": true,
        });
        throw error;
      }
    }
  );
}

export async function traceProviderOperation(
  { provider, model, requestId, conversationId },
  operation
) {
  return traceOperation(
    {
      name: "llm.provider.request",
      resource: `${provider} ${model}`,
      type: "custom",
      tags: {
        component: "toy-chat",
        "span.kind": "client",
        "llm.provider": provider,
        "llm.model": model,
        "app.request_id": requestId,
        "app.conversation_id": conversationId,
      },
    },
    async () => {
      const result = await operation();

      if (!String(result?.content || "").trim()) {
        const error = new Error(`${provider} returned an empty response`);
        error.name = "EmptyProviderResponseError";
        error.code = "EMPTY_PROVIDER_RESPONSE";
        throw error;
      }

      return result;
    }
  );
}

export function createAuthenticationError(message, code) {
  const error = new Error(message);
  error.name = "AuthenticationError";
  error.code = code;
  return error;
}
