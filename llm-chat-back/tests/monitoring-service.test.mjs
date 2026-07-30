import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonitoringQueries,
  getMonitoringSummary,
  topCpuHosts,
  topLatencyResources,
  topMemoryHosts,
  topVisitorUsers,
} from "../services/monitoring-service.mjs";

const series = (scope, value) => ({
  scope,
  pointlist: [[1, value]],
});

test("CPU와 Memory를 사용률 기준 Top 3으로 정렬한다", () => {
  const cpu = topCpuHosts({
    series: [
      series("host:a", 0.8),
      series("host:b", 0.2),
      series("host:c", 0.5),
      series("host:d", 0.1),
    ],
  });
  const memory = topMemoryHosts({
    series: [series("host:a", 0.7), series("host:b", 0.1)],
  });

  assert.deepEqual(cpu.map((item) => item.host), ["d", "b", "c"]);
  assert.equal(memory[0].host, "b");
  assert.equal(memory[0].displayValue, "90.0%");
});

test("Latency는 resource_name 기준이며 ms와 s를 구분한다", () => {
  const result = topLatencyResources({
    series: [
      series("resource_name:GET_/health", 0.04),
      series("resource_name:POST_/chat", 1.25),
    ],
  });

  assert.equal(result[0].resource, "POST_/chat");
  assert.equal(result[0].displayValue, "1.25 s");
  assert.equal(result[1].displayValue, "40 ms");
});

test("Visitors는 사용자별 세션 합계로 정렬한다", () => {
  const result = topVisitorUsers({
    series: [
      series("usr.name:kim", 2),
      series("usr.name:lee", 5),
    ],
  });
  assert.equal(result[0].username, "lee");
  assert.equal(result[0].displayValue, "5 sessions");
});

test("APM과 RUM 쿼리는 환경설정의 service와 env를 사용한다", () => {
  const queries = buildMonitoringQueries({
    service: "custom-api",
    env: "staging",
    rumService: "custom-front",
    rumMetric: "rum.measure.session",
  });

  assert.match(
    queries.latency,
    /\{env:staging,service:custom-api\}/
  );
  assert.match(
    queries.visitors,
    /^sum:rum\.measure\.session\{env:staging,service:custom-front\}/
  );
});

test("일부 Datadog 쿼리가 실패해도 조회 가능한 지표를 반환한다", async () => {
  let call = 0;
  const metricsApi = {
    async queryMetrics() {
      call += 1;
      if (call === 3) throw new Error("latency unavailable");
      return {
        series: [series(call === 4 ? "usr.name:kim" : "host:api-1", 0.5)],
      };
    },
  };

  const result = await getMonitoringSummary(metricsApi);

  assert.equal(result.status, "partial");
  assert.deepEqual(result.unavailableMetrics, ["latency"]);
  assert.equal(result.availability.cpu, true);
  assert.equal(result.availability.latency, false);
  assert.equal(result.metrics.latency, "-");
  assert.equal(result.metrics.visitors, "1 sessions");
});

test("모든 Datadog 쿼리가 실패하면 전체 조회 오류로 처리한다", async () => {
  const metricsApi = {
    async queryMetrics() {
      throw new Error("Datadog unavailable");
    },
  };

  await assert.rejects(
    () => getMonitoringSummary(metricsApi),
    (error) =>
      error.code === "MONITORING_ALL_QUERIES_FAILED" &&
      error.failedMetrics.length === 4
  );
});
