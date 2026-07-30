import tracer from "dd-trace";

function normalizeError(error) {
  if (error instanceof Error) return error;
  return new Error(String(error ?? "unknown error"));
}

function setErrorTags(span, error, tags = {}) {
  if (!span) return;

  const normalized = normalizeError(error);

  span.setTag("error", true);
  span.setTag("error.type", normalized.name || "Error");
  span.setTag("error.message", normalized.message || "unknown error");
  span.setTag("error.stack", normalized.stack || "");
  span.setTag("app.error.handled", true);

  for (const [key, value] of Object.entries(tags)) {
    if (value !== undefined && value !== null && value !== "") {
      span.setTag(key, value);
    }
  }
}

export function recordErrorOnActiveSpan(error, tags = {}) {
  const span = tracer.scope().active();
  setErrorTags(span, error, tags);
  return span;
}

export function recordHandledErrorSpan(
  error,
  {
    name = "app.handled_error",
    resource = "handled_error",
    tags = {},
  } = {}
) {
  return tracer.trace(
    name,
    {
      resource,
      type: "custom",
    },
    (span) => {
      setErrorTags(span, error, tags);
    }
  );
}

export { normalizeError, setErrorTags };
