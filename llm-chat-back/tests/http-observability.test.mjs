import assert from "node:assert/strict";
import test from "node:test";

Object.assign(process.env, {
  CORS_ORIGIN: "http://localhost:5173",
  DD_VERSION: "0.2.3",
  JWT_SECRET: "test-secret",
  MYSQL_DATABASE: "toy_chat",
  MYSQL_HOST: "127.0.0.1",
  MYSQL_USER: "toy_chat_user",
  OPENAI_API_KEY: "test-openai-key",
  RUM_TIMING_ALLOW_ORIGIN: "http://localhost:5173",
});

const { default: express } = await import("express");
const { corsMiddleware, timingMiddleware } = await import(
  "../http-observability.mjs"
);

async function withServer(run) {
  const app = express();
  app.use(corsMiddleware);
  app.use(timingMiddleware);
  app.get("/resource", (_req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test("CORS preflight에서 Datadog Trace 헤더를 허용한다", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/resource`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers":
          "traceparent,baggage,x-datadog-trace-id,x-request-id",
      },
    });

    assert.equal(response.status, 204);
    const allowed = response.headers.get("access-control-allow-headers");
    assert.match(allowed, /traceparent/i);
    assert.match(allowed, /baggage/i);
    assert.match(allowed, /x-datadog-trace-id/i);
  });
});

test("실제 응답에 Timing-Allow-Origin과 Server-Timing을 함께 반환한다", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/resource`, {
      headers: { Origin: "http://localhost:5173" },
    });

    assert.equal(
      response.headers.get("timing-allow-origin"),
      "http://localhost:5173"
    );
    assert.match(response.headers.get("server-timing"), /^app;dur=\d/);
    assert.match(
      response.headers.get("access-control-expose-headers"),
      /server-timing/i
    );
  });
});
