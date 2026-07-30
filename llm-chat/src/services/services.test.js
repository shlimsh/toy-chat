import { beforeEach, describe, expect, test, vi } from "vitest";
import { datadogLogs } from "@datadog/browser-logs";
import { datadogRum } from "@datadog/browser-rum";

import { authenticate } from "./auth-service.js";
import { enrichResourceTimingEvent } from "./resource-timing-service.js";

const jsonResponse = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("frontend services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("login failure is reported to RUM and Browser Logs with an Error object", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse(
        {
          error: "invalid_password",
          message: "비밀번호가 올바르지 않습니다.",
          requestId: "req_login_test",
        },
        401
      )
    );

    await expect(
      authenticate({
        mode: "login",
        name: "",
        email: "tester@example.com",
        password: "wrong-password",
      })
    ).rejects.toMatchObject({
      name: "ApiError",
      code: "invalid_password",
      requestId: "req_login_test",
    });

    expect(datadogRum.addAction).toHaveBeenCalledWith(
      "login_failed",
      expect.objectContaining({
        error_code: "invalid_password",
        request_id: "req_login_test",
      })
    );
    expect(datadogRum.addError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        event: "auth_login_failed",
        request_id: "req_login_test",
      })
    );
    expect(datadogLogs.logger.error).toHaveBeenCalledWith(
      "비밀번호가 올바르지 않습니다.",
      expect.objectContaining({
        event: "auth_login_failed",
        error_code: "invalid_password",
      }),
      expect.any(Error)
    );
  });

  test("resource event receives queue/stalled and Server-Timing values", () => {
    vi.spyOn(performance, "getEntriesByName").mockReturnValue([
      {
        entryType: "resource",
        startTime: 10,
        redirectStart: 0,
        redirectEnd: 0,
        domainLookupStart: 12,
        domainLookupEnd: 14,
        connectStart: 14,
        connectEnd: 18,
        requestStart: 25,
        serverTiming: [{ name: "app", duration: 8.42 }],
      },
    ]);
    const event = {
      type: "resource",
      resource: { url: "http://localhost:5173/auth/login" },
    };

    expect(enrichResourceTimingEvent(event)).toBe(true);
    expect(event.context.resource_timing).toEqual({
      queue_or_stalled_ms: 9,
      backend_app_ms: 8.42,
    });
  });
});

