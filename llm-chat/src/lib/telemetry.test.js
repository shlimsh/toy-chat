import { datadogLogs } from "@datadog/browser-logs";
import { datadogRum } from "@datadog/browser-rum";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  reportFrontendError,
  shouldReportError,
} from "./telemetry.js";

describe("Datadog 프런트엔드 오류 보고", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("오류를 동일한 ID로 RUM과 Logs에 기록한다", () => {
    const error = new TypeError("화면 렌더링 실패");
    const errorId = reportFrontendError(error, {
      errorId: "error_test_1",
      source: "unit_test",
    });

    expect(errorId).toBe("error_test_1");
    expect(datadogRum.addError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        error_id: "error_test_1",
        error_source: "unit_test",
      })
    );
    expect(datadogLogs.logger.error).toHaveBeenCalledWith(
      "화면 렌더링 실패",
      expect.objectContaining({
        event: "frontend_error",
      }),
      error
    );
  });

  test("로그인 인증 실패는 Error Tracking에 상세 오류로 보고한다", () => {
    expect(
      shouldReportError({
        code: "invalid_password",
        status: 401,
      })
    ).toBe(true);
    expect(
      shouldReportError({
        code: "chat_unavailable",
        status: 503,
      })
    ).toBe(true);
  });
});
