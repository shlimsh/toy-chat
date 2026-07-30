import { afterEach, describe, expect, it, vi } from "vitest";

import { sendManagerSms } from "./notification-service.js";

describe("notification service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the authenticated backend proxy without a user-controlled body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      text: async () => JSON.stringify({ ok: true, status: "accepted" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendManagerSms("test-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notifications/sms",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
        },
      })
    );
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });
});
