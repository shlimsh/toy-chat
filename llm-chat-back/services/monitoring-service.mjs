function todayRangeSecKst(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name) => parts.find((item) => item.type === name)?.value;
  const from = new Date(
    `${part("year")}-${part("month")}-${part("day")}T00:00:00+09:00`
  );
  return {
    fromSec: Math.floor(from.getTime() / 1000),
    toSec: Math.floor(now.getTime() / 1000),
  };
}

function valueFromScope(scope, names, fallback = "unknown") {
  for (const name of names) {
    const match = String(scope).match(new RegExp(`${name}:([^,\\s]+)`));
    if (match?.[1]) return match[1];
  }
  return fallback;
}

function values(pointlist = []) {
  return pointlist
    .map((point) => point?.[1])
    .filter((value) => typeof value === "number" && Number.isFinite(value));
}

function average(items = []) {
  return items.length
    ? items.reduce((sum, value) => sum + value, 0) / items.length
    : null;
}

function total(items = []) {
  return items.reduce((sum, value) => sum + value, 0);
}

function percent(value) {
  return value == null || Number.isNaN(value)
    ? "-"
    : `${Number(value).toFixed(1)}%`;
}

function latency(value) {
  if (value == null || Number.isNaN(value)) return "-";
  const numeric = Number(value);
  return numeric < 1
    ? `${(numeric * 1000).toFixed(0)} ms`
    : `${numeric.toFixed(2)} s`;
}

function sessions(value) {
  if (value == null || Number.isNaN(value)) return "-";
  const count = Math.round(Number(value));
  return count === 1 ? "1 session" : `${count} sessions`;
}

export function topCpuHosts(result, limit = 3) {
  return (result.series || [])
    .map((series) => {
      const idleRaw = average(values(series.pointlist));
      const idle = idleRaw == null ? null : idleRaw <= 1 ? idleRaw * 100 : idleRaw;
      const usage = idle == null ? null : 100 - idle;
      return {
        host: valueFromScope(series.scope, ["host"]),
        value: usage,
        displayValue: percent(usage),
      };
    })
    .filter((item) => item.value != null)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function topMemoryHosts(result, limit = 3) {
  return (result.series || [])
    .map((series) => {
      const usableRaw = average(values(series.pointlist));
      const usable =
        usableRaw == null ? null : usableRaw <= 1 ? usableRaw * 100 : usableRaw;
      const usage = usable == null ? null : 100 - usable;
      return {
        host: valueFromScope(series.scope, ["host"]),
        value: usage,
        displayValue: percent(usage),
      };
    })
    .filter((item) => item.value != null)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function topLatencyResources(result, limit = 3) {
  return (result.series || [])
    .map((series) => {
      const value = average(values(series.pointlist));
      return {
        resource: valueFromScope(series.scope, ["resource_name", "resource"]),
        value,
        displayValue: latency(value),
      };
    })
    .filter((item) => item.value != null)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function topVisitorUsers(result, limit = 3) {
  return (result.series || [])
    .map((series) => {
      const value = total(values(series.pointlist));
      return {
        username: valueFromScope(
          series.scope,
          ["usr\\.name", "usr_name", "user\\.name", "name"]
        ),
        value,
        displayValue: sessions(value),
      };
    })
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export async function getMonitoringSummary(metricsApi, now = new Date()) {
  const { fromSec, toSec } = todayRangeSecKst(now);
  const [cpuResult, memoryResult, latencyResult, visitorsResult] =
    await Promise.all([
      metricsApi.queryMetrics({
        from: fromSec,
        to: toSec,
        query: "avg:system.cpu.idle{*} by {host}",
      }),
      metricsApi.queryMetrics({
        from: fromSec,
        to: toSec,
        query: "avg:system.mem.pct_usable{*} by {host}",
      }),
      metricsApi.queryMetrics({
        from: fromSec,
        to: toSec,
        query:
          "avg:trace.express.request.duration{env:dev,service:shlim-toy-chat-api} by {resource_name}",
      }),
      metricsApi.queryMetrics({
        from: fromSec,
        to: toSec,
        query: "sum:custom.user{*} by {usr.name}.as_count()",
      }),
    ]);

  const cpuHosts = topCpuHosts(cpuResult);
  const memoryHosts = topMemoryHosts(memoryResult);
  const latencyResources = topLatencyResources(latencyResult);
  const visitorsUsers = topVisitorUsers(visitorsResult);
  const visitorsTotal = total(
    (visitorsResult.series || []).flatMap((series) => values(series.pointlist))
  );

  return {
    range: {
      timezone: "Asia/Seoul",
      from: fromSec,
      to: toSec,
    },
    metrics: {
      cpu: cpuHosts[0]?.displayValue || "-",
      memory: memoryHosts[0]?.displayValue || "-",
      latency: latencyResources[0]?.displayValue || "-",
      visitors: `${Math.round(visitorsTotal)} sessions`,
    },
    details: {
      cpuHosts,
      memoryHosts,
      latencyResources,
      visitorsUsers,
    },
  };
}
