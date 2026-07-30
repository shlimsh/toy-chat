import assert from "node:assert/strict";
import test from "node:test";

import {
  AllProvidersFailedError,
  requireProviderSuccess,
  selectCompatibilityResponse,
  summarizeProviderResponses,
} from "../provider-outcomes.mjs";

const success = {
  provider: "Azure AI",
  model: "grok-4.3",
  status: "success",
  content: "정상 답변",
  trace: { totalTokens: 10 },
};

const failure = {
  provider: "OpenAI",
  model: "gpt-5-mini",
  status: "failed",
  content: "OpenAI 응답 실패",
  error: {
    code: "provider_timeout",
    message: "OpenAI 응답 시간이 초과되었습니다.",
    retryable: true,
  },
  trace: {
    error: "OpenAI 응답 시간이 초과되었습니다.",
    errorCode: "provider_timeout",
  },
};

test("하나의 제공자만 성공해도 partial_success로 판정한다", () => {
  const summary = requireProviderSuccess([failure, success]);

  assert.equal(summary.status, "partial_success");
  assert.equal(summary.successCount, 1);
  assert.equal(summary.failureCount, 1);
  assert.deepEqual(summary.successfulProviders, ["Azure AI"]);
  assert.deepEqual(summary.failedProviders, ["OpenAI"]);
});

test("호환용 message는 첫 번째 항목이 아니라 첫 성공 응답을 선택한다", () => {
  assert.equal(selectCompatibilityResponse([failure, success]), success);
});

test("두 제공자가 모두 실패하면 상세 원인이 있는 집계 오류를 발생시킨다", () => {
  const azureFailure = {
    ...failure,
    provider: "Azure AI",
    error: {
      code: "provider_auth_failed",
      message: "Azure AI 연결 설정을 확인해 주세요.",
      retryable: false,
    },
  };

  assert.throws(
    () => requireProviderSuccess([failure, azureFailure]),
    (error) => {
      assert.ok(error instanceof AllProvidersFailedError);
      assert.equal(error.code, "ALL_PROVIDERS_FAILED");
      assert.equal(error.statusCode, 503);
      assert.match(error.message, /OpenAI \(provider_timeout\)/);
      assert.match(error.message, /Azure AI \(provider_auth_failed\)/);
      assert.match(error.stack, /AllProvidersFailedError/);
      return true;
    }
  );
});

test("두 제공자가 모두 성공하면 success로 판정한다", () => {
  const summary = summarizeProviderResponses([
    { ...success, provider: "OpenAI" },
    success,
  ]);

  assert.equal(summary.status, "success");
  assert.equal(summary.successCount, 2);
  assert.equal(summary.failureCount, 0);
});
