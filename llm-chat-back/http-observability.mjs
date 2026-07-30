import cors from "cors";
import tracer from "dd-trace";

import { sendApiError } from "./app-errors.mjs";
import { config } from "./config.mjs";

const DATADOG_TRACE_HEADERS = [
  "authorization",
  "content-type",
  "x-request-id",
  "x-datadog-origin",
  "x-datadog-parent-id",
  "x-datadog-sampling-priority",
  "x-datadog-tags",
  "x-datadog-trace-id",
  "traceparent",
  "tracestate",
  "baggage",
];

function isAllowed(origin, allowed) {
  return !origin || allowed.includes("*") || allowed.includes(origin);
}

function timingAllowOrigin(req) {
  const origin = String(req.headers.origin || "");
  if (origin && isAllowed(origin, config.timingAllowOrigins)) return origin;
  if (config.timingAllowOrigins.includes("*")) return "*";
  return config.timingAllowOrigins[0];
}

export const corsMiddleware = cors({
  origin(origin, callback) {
    if (isAllowed(origin, config.corsOrigins)) return callback(null, true);
    const error = new Error(`Origin ${origin} not allowed by CORS`);
    error.code = "CORS_NOT_ALLOWED";
    return callback(error);
  },
  credentials: true,
  allowedHeaders: DATADOG_TRACE_HEADERS,
  exposedHeaders: ["x-request-id", "server-timing"],
  maxAge: 600,
});

export function timingMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint();
  let headersPrepared = false;

  const prepareHeaders = () => {
    if (headersPrepared) return;
    headersPrepared = true;

    const durationMs =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    res.setHeader("Timing-Allow-Origin", timingAllowOrigin(req));
    res.setHeader("Server-Timing", `app;dur=${durationMs.toFixed(2)}`);
    res.setHeader("Access-Control-Expose-Headers", "x-request-id, server-timing");

    const span = tracer.scope().active();
    if (span) {
      span.setTag("app.server_timing_ms", Number(durationMs.toFixed(2)));
    }
  };

  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = function patchedWriteHead(...args) {
    prepareHeaders();
    return originalWriteHead(...args);
  };

  res.once("finish", prepareHeaders);
  next();
}

export function createAvailabilityGate(runtimeState) {
  return function availabilityGate(req, res, next) {
    if (
      runtimeState.shuttingDown &&
      !req.path.startsWith("/health")
    ) {
      res.setHeader("Connection", "close");
      return sendApiError(req, res, "service_shutting_down");
    }
    return next();
  };
}

