function latestPerformanceEntry(url) {
  if (!globalThis.performance?.getEntriesByName) return null;

  const entries = globalThis.performance
    .getEntriesByName(url)
    .filter((entry) => entry.entryType === "resource");

  return entries.at(-1) || null;
}

function round(value) {
  return Number(Math.max(0, Number(value || 0)).toFixed(2));
}

export function enrichResourceTimingEvent(event) {
  if (event?.type !== "resource" || !event.resource?.url) return true;

  const entry = latestPerformanceEntry(event.resource.url);
  if (!entry) return true;

  const redirectMs = Math.max(0, entry.redirectEnd - entry.redirectStart);
  const dnsMs = Math.max(0, entry.domainLookupEnd - entry.domainLookupStart);
  const connectMs = Math.max(0, entry.connectEnd - entry.connectStart);
  const queueOrStalledMs = Math.max(
    0,
    entry.requestStart -
      entry.startTime -
      redirectMs -
      dnsMs -
      connectMs
  );
  const backendTiming = Array.from(entry.serverTiming || []).find(
    (item) => item.name === "app"
  );

  event.context = {
    ...(event.context || {}),
    resource_timing: {
      queue_or_stalled_ms: round(queueOrStalledMs),
      backend_app_ms: backendTiming ? round(backendTiming.duration) : undefined,
    },
  };

  return true;
}

