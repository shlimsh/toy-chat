import { requestJson } from "../lib/api-client.js";
import {
  clearTelemetryUser,
  reportLoginFailure,
  setTelemetryUser,
} from "./telemetry-service.js";

const API_BASE_URL = "";

export async function authenticate({ mode, name, email, password }) {
  const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
  const body =
    mode === "login"
      ? { email: email.trim(), password }
      : { name: name.trim(), email: email.trim(), password };

  try {
    const data = await requestJson(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 15000,
    });

    saveSession(data);
    return data;
  } catch (error) {
    reportLoginFailure(error, mode);
    throw error;
  }
}

export async function validateSession(token) {
  return requestJson(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: 10000,
  });
}

export function saveSession({ token, user }) {
  localStorage.setItem("authToken", token);
  localStorage.setItem("authUser", JSON.stringify(user));
  setTelemetryUser(user);
}

export function clearStoredSession() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("authUser");
  localStorage.removeItem("conversationId");
  clearTelemetryUser();
}

