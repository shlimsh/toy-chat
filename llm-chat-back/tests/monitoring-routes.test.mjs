import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import express from "express";

Object.assign(process.env, {
  DD_VERSION: "0.2.3",
  JWT_SECRET: "test-secret-that-is-long-enough",
  MYSQL_DATABASE: "toy_chat",
  MYSQL_HOST: "127.0.0.1",
  MYSQL_USER: "toy_chat_user",
  OPENAI_API_KEY: "test-openai-key",
});

const { signToken } = await import("../auth.mjs");
const { createMonitoringRouter } = await import(
  "../routes/monitoring-routes.mjs"
);

async function withServer(router, run) {
  const app = express();
  app.use("/api/monitoring", router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("모니터링 API는 인증된 사용자에게만 요약을 반환한다", async () => {
  const metricsApi = {
    async queryMetrics() {
      return { series: [] };
    },
  };
  const router = createMonitoringRouter({ metricsApi });
  const token = signToken({
    id: "user-1",
    email: "user@example.com",
    name: "Tester",
  });

  await withServer(router, async (baseUrl) => {
    const unauthorized = await fetch(
      `${baseUrl}/api/monitoring/summary`
    );
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(
      `${baseUrl}/api/monitoring/summary`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const body = await authorized.json();

    assert.equal(authorized.status, 200);
    assert.equal(body.status, "success");
  });
});
