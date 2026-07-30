import { withRequestTimeout } from "../request-timeout.mjs";

export function createSmsService({
  endpoint,
  timeoutMs,
  fetchImpl = fetch,
}) {
  return {
    async sendManagerNotification() {
      if (!endpoint) {
        const error = new Error("SMS endpoint is not configured");
        error.code = "SMS_NOT_CONFIGURED";
        throw error;
      }

      const response = await withRequestTimeout(
        "SMS notification",
        timeoutMs,
        (signal) =>
          fetchImpl(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            signal,
            body: JSON.stringify({
              message: "담당자에게 문자 발송 요청",
            }),
          })
      );

      if (!response.ok) {
        const error = new Error(`SMS upstream returned HTTP ${response.status}`);
        error.code = "SMS_UPSTREAM_ERROR";
        error.status = response.status;
        throw error;
      }

      return {
        ok: true,
        status: "accepted",
      };
    },
  };
}
