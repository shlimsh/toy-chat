import { describe, expect, test } from "vitest";

import {
  enrichRumResourceTiming,
  readResourceTiming,
} from "./resource-timing.js";

describe("RUM Resource Timing 보강", () => {
  test("Datadog의 Unknown 구간을 queue_or_stalled_ms로 계산한다", () => {
    const timing = readResourceTiming({
      startTime: 100,
      fetchStart: 100.2,
      domainLookupEnd: 100.2,
      connectEnd: 100.2,
      requestStart: 102.1,
      serverTiming: [{ name: "app", duration: 6.45 }],
    });

    expect(timing).toEqual({
      queue_or_stalled_ms: 1.9,
      backend_app_ms: 6.45,
      timing_source: "performance_resource_timing",
    });
  });

  test("resource 이벤트에 계산된 타이밍 속성을 추가한다", () => {
    const event = { type: "resource", context: { existing: true } };

    expect(
      enrichRumResourceTiming(event, {
        performanceEntry: {
          startTime: 10,
          fetchStart: 10,
          connectEnd: 10,
          requestStart: 11,
          serverTiming: [],
        },
      })
    ).toBe(true);
    expect(event.context).toMatchObject({
      existing: true,
      resource_timing: {
        queue_or_stalled_ms: 1,
      },
    });
  });
});
