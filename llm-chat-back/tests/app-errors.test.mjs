import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyServerError,
  getErrorDefinition,
  sendApiError,
  toProviderUserError,
} from "../app-errors.mjs";

test("API 오류 응답은 사용자 메시지와 요청 ID를 표준 형식으로 반환한다", () => {
  let responseStatus = null;
  let responseBody = null;
  const req = { requestId: "req_test_123" };
  const res = {
    status(status) {
      responseStatus = status;
      return this;
    },
    json(body) {
      responseBody = body;
      return body;
    },
  };

  sendApiError(req, res, "invalid_token");

  assert.equal(responseStatus, 401);
  assert.deepEqual(responseBody, {
    error: "invalid_token",
    message: "로그인 시간이 만료되었습니다. 다시 로그인해 주세요.",
    retryable: false,
    requestId: "req_test_123",
  });
});

test("알 수 없는 오류 코드는 내부 메시지를 노출하지 않고 안전한 기본값을 쓴다", () => {
  const definition = getErrorDefinition("unknown_database_stack");

  assert.equal(definition.status, 500);
  assert.doesNotMatch(definition.message, /stack|database|sql/i);
});

test("데이터베이스 연결 오류를 사용자용 서비스 오류로 분류한다", () => {
  assert.equal(
    classifyServerError({ code: "ECONNREFUSED" }, "chat_unavailable"),
    "database_unavailable"
  );
});

test("LLM 제공자 오류는 원문 대신 상황별 안전한 메시지로 변환한다", () => {
  const rateLimit = toProviderUserError("OpenAI", {
    status: 429,
    message: "raw upstream quota detail",
  });
  const timeout = toProviderUserError("Azure AI", {
    code: "ETIMEDOUT",
    message: "socket timed out at private-host",
  });

  assert.equal(rateLimit.code, "provider_rate_limited");
  assert.equal(rateLimit.retryable, true);
  assert.match(rateLimit.message, /요청 한도/);
  assert.doesNotMatch(rateLimit.message, /quota/);

  assert.equal(timeout.code, "provider_timeout");
  assert.match(timeout.message, /응답 시간이 초과/);
  assert.doesNotMatch(timeout.message, /private-host/);
});
