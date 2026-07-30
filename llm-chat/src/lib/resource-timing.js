function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundMilliseconds(value) {
  return Math.round(Math.max(0, value) * 1000) / 1000;
}

export function readResourceTiming(performanceEntry) {
  if (!performanceEntry) return null;

  const startTime = finiteNumber(performanceEntry.startTime);
  const fetchStart = finiteNumber(performanceEntry.fetchStart) || startTime;
  const requestStart = finiteNumber(performanceEntry.requestStart);
  const lastNetworkPhaseEnd = Math.max(
    fetchStart,
    finiteNumber(performanceEntry.domainLookupEnd),
    finiteNumber(performanceEntry.connectEnd)
  );
  const serverTimings = Array.from(performanceEntry.serverTiming || []);
  const backendApp = serverTimings.find((timing) => timing?.name === "app");
  const queueOrStalledMs =
    requestStart > 0
      ? roundMilliseconds(requestStart - lastNetworkPhaseEnd)
      : null;
  const backendAppMs = backendApp
    ? roundMilliseconds(finiteNumber(backendApp.duration))
    : null;

  if (queueOrStalledMs === null && backendAppMs === null) {
    return null;
  }

  return {
    queue_or_stalled_ms: queueOrStalledMs,
    backend_app_ms: backendAppMs,
    timing_source: "performance_resource_timing",
  };
}

export function enrichRumResourceTiming(event, context) {
  if (event?.type !== "resource") return true;

  const timing = readResourceTiming(context?.performanceEntry);
  if (!timing) return true;

  event.context = {
    ...(event.context || {}),
    resource_timing: timing,
  };

  return true;
}
