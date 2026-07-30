import assert from "node:assert/strict";
import test from "node:test";

import {
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

