import { beforeEach, describe, expect, it } from "vitest";

import { datadogLogs } from "@datadog/browser-logs";
import { datadogRum } from "@datadog/browser-rum";

import { initializeObservability } from "./observability.js";

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
});
