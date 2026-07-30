function isSuccessfulResponse(response) {
  if (!response) return false;
  if (response.status) return response.status === "success";
  return !response.trace?.error;
}

function normalizeFailure(response) {
  return {
    provider: response?.provider || "Unknown",
    model: response?.model || "unknown",
    code:
      response?.error?.code ||
      response?.trace?.errorCode ||
      "provider_request_failed",
    message:
      response?.error?.message ||
      response?.trace?.error ||
      "AI provider request failed",
    retryable: Boolean(
      response?.error?.retryable ?? response?.trace?.retryable
    ),
  };
}

export function summarizeProviderResponses(responses = []) {
  const normalized = Array.isArray(responses) ? responses : [];
  const successful = normalized.filter(isSuccessfulResponse);
  const failed = normalized.filter((response) => !isSuccessfulResponse(response));

  const status =
    successful.length === normalized.length && normalized.length > 0
      ? "success"
      : successful.length > 0
      ? "partial_success"
      : "failed";

  return {
    status,
    totalCount: normalized.length,
    successCount: successful.length,
    failureCount: failed.length,
    successfulProviders: successful.map((response) => response.provider),
    failedProviders: failed.map((response) => response.provider),
    failures: failed.map(normalizeFailure),
  };
}

export class AllProvidersFailedError extends Error {
  constructor(summary) {
    const failures = Array.isArray(summary?.failures) ? summary.failures : [];
    const detail =
      failures.length > 0
        ? failures
            .map((failure) => `${failure.provider} (${failure.code})`)
            .join(", ")
        : "no provider response";

    super(`All AI providers failed: ${detail}`);
    this.name = "AllProvidersFailedError";
    this.code = "ALL_PROVIDERS_FAILED";
    this.statusCode = 503;
    this.providerSummary = summary;
  }
}

export function requireProviderSuccess(responses = []) {
  const summary = summarizeProviderResponses(responses);

  if (summary.successCount === 0) {
    throw new AllProvidersFailedError(summary);
  }

  return summary;
}

export function selectCompatibilityResponse(responses = []) {
  return responses.find(isSuccessfulResponse) || null;
}

export { isSuccessfulResponse };
