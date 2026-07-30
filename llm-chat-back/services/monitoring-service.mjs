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

function queryTagValue(value) {
  return String(value || "unknown").replace(/[{},\s]/g, "_");
}

function metricName(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z][A-Za-z0-9_.]*$/.test(normalized)
    ? normalized
    : "rum.measure.session";
}

export function buildMonitoringQueries({
  service,
  env,
  rumService,
  rumMetric,
}) {
  const backendScope = `env:${queryTagValue(env)},service:${queryTagValue(
    service
  )}`;
  const rumScope = `env:${queryTagValue(env)},service:${queryTagValue(
    rumService
  )}`;

  return {
    cpu: "avg:system.cpu.idle{*} by {host}",
    memory: "avg:system.mem.pct_usable{*} by {host}",
    latency:
      `avg:trace.express.request.duration{${backendScope}} by {resource_name}`,
    visitors:
      `sum:${metricName(rumMetric)}{${rumScope}} by {usr.name}.as_count()`,
  };
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

export async function getMonitoringSummary(
  metricsApi,
  {
    now = new Date(),
    service = "shlim-toy-chat-api",
    env = "dev",
    rumService = "shlim-toy-chat-front",
    rumMetric = "rum.measure.session",
  } = {}
) {
  const { fromSec, toSec } = todayRangeSecKst(now);
  const queries = buildMonitoringQueries({
    service,
    env,
    rumService,
    rumMetric,
  });
  const metricNames = Object.keys(queries);
  const settled = await Promise.allSettled(
    metricNames.map((name) =>
      metricsApi.queryMetrics({
        from: fromSec,
        to: toSec,
        query: queries[name],
      })
    )
  );
  const results = Object.fromEntries(
    metricNames.map((name, index) => [
      name,
      settled[index].status === "fulfilled"
        ? settled[index].value
        : { series: [] },
    ])
  );
  const availability = Object.fromEntries(
    metricNames.map((name, index) => [
      name,
      settled[index].status === "fulfilled",
    ])
  );
  const unavailableMetrics = metricNames.filter(
    (name) => !availability[name]
  );

  if (unavailableMetrics.length === metricNames.length) {
    const error = new Error("All monitoring metric queries failed");
    error.code = "MONITORING_ALL_QUERIES_FAILED";
    error.failedMetrics = unavailableMetrics;
    throw error;
  }

  const cpuHosts = topCpuHosts(results.cpu);
  const memoryHosts = topMemoryHosts(results.memory);
  const latencyResources = topLatencyResources(results.latency);
  const visitorsUsers = topVisitorUsers(results.visitors);
  const visitorsTotal = total(
    (results.visitors.series || []).flatMap((series) =>
      values(series.pointlist)
    )
  );

  return {
    status: unavailableMetrics.length > 0 ? "partial" : "success",
    availability,
    unavailableMetrics,
    range: {
      timezone: "Asia/Seoul",
      from: fromSec,
      to: toSec,
    },
    metrics: {
      cpu: cpuHosts[0]?.displayValue || "-",
      memory: memoryHosts[0]?.displayValue || "-",
      latency: latencyResources[0]?.displayValue || "-",
      visitors: availability.visitors
        ? `${Math.round(visitorsTotal)} sessions`
        : "-",
    },
    details: {
      cpuHosts,
      memoryHosts,
      latencyResources,
      visitorsUsers,
    },
  };
}
