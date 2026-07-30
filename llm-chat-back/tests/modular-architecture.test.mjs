import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import {
  createTrackedError,
  markSpanError,
} from "../lib/telemetry.mjs";
import { getMonitoringSummary } from "../services/monitoring-service.mjs";
import { registerHttpMiddleware } from "../middleware/http-observability.mjs";

test("handled authentication errors populate Datadog standard error fields", () => {
  const tags = new Map();
  const span = {
    setTag(key, value) {
      tags.set(key, value);
    },
  };
  const error = createTrackedError({
    name: "AuthenticationError",
    code: "invalid_password",
    message: "비밀번호가 올바르지 않습니다.",
  });

  markSpanError(
    error,
    {
      "app.error.code": error.code,
      "app.error.handled": true,
    },
    span
  );

  assert.equal(tags.get("error"), true);
  assert.equal(tags.get("error.type"), "AuthenticationError");
  assert.equal(tags.get("error.message"), "비밀번호가 올바르지 않습니다.");
  assert.match(tags.get("error.stack"), /AuthenticationError/);
  assert.equal(tags.get("app.error.code"), "invalid_password");
});

test("monitoring service maps Datadog series to UI summary values", async () => {
  const responses = [
    {
      series: [
        { scope: "host:api-1", pointlist: [[1, 0.8], [2, 0.7]] },
      ],
    },
    {
      series: [
        { scope: "host:api-1", pointlist: [[1, 0.25], [2, 0.3]] },
      ],
    },
    {
      series: [
        {
          scope: "resource_name:POST_/chat",
          pointlist: [[1, 0.42], [2, 0.58]],
        },
      ],
    },
    {
      series: [
        { scope: "usr.name:tester", pointlist: [[1, 2], [2, 3]] },
      ],
    },
  ];
  let callIndex = 0;
  const metricsApi = {
    async queryMetrics() {
      const response = responses[callIndex];
      callIndex += 1;
      return response;
    },
  };

  const result = await getMonitoringSummary(metricsApi);

  assert.equal(result.metrics.cpu, "25.0%");
  assert.equal(result.metrics.memory, "72.5%");
  assert.equal(result.metrics.latency, "500 ms");
  assert.equal(result.metrics.visitors, "5 sessions");
  assert.equal(result.details.latencyResources[0].resource, "POST_/chat");
});

test("CORS and Resource Timing headers survive the HTTP response", async () => {
  const previousCorsOrigin = process.env.CORS_ORIGIN;
  const previousTimingOrigin = process.env.RUM_TIMING_ALLOW_ORIGIN;
  process.env.CORS_ORIGIN = "http://localhost:5173";
  process.env.RUM_TIMING_ALLOW_ORIGIN = "http://localhost:5173";

  const app = express();
  registerHttpMiddleware(app, { express });
  app.get("/timed", (_req, res) => res.json({ ok: true }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}/timed`;
    const response = await fetch(url, {
      headers: { Origin: "http://localhost:5173" },
    });

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("timing-allow-origin"),
      "http://localhost:5173"
    );
    assert.match(response.headers.get("server-timing"), /^app;dur=\d/);

    const preflight = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers":
          "x-datadog-origin,x-datadog-parent-id,x-datadog-sampling-priority,x-datadog-trace-id,traceparent,tracestate",
      },
    });

    assert.equal(preflight.status, 204);
    assert.match(
      preflight.headers.get("access-control-allow-headers"),
      /x-datadog-trace-id/i
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    process.env.CORS_ORIGIN = previousCorsOrigin;
    process.env.RUM_TIMING_ALLOW_ORIGIN = previousTimingOrigin;
  }
});
