import assert from "node:assert/strict";
import test from "node:test";

import { setErrorTags } from "../error-telemetry.mjs";

test("APM Error Tracking 필수 오류 속성을 모두 설정한다", () => {
  const tags = new Map();
  const span = {
    setTag(name, value) {
      tags.set(name, value);
    },
  };
  const error = new TypeError("provider response failed");

  setErrorTags(span, error, {
    "app.error.code": "provider_request_failed",
  });

  assert.equal(tags.get("error"), true);
  assert.equal(tags.get("error.type"), "TypeError");
  assert.equal(tags.get("error.message"), "provider response failed");
  assert.match(tags.get("error.stack"), /provider response failed/);
  assert.equal(tags.get("app.error.handled"), true);
});
