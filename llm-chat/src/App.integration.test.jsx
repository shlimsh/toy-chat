import React from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import App from "./App.jsx";

const user = {
  id: 7,
  name: "UI 검증 사용자",
  email: "ui-test@example.com",
};

const conversations = [
  { id: 101, title: "Trace 복원 검증" },
  { id: 102, title: "이전 대화" },
  { id: 103, title: "실패 대화" },
];

const openAITrace = {
  provider: "OpenAI",
  model: "gpt-5-mini",
  totalLatencyMs: 842,
  totalTokens: 186,
  costEstimate: "0.000241",
};

const azureTrace = {
  provider: "Azure AI",
  model: "grok-4.3",
  totalLatencyMs: 1134,
  totalTokens: 214,
  costEstimate: "0.000318",
};

const messageSets = {
  101: [
    {
      id: 1,
      role: "user",
      content: "Trace 복원 질문",
      created_at: "2026-07-29T05:10:00.000Z",
    },
    {
      id: 2,
      role: "assistant",
      content: "저장된 OpenAI 답변",
      metadata: {
        provider: "OpenAI",
        model: "gpt-5-mini",
        trace: openAITrace,
      },
      created_at: "2026-07-29T05:10:01.000Z",
    },
    {
      id: 3,
      role: "assistant",
      content: "저장된 Azure 답변",
      metadata: {
        provider: "Azure AI",
        model: "grok-4.3",
        trace: azureTrace,
      },
      created_at: "2026-07-29T05:10:02.000Z",
    },
  ],
  102: [
    {
      id: 4,
      role: "user",
      content: "이전 대화 질문",
      created_at: "2026-07-28T03:00:00.000Z",
    },
    {
      id: 5,
      role: "assistant",
      content: "이전 OpenAI 답변",
      metadata: {
        provider: "OpenAI",
        model: "gpt-5-mini",
        trace: openAITrace,
      },
      created_at: "2026-07-28T03:00:01.000Z",
    },
    {
      id: 6,
      role: "assistant",
      content: "이전 Azure 답변",
      metadata: {
        provider: "Azure AI",
        model: "grok-4.3",
        trace: azureTrace,
      },
      created_at: "2026-07-28T03:00:02.000Z",
    },
  ],
  103: [
    {
      id: 7,
      role: "user",
      content: "모두 실패한 요청",
      created_at: "2026-07-27T03:00:00.000Z",
    },
    {
      id: 8,
      role: "assistant",
      content: "OpenAI 실패",
      metadata: {
        provider: "OpenAI",
        model: "gpt-5-mini",
        trace: {
          provider: "OpenAI",
          model: "gpt-5-mini",
          error: "OpenAI request failed",
        },
      },
      created_at: "2026-07-27T03:00:01.000Z",
    },
    {
      id: 9,
      role: "assistant",
      content: "Azure 실패",
      metadata: {
        provider: "Azure AI",
        model: "grok-4.3",
        trace: {
          provider: "Azure AI",
          model: "grok-4.3",
          error: "Azure request failed",
        },
      },
      created_at: "2026-07-27T03:00:02.000Z",
    },
  ],
};

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const installFetchMock = () => {
  global.fetch = vi.fn(async (input, init = {}) => {
    const url = String(input);

    if (url.includes("api.openweathermap.org/data/2.5/weather")) {
      return jsonResponse({
        weather: [{ main: "Clear", description: "맑음" }],
        main: { temp: 29 },
      });
    }

    if (url.includes("api.openweathermap.org/data/2.5/forecast")) {
      return jsonResponse({ list: [] });
    }

    if (url.endsWith("/auth/login") || url.endsWith("/auth/register")) {
      return jsonResponse({ token: "ui-test-token", user });
    }

    if (url.endsWith("/auth/me")) {
      return jsonResponse({ user });
    }

    if (url.endsWith("/conversations?cursor=conversation-next")) {
      return jsonResponse({
        conversations: [{ id: 104, title: "더 오래된 대화" }],
        pageInfo: { hasMore: false, nextCursor: null },
      });
    }

    if (url.endsWith("/conversations")) {
      return jsonResponse({
        conversations,
        pageInfo: { hasMore: true, nextCursor: "conversation-next" },
      });
    }

    const olderMessagesMatch = url.match(
      /\/conversations\/(\d+)\/messages\?before=1$/
    );
    if (olderMessagesMatch) {
      return jsonResponse({
        messages: [
          {
            id: 0,
            role: "user",
            content: "가장 오래된 질문",
            created_at: "2026-07-20T03:00:00.000Z",
          },
        ],
        pageInfo: { hasMore: false, nextCursor: null },
      });
    }

    const messagesMatch = url.match(/\/conversations\/(\d+)\/messages$/);
    if (messagesMatch) {
      return jsonResponse({
        messages: messageSets[Number(messagesMatch[1])] || [],
        pageInfo: { hasMore: true, nextCursor: "1" },
      });
    }

    if (url.endsWith("/chat")) {
      const body = JSON.parse(init.body);

      if (body.forceError) {
        return jsonResponse(
          {
            error: "forced_demo_error",
            message: "Intentional backend error for demo",
          },
          500
        );
      }

      if (body.message === "부분 성공 검증") {
        return jsonResponse({
          conversationId: 101,
          requestId: "req_partial_success",
          status: "partial_success",
          providerSummary: {
            status: "partial_success",
            totalCount: 2,
            successCount: 1,
            failureCount: 1,
            successfulProviders: ["Azure AI"],
            failedProviders: ["OpenAI"],
          },
          responses: [
            {
              id: 30,
              status: "failed",
              provider: "OpenAI",
              model: "gpt-5-mini",
              content: "OpenAI 응답 시간이 초과되었습니다.",
              error: {
                code: "provider_timeout",
                message: "OpenAI 응답 시간이 초과되었습니다.",
                retryable: true,
              },
              created_at: "2026-07-29T05:21:01.000Z",
              trace: {
                provider: "OpenAI",
                model: "gpt-5-mini",
                error: "OpenAI 응답 시간이 초과되었습니다.",
                errorCode: "provider_timeout",
              },
            },
            {
              id: 31,
              status: "success",
              provider: "Azure AI",
              model: "grok-4.3",
              content: "Azure 단독 정상 답변",
              created_at: "2026-07-29T05:21:02.000Z",
              trace: azureTrace,
            },
          ],
          trace: {
            models: [
              {
                provider: "OpenAI",
                model: "gpt-5-mini",
                error: "OpenAI 응답 시간이 초과되었습니다.",
              },
              azureTrace,
            ],
            totalLatencyMs: 1134,
            totalTokens: 214,
            costEstimate: "0.000318",
          },
        });
      }

      return jsonResponse({
        conversationId: 101,
        responses: [
          {
            id: 20,
            provider: "OpenAI",
            model: "gpt-5-mini",
            content: "새 OpenAI 답변",
            created_at: "2026-07-29T05:20:01.000Z",
            trace: openAITrace,
          },
          {
            id: 21,
            provider: "Azure AI",
            model: "grok-4.3",
            content: "새 Azure 답변",
            created_at: "2026-07-29T05:20:02.000Z",
            trace: azureTrace,
          },
        ],
        trace: {
          models: [openAITrace, azureTrace],
          totalLatencyMs: 1134,
          totalTokens: 400,
          costEstimate: "0.000559",
        },
        rag: {
          status: "ready",
          mode: "hybrid",
          retrievalStrategy: "hybrid",
          degradedReason: null,
          resultCount: 1,
          sources: [
            {
              document: "datadog-rum.txt",
              title: "Datadog Real User Monitoring",
              section: "Browser SDK v7과 Source Map",
              score: 0.812345,
            },
          ],
        },
      });
    }

    return jsonResponse({});
  });
};

