import { runtimeConfig } from "../config/runtime-config.js";
import { requestJson } from "../lib/api-client.js";

export function sendManagerSms(token) {
  return requestJson(
    `${runtimeConfig.apiBaseUrl}/api/notifications/sms`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeoutMs: 15000,
    }
  );
}
