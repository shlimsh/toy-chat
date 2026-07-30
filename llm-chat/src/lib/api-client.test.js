import { afterEach, describe, expect, test, vi } from "vitest";

import {
  ApiError,
  createUserError,
  requestJson,
  toUserError,
} from "./api-client.js";

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("API 오류 처리", () => {
  test("서버 오류 코드를 안전한 한국어 메시지로 변환한다", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse(
        {
          error: "forced_demo_error",
          message: "Intentional backend error for demo",
          retryable: false,
          requestId: "req_demo_1",
        },
        500
      )
    );

    await expect(requestJson("/chat")).rejects.toMatchObject({
      code: "forced_demo_error",
      message:
        "백엔드 오류 테스트가 정상적으로 실행되었습니다. Normal 모드로 변경한 뒤 다시 시도해 주세요.",
      retryable: false,
      requestId: "req_demo_1",
    });
  });

  test("알 수 없는 500 응답은 서버 원문을 사용자에게 노출하지 않는다", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse(
        {
          error: "mysql_stack_failure",
          message: "Access denied for user root@private-db",
        },
        500
      )
    );

    let thrown;
    try {
      await requestJson("/conversations");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown.message).toContain("요청 처리 중 문제가 발생");
    expect(thrown.message).not.toContain("private-db");
  });

  test("네트워크 실패는 연결 상태 확인 안내로 변환한다", async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch private endpoint");
    });

    let thrown;
    try {
      await requestJson("/chat");
    } catch (error) {
      thrown = error;
    }

    const userError = toUserError(thrown, "chat");
    expect(userError.code).toBe("network_unavailable");
    expect(userError.message).toContain("서버에 연결할 수 없습니다");
    expect(userError.hint).toContain("백엔드가 실행 중인지");
    expect(userError.message).not.toContain("private endpoint");
  });

  test("클라이언트 오류 시나리오도 동일한 표시 객체를 만든다", () => {
    expect(createUserError("network_unavailable", "network")).toMatchObject({
      title: "서버 연결 실패",
      code: "network_unavailable",
      retryable: true,
    });
  });

  test("화면 전환에 따른 요청 취소를 Timeout과 구분한다", async () => {
    global.fetch = vi.fn((_input, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true }
        );
      })
    );
    const controller = new AbortController();
    const request = requestJson("/conversations", {
      signal: controller.signal,
      timeoutMs: 1000,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({
      code: "request_cancelled",
      retryable: false,
    });
  });
});
