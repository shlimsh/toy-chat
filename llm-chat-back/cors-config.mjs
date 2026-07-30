const DEFAULT_DEV_ORIGINS = Object.freeze([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

export const DATADOG_TRACE_HEADERS = Object.freeze([
  "traceparent",
  "tracestate",
  "baggage",
  "x-datadog-origin",
  "x-datadog-parent-id",
  "x-datadog-sampling-priority",
  "x-datadog-trace-id",
  "x-datadog-tags",
]);

export function parseOrigins(value, fallback = DEFAULT_DEV_ORIGINS) {
  const origins = String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : [...fallback];
}

export function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true;
  return allowedOrigins.includes("*") || allowedOrigins.includes(origin);
}

export function createCorsOptions(allowedOrigins) {
  return {
    origin(origin, callback) {
      if (isOriginAllowed(origin, allowedOrigins)) {
        return callback(null, true);
      }

      const error = new Error(`Origin ${origin} not allowed by CORS`);
      error.code = "CORS_NOT_ALLOWED";
      return callback(error);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Accept",
      "Authorization",
      "Content-Type",
      "X-Request-ID",
      ...DATADOG_TRACE_HEADERS,
    ],
    exposedHeaders: ["X-Request-ID", "Server-Timing"],
    maxAge: 86400,
    optionsSuccessStatus: 204,
  };
}

export function createResourceTimingMiddleware(
  timingAllowOrigin =
    process.env.RUM_TIMING_ALLOW_ORIGIN ||
    process.env.CORS_ORIGIN ||
    DEFAULT_DEV_ORIGINS
) {
  const allowedTimingOrigins = Array.isArray(timingAllowOrigin)
    ? timingAllowOrigin
    : parseOrigins(timingAllowOrigin);

  return function resourceTimingHeaders(req, res, next) {
    const requestOrigin = req.headers?.origin;
    const resolvedOrigin = allowedTimingOrigins.includes("*")
      ? "*"
      : requestOrigin && allowedTimingOrigins.includes(requestOrigin)
      ? requestOrigin
      : allowedTimingOrigins.join(", ");

    if (resolvedOrigin) {
      res.setHeader("Timing-Allow-Origin", resolvedOrigin);
    }

    next();
  };
}

export function createServerTimingMiddleware({
  metricName = "app",
  description = "toy-chat backend",
} = {}) {
  return function serverTiming(req, res, next) {
    const startedAt = process.hrtime.bigint();
    const originalEnd = res.end;

    res.end = function endWithServerTiming(...args) {
      if (!res.headersSent) {
        const durationMs =
          Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const safeDescription = String(description).replaceAll('"', "'");

        res.setHeader(
          "Server-Timing",
          `${metricName};dur=${durationMs.toFixed(
            2
          )};desc="${safeDescription}"`
        );
      }

      return originalEnd.apply(this, args);
    };

    next();
  };
}

export { DEFAULT_DEV_ORIGINS };