const renderApp = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>
  );

describe("toy-chat phase 1 UI integration", () => {
  beforeEach(() => {
    installFetchMock();
  });

  test("로그인 후 저장 대화와 모델별 Trace를 복원하고 새 질문을 전송한다", async () => {
    const browserUser = userEvent.setup();
    renderApp();

    await browserUser.type(
      screen.getByPlaceholderText("이메일"),
      "ui-test@example.com"
    );
    await browserUser.type(
      screen.getByPlaceholderText("비밀번호"),
      "safe-test-password"
    );
    await browserUser.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByText("UI 검증 사용자")).toBeTruthy();

    await browserUser.click(await screen.findByRole("button", {
      name: "Trace 복원 검증",
    }));

    expect(await screen.findByText("저장된 OpenAI 답변")).toBeTruthy();
    expect(await screen.findByText("저장된 Azure 답변")).toBeTruthy();

    const input = screen.getByPlaceholderText("질문을 입력하세요");
    await browserUser.type(input, "UI 전송 검증");
    await browserUser.click(
      screen.getByRole("button", { name: "메시지 보내기" })
    );

    expect(await screen.findByText("새 OpenAI 답변")).toBeTruthy();
    expect(await screen.findByText("새 Azure 답변")).toBeTruthy();
    expect(screen.getByText("$0.000559")).toBeTruthy();
    expect(screen.getByText("📚 RAG Context")).toBeTruthy();
    expect(screen.getByText("hybrid · 1")).toBeTruthy();
    expect(screen.getByText("Datadog Real User Monitoring")).toBeTruthy();
  });

  test("OpenAI와 Azure 중 하나만 성공해도 정상 답변을 표시하고 전체 실패 화면은 숨긴다", async () => {
    const browserUser = userEvent.setup();
    localStorage.setItem("authToken", "ui-test-token");
    localStorage.setItem("authUser", JSON.stringify(user));

    renderApp();
    expect(await screen.findByText("UI 검증 사용자")).toBeTruthy();

    await browserUser.type(
      screen.getByPlaceholderText("질문을 입력하세요"),
      "부분 성공 검증"
    );
    await browserUser.click(
      screen.getByRole("button", { name: "메시지 보내기" })
    );

    expect(await screen.findByText("Azure 단독 정상 답변")).toBeTruthy();
    expect(
      screen.getAllByText("OpenAI 응답 시간이 초과되었습니다.").length
    ).toBeGreaterThan(0);
    expect(screen.getByText("OpenAI 응답 실패")).toBeTruthy();
    expect(screen.queryByText("답변 생성 실패")).toBeNull();
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });

  test("재접속 시 문자열 conversationId도 선택 상태로 표시한다", async () => {
    localStorage.setItem("authToken", "ui-test-token");
    localStorage.setItem("authUser", JSON.stringify(user));
    localStorage.setItem("conversationId", "102");

    renderApp();

    expect(await screen.findByText("이전 OpenAI 답변")).toBeTruthy();

    const selected = await screen.findByRole("button", { name: "이전 대화" });
    expect(selected.style.background).toBe("rgb(219, 234, 254)");
  });

  test("이전 대화와 이전 메시지를 Cursor로 추가 로드한다", async () => {
    const browserUser = userEvent.setup();
    localStorage.setItem("authToken", "ui-test-token");
    localStorage.setItem("authUser", JSON.stringify(user));
    localStorage.setItem("conversationId", "101");

    renderApp();

    expect(await screen.findByText("저장된 OpenAI 답변")).toBeTruthy();
    await browserUser.click(
      screen.getByRole("button", { name: "이전 메시지 불러오기" })
    );
    expect(await screen.findByText("가장 오래된 질문")).toBeTruthy();

    await browserUser.click(
      screen.getByRole("button", { name: "이전 대화 더 보기" })
    );
    expect(await screen.findByText("더 오래된 대화")).toBeTruthy();
  });

  test("두 모델이 모두 실패한 대화를 복원하면 전체 지연시간을 0ms로 오표시하지 않는다", async () => {
    localStorage.setItem("authToken", "ui-test-token");
    localStorage.setItem("authUser", JSON.stringify(user));
    localStorage.setItem("conversationId", "103");

    renderApp();

    expect(await screen.findByText("OpenAI 실패")).toBeTruthy();

    const latencyLabel = screen.getByText("⚡ Total Latency");
    const latencyRow = latencyLabel.parentElement;
    expect(within(latencyRow).getByText("-")).toBeTruthy();
  });

  test("백엔드 오류는 내부 오류 코드보다 사용자용 메시지를 보여준다", async () => {
    const browserUser = userEvent.setup();
    localStorage.setItem("authToken", "ui-test-token");
    localStorage.setItem("authUser", JSON.stringify(user));

    renderApp();
    expect(await screen.findByText("UI 검증 사용자")).toBeTruthy();

    await browserUser.click(screen.getByRole("button", { name: /Backend/ }));
    await browserUser.click(screen.getByRole("button", { name: "닫기" }));

    await browserUser.type(
      screen.getByPlaceholderText("질문을 입력하세요"),
      "오류 검증"
    );
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "백엔드 오류 테스트가 정상적으로 실행되었습니다. Normal 모드로 변경한 뒤 다시 시도해 주세요."
        )
      ).toBeTruthy();
    });
    expect(screen.queryByText("forced_demo_error")).toBeNull();
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });

  test("네트워크 오류는 브라우저 원문 대신 연결 확인 안내와 재시도를 보여준다", async () => {
    const browserUser = userEvent.setup();
    const normalFetch = global.fetch;
    global.fetch = vi.fn(async (input, init) => {
      if (String(input).includes("127.0.0.1:3999")) {
        throw new TypeError("Failed to fetch private endpoint");
      }
      return normalFetch(input, init);
    });

    localStorage.setItem("authToken", "ui-test-token");
    localStorage.setItem("authUser", JSON.stringify(user));
    renderApp();

    expect(await screen.findByText("UI 검증 사용자")).toBeTruthy();
    await browserUser.click(screen.getByRole("button", { name: /Network/ }));
    await browserUser.click(screen.getByRole("button", { name: "닫기" }));
    await browserUser.type(
      screen.getByPlaceholderText("질문을 입력하세요"),
      "네트워크 오류 검증"
    );
    await browserUser.click(
      screen.getByRole("button", { name: "메시지 보내기" })
    );

    expect(await screen.findByText("서버 연결 실패")).toBeTruthy();
    expect(
      screen.getByText(
        "서버에 연결할 수 없습니다. 네트워크와 서버 실행 상태를 확인해 주세요."
      )
    ).toBeTruthy();
    expect(screen.queryByText(/private endpoint/)).toBeNull();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  test("만료된 세션은 로그인 화면에서 재로그인 안내를 보여준다", async () => {
    const normalFetch = global.fetch;
    global.fetch = vi.fn(async (input, init) => {
      if (String(input).endsWith("/auth/me")) {
        return jsonResponse(
          {
            error: "invalid_token",
            message: "internal jwt detail",
            retryable: false,
          },
          401
        );
      }
      return normalFetch(input, init);
    });

    localStorage.setItem("authToken", "expired-token");
    localStorage.setItem("authUser", JSON.stringify(user));
    renderApp();

    expect(
      await screen.findByText(
        "로그인 시간이 만료되었습니다. 다시 로그인해 주세요."
      )
    ).toBeTruthy();
    expect(screen.queryByText("internal jwt detail")).toBeNull();
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
  });
});
