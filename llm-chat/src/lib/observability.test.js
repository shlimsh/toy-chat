import { beforeEach, describe, expect, it } from "vitest";

import { datadogLogs } from "@datadog/browser-logs";
import { datadogRum } from "@datadog/browser-rum";

import {
  initializeObservability,
  isTracedApplicationUrl,
} from "./observability.js";

describe("Browser SDK v7 observability configuration", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("keeps privacy, tracing, and browser log behavior explicit", () => {
    expect(initializeObservability()).toEqual({ reloadRequired: false });

    expect(datadogRum.init).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPrivacyLevel: "mask-user-input",
        enablePrivacyForActionName: true,
        propagateTraceBaggage: false,
      })
    );
    expect(datadogLogs.init).toHaveBeenCalledWith(
      expect.objectContaining({
        forwardErrorsToLogs: true,
        forwardConsoleLogs: expect.arrayContaining(["error"]),
      })
    );
    expect(datadogRum.setGlobalContextProperty).toHaveBeenCalledWith(
      "release",
      expect.objectContaining({ browser_sdk_major: 7 })
    );
  });

  it("only propagates trace headers to the app origin or configured API origin", () => {
    const options = {
      pageOrigin: "http://localhost:5173",
      apiBaseUrl: "http://localhost:3001",
    };

    expect(
      isTracedApplicationUrl("/api/monitoring/summary", options)
    ).toBe(true);
    expect(
      isTracedApplicationUrl("http://localhost:3001/chat", options)
    ).toBe(true);
    expect(
      isTracedApplicationUrl(
        "https://untrusted.example/api/monitoring/summary",
        options
      )
    ).toBe(false);
    expect(
      isTracedApplicationUrl(
        "http://localhost:3001/weather",
        options
      )
    ).toBe(false);
  });
});
