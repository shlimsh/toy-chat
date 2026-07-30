import { datadogLogs } from "@datadog/browser-logs";
import { datadogRum } from "@datadog/browser-rum";

const EXPECTED_ERROR_CODES = new Set([
  "auth_required",
  "conversation_not_found",
  "email_already_exists",
  "email_required",
  "invalid_token",
  "message_required",
  "name_required",
  "route_not_found",
]);
const LOGIN_FAILURE_ERROR_CODES = new Set([
  "invalid_password",
  "user_not_found",
]);
const REPORTABLE_ERROR_CODES = new Set([
  "chat_unavailable",
  "database_unavailable",
  "forced_demo_error",
  "internal_server_error",
  "malformed_response",
  "monitoring_unavailable",
  "network_unavailable",
  "request_timeout",
]);

function createErrorId() {
  return (
    globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 12) ||
    `web_${Date.now().toString(36)}`
  );
}

function normalizeError(error) {
  if (error instanceof Error) return error;
  return new Error(String(error ?? "unknown frontend error"));
}

function compactContext(context = {}) {
  return Object.fromEntries(
    Object.entries(context).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  );
}

export function shouldReportError(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").toLowerCase();

  if (EXPECTED_ERROR_CODES.has(code)) return false;
  return (
    LOGIN_FAILURE_ERROR_CODES.has(code) ||
    REPORTABLE_ERROR_CODES.has(code) ||
    status === 0 ||
    status >= 500 ||
    code.startsWith("provider_")
  );
}

export function reportFrontendError(
  error,
  {
    source = "frontend",
    errorId,
    requestId,
    code,
    status,
    ...context
  } = {}
) {
  const normalized = normalizeError(error);
  const resolvedErrorId = errorId || requestId || createErrorId();
  const telemetryContext = compactContext({
    error_id: resolvedErrorId,
    request_id: requestId,
    error_code: code || error?.code,
    http_status_code: status || error?.status,
    error_source: source,
    ...context,
  });

  datadogRum.addError(normalized, telemetryContext);
  datadogLogs.logger.error(
    normalized.message,
    {
      event: "frontend_error",
      ...telemetryContext,
    },
    normalized
  );

  return resolvedErrorId;
}

export function reportApiError(error, context = {}) {
  const normalized = normalizeError(error);
  const code = String(error?.code || "request_failed").toLowerCase();
  const isLoginFailure = LOGIN_FAILURE_ERROR_CODES.has(code);

  if (isLoginFailure) {
    const requestId = error?.requestId || createErrorId();

    datadogRum.addAction("login_failed", {
      event: "frontend_api_failure",
      outcome: "expected_failure",
      request_id: requestId,
      error_code: code,
      http_status_code: Number(error?.status || 0),
      auth_outcome: "failure",
      auth_failure_reason: code,
      ...context,
    });

    return reportFrontendError(normalized, {
      source: "api",
      requestId,
      code,
      status: error?.status,
      event: "frontend_api_failure",
      outcome: "expected_failure",
      auth_outcome: "failure",
      auth_failure_reason: code,
      ...context,
    });
  }

  if (!shouldReportError(error)) {
    const requestId = error?.requestId || createErrorId();
    const telemetryContext = compactContext({
      event: "frontend_api_failure",
      outcome: "expected_failure",
      request_id: requestId,
      error_code: code,
      http_status_code: Number(error?.status || 0),
      ...context,
    });

    datadogLogs.logger.warn(normalized.message, telemetryContext);

    return requestId;
  }

  return reportFrontendError(error, {
    source: "api",
    requestId: error?.requestId,
    code: error?.code,
    status: error?.status,
    ...context,
  });
}

export { createErrorId, normalizeError };
