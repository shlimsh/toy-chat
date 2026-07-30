import {
  classifyServerError,
  sendApiError,
} from "../app-errors.mjs";
import { logApiError } from "../logger.mjs";
import { markSpanError } from "../lib/telemetry.mjs";

export function routeNotFound(req, res) {
  return sendApiError(req, res, "route_not_found");
}

export function globalErrorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const isInvalidJson =
    error instanceof SyntaxError &&
    error.status === 400 &&
    Object.prototype.hasOwnProperty.call(error, "body");
  const isCorsError = String(error?.message || "").includes(
    "not allowed by CORS"
  );
  const errorCode = isInvalidJson
    ? "invalid_json"
    : isCorsError
    ? "cors_not_allowed"
    : classifyServerError(error, "internal_server_error");

  logApiError({
    req,
    event: "unhandled_api_error",
    error,
    userId: req.user?.userId,
    recoverable: errorCode !== "cors_not_allowed",
    metadata: { error_code: errorCode },
  });

  markSpanError(error, {
    "app.error.code": errorCode,
    "app.error.handled": true,
  });

  return sendApiError(req, res, errorCode);
}

