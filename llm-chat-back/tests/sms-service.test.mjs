import assert from "node:assert/strict";
import test from "node:test";

import { createSmsService } from "../services/sms-service.mjs";

test("SMS 서비스는 사용자 입력 없이 고정된 담당자 알림만 전송한다", async () => {
  let request;
  const service = createSmsService({
    endpoint: "https://example.test/send",
    timeoutMs: 1_000,
    async fetchImpl(url, options) {
      request = { url, options };
      return { ok: true, status: 202 };
    },
  });

  const result = await service.sendManagerNotification();

  assert.deepEqual(result, { ok: true, status: "accepted" });
  assert.equal(request.url, "https://example.test/send");
  assert.deepEqual(JSON.parse(request.options.body), {
    message: "담당자에게 문자 발송 요청",
  });
});

test("SMS endpoint가 없으면 안전한 설정 오류를 반환한다", async () => {
  const service = createSmsService({
    endpoint: "",
    timeoutMs: 1_000,
  });

  await assert.rejects(
    () => service.sendManagerNotification(),
    (error) => error.code === "SMS_NOT_CONFIGURED"
  );
});
