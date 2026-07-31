import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRequestBodyMetadata,
  buildResponseBodyMetadata,
  setRequestBodyOnSpan,
} from "../lib/telemetry.mjs";

function tagCollector() {
  const tags = new Map();
  return {
    tags,
    span: {
      setTag(key, value) {
        tags.set(key, value);
      },
    },
  };
}

test("기본 Span 본문 메타데이터는 원문 대신 길이와 해시만 만든다", () => {
  const body = {
    conversationId: "conv-1",
    message: "Datadog RUM 세션을 설명해 주세요.",
    password: "must-not-leak",
  };
  const metadata = buildRequestBodyMetadata(body);

  assert.equal(metadata["app.request.message_length"], body.message.length);
  assert.match(metadata["app.request.message_sha256"], /^[a-f0-9]{64}$/);
  assert.equal(metadata["app.request.has_conversation_id"], true);
  assert.doesNotMatch(JSON.stringify(metadata), /Datadog RUM|must-not-leak/);
});

test("본문이 없는 GET 요청은 body_size 0으로 처리한다", () => {
  const metadata = buildRequestBodyMetadata(undefined);

  assert.equal(metadata["http.request.body_size"], 0);
  assert.equal(metadata["app.request.body_field_count"], undefined);
  assert.equal(metadata["app.request.message_length"], undefined);
  assert.equal(metadata["app.request.has_conversation_id"], false);
});

test("응답 메타데이터는 Provider 수와 모델만 보존한다", () => {
  const metadata = buildResponseBodyMetadata({
    status: "success",
    responses: [
      { model: "gpt-5-mini", content: "private answer" },
      { model: "grok-4.3", content: "another answer" },
    ],
  });

  assert.equal(metadata["app.response.provider_count"], 2);
  assert.equal(metadata["app.response.models"], "gpt-5-mini,grok-4.3");
  assert.doesNotMatch(JSON.stringify(metadata), /private answer/);
});

test("metadata 모드는 http.request.body 원문 태그를 만들지 않는다", () => {
  const { span, tags } = tagCollector();

  setRequestBodyOnSpan(
    span,
    { message: "secret prompt" },
    { mode: "metadata" }
  );

  assert.equal(tags.has("http.request.body"), false);
  assert.equal(tags.get("app.request.message_length"), 13);
});

test("full 모드는 개발 검증용으로 Sanitized 본문 태그를 만든다", () => {
  const { span, tags } = tagCollector();

  setRequestBodyOnSpan(
    span,
    { message: "hello", password: "secret" },
    { mode: "full", maxLength: 512 }
  );

  assert.match(tags.get("http.request.body"), /hello/);
  assert.match(tags.get("http.request.body"), /\[REDACTED\]/);
  assert.doesNotMatch(tags.get("http.request.body"), /"password":"secret"/);
});
