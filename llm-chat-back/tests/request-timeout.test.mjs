import assert from "node:assert/strict";
import test from "node:test";

import {
  RequestTimeoutError,
  withRequestTimeout,
} from "../request-timeout.mjs";

test("제한시간 안의 작업 결과를 그대로 반환한다", async () => {
  const result = await withRequestTimeout("quick", 100, async () => "ok");
  assert.equal(result, "ok");
});

test("제한시간을 넘긴 작업을 재시도 가능한 Timeout으로 변환한다", async () => {
  await assert.rejects(
    withRequestTimeout(
      "slow provider",
      10,
      (signal) =>
        new Promise((resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true }
          );
          setTimeout(resolve, 100);
        })
    ),
    (error) => {
      assert.ok(error instanceof RequestTimeoutError);
      assert.equal(error.code, "ETIMEDOUT");
      assert.equal(error.retryable, true);
      return true;
    }
  );
});

test("상위 요청 취소는 Timeout으로 오인하지 않는다", async () => {
  const parent = new AbortController();
  parent.abort(new Error("client disconnected"));

  await assert.rejects(
    withRequestTimeout(
      "cancelled",
      100,
      async (signal) => {
        if (signal.aborted) throw signal.reason;
      },
      parent.signal
    ),
    /client disconnected/
  );
});

test("작업이 AbortSignal을 처리하지 않아도 제한시간은 보장된다", async () => {
  const startedAt = Date.now();
  await assert.rejects(
    withRequestTimeout(
      "non abortable dependency",
      10,
      () => new Promise((resolve) => setTimeout(resolve, 100))
    ),
    RequestTimeoutError
  );
  assert.ok(Date.now() - startedAt < 80);
});
