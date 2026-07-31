import { requestJson } from "../lib/api-client.js";

const API_BASE_URL = "";

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export function listConversations(token, cursor = null) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return requestJson(`${API_BASE_URL}/conversations${query}`, {
    headers: authHeaders(token),
    timeoutMs: 10000,
  });
}

export function getConversationMessages(token, conversationId, before = null) {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  return requestJson(
    `${API_BASE_URL}/conversations/${conversationId}/messages${query}`,
    {
      headers: authHeaders(token),
      timeoutMs: 10000,
    }
  );
}

export function sendChatMessage(
  token,
  { conversationId, message, forceError = false }
) {
  return requestJson(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      conversationId,
      message,
      ...(forceError ? { forceError: true } : {}),
    }),
    timeoutMs: 90000,
  });
}
