import cors from "cors";
import tracer from "dd-trace";
import { requestLogger } from "../logger.mjs";
import {
  safeJsonParse,
  setRequestBodyOnSpan,
  setResponseBodyOnSpan,
} from "../lib/telemetry.mjs";

function parseOrigins(value) {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function createCorsMiddleware(allowedOrigins) {
  return cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.includes("*") ||
        allowedOrigins.includes(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    exposedHeaders: ["Server-Timing", "x-request-id"],
  });
}

function timingHeaders(allowedTimingOrigins) {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    const requestOrigin = req.headers.origin;
    const timingOrigin =
      allowedTimingOrigins.includes("*")
        ? "*"
        : requestOrigin && allowedTimingOrigins.includes(requestOrigin)
        ? requestOrigin
        : null;

    if (timingOrigin) {
      res.setHeader("Timing-Allow-Origin", timingOrigin);
    }

    const originalEnd = res.end;
    res.end = function patchedEnd(...args) {
      if (!res.headersSent) {
        const durationMs =
          Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        res.setHeader("Server-Timing", `app;dur=${durationMs.toFixed(2)}`);
      }

      return originalEnd.apply(this, args);
    };

    next();
  };
}

function spanBodyCapture(req, res, next) {
  const requestSpan = tracer.scope().active();

  if (requestSpan) {
    requestSpan.setTag("http.method", req.method);
    requestSpan.setTag("http.route.path", req.path);
    setRequestBodyOnSpan(requestSpan, req.body);
  }

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = function patchedJson(body) {
    const span = tracer.scope().active() || requestSpan;
    if (span) {
      setResponseBodyOnSpan(span, body);
      span.setTag("http.status_code", res.statusCode);
    }
    return originalJson(body);
  };

  res.send = function patchedSend(body) {
    const span = tracer.scope().active() || requestSpan;
    if (span) {
      const parsed = typeof body === "string" ? safeJsonParse(body, body) : body;
      setResponseBodyOnSpan(span, parsed);
      span.setTag("http.status_code", res.statusCode);
    }
    return originalSend(body);
  };

  next();
}

export function registerHttpMiddleware(app, { express }) {
  const allowedOrigins = parseOrigins(process.env.CORS_ORIGIN);
  const allowedTimingOrigins = parseOrigins(
    process.env.RUM_TIMING_ALLOW_ORIGIN || process.env.CORS_ORIGIN
  );

  if (allowedOrigins.length > 0) {
    app.use(createCorsMiddleware(allowedOrigins));
  }

  app.use(timingHeaders(allowedTimingOrigins));
  app.use(express.json({ limit: "1mb" }));
  app.use(requestLogger);
  app.use(spanBodyCapture);
}

