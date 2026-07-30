import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import cors from "cors";
import express from "express";

import {
  createCorsOptions,
  createResourceTimingMiddleware,
  createServerTimingMiddleware,
} from "../cors-config.mjs";

test("실제 HTTP 응답에 CORS, Resource Timing, 추적 헤더 설정이 적용된다", async () => {
  const app = express();
  const origin = "http://localhost:5173";

  app.use(createResourceTimingMiddleware("*"));
  app.use(createServerTimingMiddleware());
  app.use(cors(createCorsOptions([origin])));
  app.get("/health", (req, res) => res.json({ ok: true }));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/health`;

  try {
    const response = await fetch(url, {
      headers: {
        Origin: origin,
      },
    });
    const preflight = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers":
          "traceparent,x-datadog-trace-id,x-request-id",
      },
    });

    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("timing-allow-origin"), "*");
    assert.match(response.headers.get("server-timing"), /^app;dur=/);
    assert.equal(preflight.status, 204);
    assert.match(
      preflight.headers.get("access-control-allow-headers"),
      /traceparent/i
    );
    assert.match(
      preflight.headers.get("access-control-allow-headers"),
      /x-datadog-trace-id/i
    );
    assert.match(
      preflight.headers.get("access-control-allow-headers"),
      /x-request-id/i
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
