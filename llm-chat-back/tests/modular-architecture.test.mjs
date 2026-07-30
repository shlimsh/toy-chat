import test from "node:test";
import assert from "node:assert/strict";

import {
  createTrackedError,
  markSpanError,
} from "../lib/telemetry.mjs";
import { getMonitoringSummary } from "../services/monitoring-service.mjs";

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
