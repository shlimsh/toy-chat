import { describe, expect, test, vi } from "vitest";

import {
  requireDatadogVersion,
  rotateRumSessionOnVersionChange,
  VERSION_STORAGE_KEY,
} from "./version-session.js";

function createStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) {
    values.set(VERSION_STORAGE_KEY, initialValue);
  }

  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, value)),
  };
}

describe("RUM 버전별 세션 분리", () => {
  test("자동 동기화 버전이 없으면 초기화를 중단한다", () => {
    expect(() => requireDatadogVersion("")).toThrow(/VITE_DD_VERSION/);
    expect(requireDatadogVersion("0.2.4")).toBe("0.2.4");
  });

  test("최초 적용 또는 버전 변경 시 기존 세션을 종료하고 한 번 새로고침한다", () => {
    const rum = { stopSession: vi.fn() };
    const location = { reload: vi.fn() };
    const storage = createStorage("0.2.3");

    expect(
      rotateRumSessionOnVersionChange({
        rum,
        version: "0.2.4",
        storage,
        location,
      })
    ).toBe(true);
    expect(rum.stopSession).toHaveBeenCalledTimes(1);
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      VERSION_STORAGE_KEY,
      "0.2.4"
    );
  });

  test("같은 버전에서는 세션을 유지한다", () => {
    const rum = { stopSession: vi.fn() };
    const location = { reload: vi.fn() };

    expect(
      rotateRumSessionOnVersionChange({
        rum,
        version: "0.2.4",
        storage: createStorage("0.2.4"),
        location,
      })
    ).toBe(false);
    expect(rum.stopSession).not.toHaveBeenCalled();
    expect(location.reload).not.toHaveBeenCalled();
  });
});
