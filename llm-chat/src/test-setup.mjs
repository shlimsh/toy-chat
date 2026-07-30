import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

vi.mock("@datadog/browser-rum", () => ({
  datadogRum: {
    addAction: vi.fn(),
    addError: vi.fn(),
    clearUser: vi.fn(),
    init: vi.fn(),
    setGlobalContextProperty: vi.fn(),
    setUser: vi.fn(),
    startSessionReplayRecording: vi.fn(),
    startView: vi.fn(),
    stopSession: vi.fn(),
  },
}));

vi.mock("@datadog/browser-logs", () => ({
  datadogLogs: {
    clearUser: vi.fn(),
    init: vi.fn(),
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
    },
    setGlobalContextProperty: vi.fn(),
    setUser: vi.fn(),
  },
}));

vi.mock("@datadog/browser-rum-react", () => ({
  reactPlugin: vi.fn(() => ({})),
}));

Object.defineProperty(window, "requestAnimationFrame", {
  configurable: true,
  value: (callback) => setTimeout(callback, 0),
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
