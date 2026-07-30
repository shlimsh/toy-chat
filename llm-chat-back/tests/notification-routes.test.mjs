import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import express from "express";

Object.assign(process.env, {
  JWT_SECRET: "test-secret-that-is-long-enough",
});

const { signToken } = await import("../auth.mjs");
const { createFixedWindowRateLimiter } = await import("../rate-limit.mjs");
const { createNotificationRouter } = await import(
  "../routes/notification-routes.mjs"
);

async function withServer(router, run) {
  const app = express();
  app.use(express.json());
  app.use("/api/notifications", router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("SMS API는 인증을 요구하고 사용자별 Rate Limit을 적용한다", async () => {
  let sendCount = 0;
  const smsService = {
    async sendManagerNotification() {
      sendCount += 1;
      return { ok: true, status: "accepted" };
    },
  };
  const limiter = createFixedWindowRateLimiter({
    windowMs: 60_000,
    max: 1,
  });
  const router = createNotificationRouter({ smsService, limiter });
  const token = signToken({
    id: "user-1",
    email: "user@example.com",
    name: "Tester",
  });

  await withServer(router, async (baseUrl) => {
    const unauthorized = await fetch(
      `${baseUrl}/api/notifications/sms`,
      { method: "POST" }
    );
    assert.equal(unauthorized.status, 401);

    const accepted = await fetch(
      `${baseUrl}/api/notifications/sms`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    assert.equal(accepted.status, 202);
    assert.equal(sendCount, 1);

    const limited = await fetch(
      `${baseUrl}/api/notifications/sms`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    assert.equal(sendCount, 1);
  });
});
