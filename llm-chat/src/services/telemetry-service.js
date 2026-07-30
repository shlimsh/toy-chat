import { datadogLogs } from "@datadog/browser-logs";
import { datadogRum } from "@datadog/browser-rum";
import { ApiError } from "../lib/api-client.js";

function asError(error, fallbackMessage) {
  if (error instanceof Error) return error;
  return new Error(fallbackMessage || String(error || "Unknown error"));
}

export function reportFrontendError(
  error,
  {
    event = "frontend_error",
    feature = "unknown",
    requestId = error?.requestId || null,
    extra = {},
  } = {}
) {
  const normalized = asError(error, "프런트엔드 오류가 발생했습니다.");
  const context = {
    event,
    feature,
    error_code: error?.code || "frontend_error",
    request_id: requestId,
    error: {
      kind: normalized.name || "Error",
      message: normalized.message,
      stack: normalized.stack,
    },
    ...extra,
  };

  datadogRum.addError(normalized, context);
  datadogLogs.logger.error(normalized.message, context, normalized);
}

export function reportLoginFailure(error, mode) {
  if (!(error instanceof ApiError)) return;

  const context = {
    event: "auth_login_failed",
    feature: "auth",
    mode,
    error_code: error.code,
    request_id: error.requestId,
    http_status_code: error.status,
  };

  datadogRum.addAction("login_failed", context);
  reportFrontendError(error, {
    event: context.event,
    feature: context.feature,
    requestId: context.request_id,
    extra: {
      mode,
      error_code: error.code,
      http_status_code: error.status,
    },
  });
}

export function setTelemetryUser(user) {
  const safeUser = {
    id: String(user.id),
    email: user.email,
    name: user.name,
  };

  datadogRum.setUser(safeUser);
  datadogLogs.setUser(safeUser);
}

export function clearTelemetryUser() {
  datadogRum.clearUser();
  datadogLogs.clearUser();
}
