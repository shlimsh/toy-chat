import assert from "node:assert/strict";
import test from "node:test";

import { createFixedWindowRateLimiter } from "../rate-limit.mjs";

test("사용자별 SMS 요청 횟수를 독립적으로 제한한다", () => {
  let timestamp = 1_000;
  const limiter = createFixedWindowRateLimiter({
    windowMs: 60_000,
    max: 2,
    now: () => timestamp,
  });

  assert.equal(limiter.consume("user-a").allowed, true);
  assert.equal(limiter.consume("user-a").allowed, true);
  assert.equal(limiter.consume("user-a").allowed, false);
  assert.equal(limiter.consume("user-b").allowed, true);

  timestamp += 60_000;
  assert.equal(limiter.consume("user-a").allowed, true);
});
