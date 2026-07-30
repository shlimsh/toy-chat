import assert from "node:assert/strict";
import test from "node:test";

import { markSpanError } from "../span-utils.mjs";

test("명시적인 Span에 Datadog 표준 오류 필드를 모두 기록한다", () => {
  const tags = new Map();
  const span = {
    setTag(key, value) {
      tags.set(key, value);
    },
  };
  const error = new TypeError("provider payload is invalid");

  markSpanError(span, error, {
    "app.error.code": "provider_request_failed",
  });

  assert.equal(tags.get("error"), error);
  assert.equal(tags.get("error.type"), "TypeError");
  assert.equal(tags.get("error.msg"), "provider payload is invalid");
  assert.equal(tags.get("error.message"), "provider payload is invalid");
  assert.match(tags.get("error.stack"), /TypeError: provider payload is invalid/);
  assert.equal(
    tags.get("app.error.code"),
    "provider_request_failed"
  );
});

test("문자열 오류도 Stack을 가진 Error 객체로 정규화한다", () => {
  const tags = new Map();
  const span = {
    setTag(key, value) {
      tags.set(key, value);
    },
  };

  markSpanError(span, "plain backend failure");

  assert.equal(tags.get("error.type"), "BackendError");
  assert.equal(tags.get("error.message"), "plain backend failure");
  assert.match(tags.get("error.stack"), /BackendError: plain backend failure/);
});
