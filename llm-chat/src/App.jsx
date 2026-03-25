import React, { useEffect, useMemo, useRef, useState } from "react";
import { datadogRum } from "@datadog/browser-rum";
import {
  Bot,
  Send,
  User,
  Activity,
  Database,
  AlertTriangle,
  RotateCcw,
  WifiOff,
  Bug,
  ServerCrash,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { datadogLogs } from "@datadog/browser-logs";

const initialMessages = [
  {
    id: 1,
    role: "assistant",
    content:
      "안녕하세요. Datadog LLM Observability 데모용 채팅 화면입니다. 질문을 입력하면 채팅과 함께 trace 정보가 오른쪽 패널에 표시됩니다.",
    timestamp: new Date().toLocaleTimeString(),
  },
];

function StatBox({ label, value, icon }) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
        borderRadius: 18,
        padding: 16,
        border: "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "#64748b",
          fontWeight: 700,
        }}
      >
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 14,
          fontWeight: 800,
          color: "#0f172a",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Pill({ children, dark = false }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "5px 10px",
        borderRadius: 999,
        fontSize: 12,
        background: dark ? "#e2e8f0" : "#fff",
        border: "1px solid #cbd5e1",
        color: "#334155",
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function TestModeButton({ active, onClick, children, tone = "default" }) {
  const palette =
    tone === "danger"
      ? {
          background: active ? "#fff1f2" : "#fff",
          border: active ? "1px solid #ef4444" : "1px solid #cbd5e1",
          color: active ? "#be123c" : "#334155",
          shadow: active ? "0 6px 18px rgba(239, 68, 68, 0.12)" : "none",
        }
      : tone === "warning"
      ? {
          background: active ? "#fff7ed" : "#fff",
          border: active ? "1px solid #f59e0b" : "1px solid #cbd5e1",
          color: active ? "#b45309" : "#334155",
          shadow: active ? "0 6px 18px rgba(245, 158, 11, 0.12)" : "none",
        }
      : {
          background: active ? "#eff6ff" : "#fff",
          border: active ? "1px solid #3b82f6" : "1px solid #cbd5e1",
          color: active ? "#1d4ed8" : "#334155",
          shadow: active ? "0 6px 18px rgba(59, 130, 246, 0.12)" : "none",
        };

  return (
    <button
      onClick={onClick}
      style={{
        borderRadius: 999,
        padding: "10px 14px",
        fontSize: 12,
        fontWeight: 800,
        cursor: "pointer",
        transition: "all 0.18s ease",
        whiteSpace: "nowrap",
        ...palette,
      }}
    >
      {children}
    </button>
  );
}

function ErrorModal({ errorState, onRetry, onDismiss }) {
  if (!errorState) return null;

  return (
    <div
      onClick={onDismiss}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.35)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(760px, 100%)",
          borderRadius: 24,
          border: "1px solid #fecaca",
          background: "linear-gradient(180deg, #fff1f2 0%, #fff7f7 100%)",
          padding: 22,
          boxShadow: "0 30px 80px rgba(15, 23, 42, 0.22)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "flex", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                background: "#fee2e2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={20} style={{ color: "#dc2626" }} />
            </div>

            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#991b1b" }}>
                {errorState.title}
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  color: "#7f1d1d",
                  lineHeight: 1.8,
                  whiteSpace: "pre-wrap",
                }}
              >
                {errorState.message}
              </div>

              {errorState.detail ? (
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 12,
                    color: "#9f1239",
                    whiteSpace: "pre-wrap",
                    background: "#fff",
                    border: "1px solid #fecdd3",
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  {errorState.detail}
                </div>
              ) : null}
            </div>
          </div>

          <button
            onClick={onDismiss}
            style={{
              border: "1px solid #fecdd3",
              background: "#fff",
              borderRadius: 12,
              height: 36,
              padding: "0 14px",
              cursor: "pointer",
              color: "#881337",
              fontSize: 12,
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            닫기
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            onClick={onRetry}
            style={{
              height: 42,
              border: "none",
              borderRadius: 14,
              padding: "0 16px",
              background: "#0f172a",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <RotateCcw size={14} />
            다시 시도
          </button>
        </div>
      </div>
    </div>
  );
}

function toDisplayTime(value) {
  if (!value) return new Date().toLocaleTimeString();

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString();
  }

  return value;
}

function CrashForDemo() {
  throw new Error("Intentional frontend render crash for RUM/ErrorBoundary demo");
}

function getModeMeta(mode) {
  switch (mode) {
    case "backend":
      return {
        emoji: "🔥",
        label: "Backend Error Test",
        shortLabel: "Backend Error",
        description: "모든 채팅 요청이 의도적으로 500 에러로 종료됩니다.",
        bg: "linear-gradient(135deg, #fff7ed 0%, #fffbeb 100%)",
        border: "#fdba74",
        titleColor: "#9a3412",
        textColor: "#7c2d12",
        iconBg: "#ffedd5",
        icon: <ServerCrash size={18} style={{ color: "#c2410c" }} />,
      };
    case "network":
      return {
        emoji: "🌐",
        label: "Network Error Test",
        shortLabel: "Network Error",
        description: "잘못된 엔드포인트로 요청하여 네트워크 실패를 재현합니다.",
        bg: "linear-gradient(135deg, #fff1f2 0%, #fff7f7 100%)",
        border: "#fda4af",
        titleColor: "#9f1239",
        textColor: "#881337",
        iconBg: "#ffe4e6",
        icon: <WifiOff size={18} style={{ color: "#e11d48" }} />,
      };
    default:
      return {
        emoji: "🟢",
        label: "Normal Mode",
        shortLabel: "Normal",
        description: "정상 요청 흐름입니다. 성공 응답과 Trace/Logs를 확인할 수 있습니다.",
        bg: "linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)",
        border: "#93c5fd",
        titleColor: "#1d4ed8",
        textColor: "#334155",
        iconBg: "#dbeafe",
        icon: <ShieldCheck size={18} style={{ color: "#2563eb" }} />,
      };
  }
}

function EmptyChatState({ onSuggestionClick }) {
  const suggestions = [
    "datadog trace 설명해줘",
    "에러 테스트 해줘",
    "현재 시간 알려줘",
  ];

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "24px 20px",
      }}
    >
      <div style={{ maxWidth: 680 }}>
        <div
          style={{
            width: 78,
            height: 78,
            margin: "0 auto 18px",
            borderRadius: 26,
            background: "#0f172a",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 34,
            boxShadow: "0 18px 36px rgba(15, 23, 42, 0.18)",
          }}
        >
          🤖
        </div>

        <div
          style={{
            fontSize: 30,
            fontWeight: 800,
            color: "#0f172a",
            letterSpacing: "-0.8px",
          }}
        >
          Ask anything
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 15,
            lineHeight: 1.8,
            color: "#64748b",
          }}
        >
          Start a conversation to see traces, logs, and error scenarios
          <br />
          in a clean, focused chat flow.
        </div>

        <div
          style={{
            marginTop: 24,
            display: "flex",
            justifyContent: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {suggestions.map((item) => (
            <button
              key={item}
              onClick={() => onSuggestionClick(item)}
              style={{
                border: "1px solid #e2e8f0",
                background: "#fff",
                color: "#334155",
                borderRadius: 999,
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 6px 16px rgba(15,23,42,0.05)",
              }}
            >
              💡 {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentTrace, setCurrentTrace] = useState(null);

  const [sessionId, setSessionId] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  const [errorState, setErrorState] = useState(null);
  const [testMode, setTestMode] = useState("normal");
  const [shouldCrash, setShouldCrash] = useState(false);
  const [lastSubmittedMessage, setLastSubmittedMessage] = useState("");

  const chatScrollRef = useRef(null);
  const inputRef = useRef(null);

  const modeMeta = getModeMeta(testMode);

  const scrollChatToBottom = (behavior = "smooth") => {
    const el = chatScrollRef.current;
    if (!el) return;

    el.scrollTo({
      top: el.scrollHeight,
      behavior,
    });
  };

  const focusInput = () => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  useEffect(() => {
    let savedSessionId = localStorage.getItem("sessionId");
    if (!savedSessionId) {
      savedSessionId = crypto.randomUUID();
      localStorage.setItem("sessionId", savedSessionId);
    }

    const savedConversationId = localStorage.getItem("conversationId");

    setSessionId(savedSessionId);
    setConversationId(savedConversationId || null);

    datadogRum.setGlobalContextProperty("app_session_id", savedSessionId);
    if (savedConversationId) {
      datadogRum.setGlobalContextProperty("app_conversation_id", savedConversationId);
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    datadogRum.setGlobalContextProperty("frontend_test_mode", testMode);
  }, [testMode]);

  const loadConversations = async (targetSessionId) => {
    if (!targetSessionId) return;

    try {
      const response = await fetch(
        `http://localhost:3001/conversations?sessionId=${encodeURIComponent(targetSessionId)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "failed to load conversations");
      }

      setConversations(data.conversations || []);
    } catch (error) {
      console.error("failed to load conversations:", error);
    }
  };

  const loadMessages = async (targetConversationId) => {
    if (!targetConversationId) return;

    try {
      const response = await fetch(
        `http://localhost:3001/conversations/${targetConversationId}/messages`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "failed to load messages");
      }

      const restoredMessages = (data.messages || [])
        .filter((msg) => msg.role === "user" || msg.role === "assistant")
        .map((msg, index) => ({
          id: msg.id || `${msg.role}-${index}`,
          role: msg.role,
          content: msg.content,
          timestamp: toDisplayTime(msg.created_at),
        }));

      setMessages(restoredMessages.length > 0 ? restoredMessages : initialMessages);

      requestAnimationFrame(() => {
        scrollChatToBottom("auto");
        focusInput();
      });
    } catch (error) {
      console.error("failed to load messages:", error);
      localStorage.removeItem("conversationId");
      setConversationId(null);
      setMessages(initialMessages);
    }
  };

  useEffect(() => {
    if (sessionId) {
      loadConversations(sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!hydrated) return;

    if (conversationId) {
      localStorage.setItem("conversationId", conversationId);
      datadogRum.setGlobalContextProperty("app_conversation_id", conversationId);
      loadMessages(conversationId);
    } else {
      localStorage.removeItem("conversationId");
      datadogRum.setGlobalContextProperty("app_conversation_id", null);
      setMessages(initialMessages);

      requestAnimationFrame(() => {
        scrollChatToBottom("auto");
        focusInput();
      });
    }
  }, [conversationId, hydrated]);

  useEffect(() => {
    scrollChatToBottom("smooth");
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) {
      focusInput();
    }
  }, [loading]);

  const stats = useMemo(() => {
    if (!currentTrace) {
      return [
        { label: "Model", value: "-", icon: "🤖" },
        { label: "Latency", value: "-", icon: "⚡" },
        { label: "Tokens", value: "-", icon: "🧮" },
        { label: "Cost", value: "-", icon: "💰" },
      ];
    }

    return [
      { label: "Model", value: currentTrace.model, icon: "🤖" },
      { label: "Latency", value: `${currentTrace.totalLatencyMs} ms`, icon: "⚡" },
      { label: "Tokens", value: `${currentTrace.totalTokens}`, icon: "🧮" },
      { label: "Cost", value: `$${currentTrace.costEstimate}`, icon: "💰" },
    ];
  }, [currentTrace]);

  const startNewChat = () => {
    localStorage.removeItem("conversationId");
    setConversationId(null);
    datadogRum.setGlobalContextProperty("app_conversation_id", null);
    setMessages(initialMessages);
    setCurrentTrace(null);
    setErrorState(null);

    datadogRum.addAction("chat_new_conversation_clicked", {
      session_id: sessionId || "unknown",
    });

    requestAnimationFrame(() => {
      scrollChatToBottom("auto");
      focusInput();
    });
  };

  const selectTestMode = (mode) => {
    setTestMode(mode);

    datadogRum.addAction("frontend_test_mode_changed", {
      selected_mode: mode,
      session_id: sessionId || "unknown",
      conversation_id: conversationId || "new",
    });

    datadogLogs.logger.info("frontend_test_mode_changed", {
      selected_mode: mode,
      session_id: sessionId || "unknown",
      conversation_id: conversationId || "new",
    });
  };

  const triggerRenderCrash = () => {
    datadogRum.addAction("frontend_render_crash_button_clicked", {
      session_id: sessionId || "unknown",
      conversation_id: conversationId || "new",
    });

    datadogLogs.logger.warn("frontend_render_crash_button_clicked", {
      session_id: sessionId || "unknown",
      conversation_id: conversationId || "new",
    });

    setShouldCrash(true);
  };

  const retryLastMessage = async () => {
    if (!lastSubmittedMessage || loading) return;
    setInput(lastSubmittedMessage);
    setErrorState(null);
    requestAnimationFrame(() => {
      focusInput();
    });
  };

  const sendMessage = async (forcedMessage) => {
    const raw = typeof forcedMessage === "string" ? forcedMessage : input;
    const trimmed = raw.trim();

    if (!trimmed || loading || !sessionId) return;

    setLastSubmittedMessage(trimmed);
    setErrorState(null);

    datadogLogs.logger.info("chat_submit", {
      message_preview: trimmed.slice(0, 100),
      session_id: sessionId,
      conversation_id: conversationId || "new",
      frontend_test_mode: testMode,
    });

    datadogRum.addAction("chat_submit", {
      message_preview: trimmed.slice(0, 100),
      session_id: sessionId,
      conversation_id: conversationId || "new",
      frontend_test_mode: testMode,
    });

    const userMessage = {
      id: Date.now(),
      role: "user",
      content: trimmed,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    requestAnimationFrame(() => {
      scrollChatToBottom("smooth");
    });

    const startedAt = Date.now();

    try {
      const targetUrl =
        testMode === "network"
          ? "http://localhost:3999/chat"
          : "http://localhost:3001/chat";

      const requestBody = {
        sessionId,
        conversationId,
        message: trimmed,
        ...(testMode === "backend" ? { forceError: true } : {}),
      };

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const rawText = await response.text();

      let data = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        throw new Error(
          data?.error || rawText || `request failed (status: ${response.status})`
        );
      }

      if (data?.conversationId) {
        setConversationId(data.conversationId);
        localStorage.setItem("conversationId", data.conversationId);
        datadogRum.setGlobalContextProperty("app_conversation_id", data.conversationId);
      }

      await loadConversations(sessionId);

      const latencyMs = Date.now() - startedAt;

      const assistantMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: data?.message || data?.text || "응답이 비어 있습니다.",
        timestamp: new Date().toLocaleTimeString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      datadogLogs.logger.info("chat_response_received", {
        session_id: sessionId,
        conversation_id: data?.conversationId || conversationId || "unknown",
        model: data?.model || "unknown",
        latency_ms: latencyMs,
        used_tools: data?.usedTools || [],
        retrieval_count: data?.retrievalCount ?? 0,
        frontend_test_mode: testMode,
      });

      datadogRum.addAction("chat_response_received", {
        session_id: sessionId,
        conversation_id: data?.conversationId || conversationId || "unknown",
        model: data?.model || "unknown",
        latency_ms: latencyMs,
        frontend_test_mode: testMode,
      });

      setCurrentTrace({
        traceId: "live-api-call",
        workflow: "chat-request",
        model: data?.model || "gpt-4.1-mini",
        provider: "OpenAI",
        totalLatencyMs: latencyMs,
        promptTokens: data?.promptTokens ?? "-",
        completionTokens: data?.completionTokens ?? "-",
        totalTokens:
          data?.totalTokens ??
          (typeof data?.promptTokens === "number" &&
          typeof data?.completionTokens === "number"
            ? data.promptTokens + data.completionTokens
            : "-"),
        costEstimate: "-",
        startedAt: new Date(startedAt).toLocaleTimeString(),
        spans: [
          {
            name: "browser.fetch_/chat",
            type: "http",
            durationMs: latencyMs,
            status: "ok",
          },
          {
            name: "openai.chat.completions.create",
            type: "llm_call",
            durationMs: data?.llmLatencyMs ?? "-",
            status: "ok",
          },
        ],
      });
    } catch (error) {
      const elapsed = Date.now() - startedAt;

      const assistantMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: `에러: ${error.message}`,
        timestamp: new Date().toLocaleTimeString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      const isNetworkMode = testMode === "network";
      const isBackendMode = testMode === "backend";

      setErrorState({
        title: isNetworkMode
          ? "네트워크 오류"
          : isBackendMode
          ? "백엔드 오류"
          : "채팅 요청 실패",
        message: isNetworkMode
          ? "API 서버에 연결하지 못했습니다. 네트워크 장애나 잘못된 엔드포인트 상황을 재현한 상태입니다."
          : isBackendMode
          ? "백엔드가 의도적으로 500 에러를 반환했습니다. Datadog APM / Logs에서 원인을 따라가 볼 수 있습니다."
          : "채팅 응답을 가져오지 못했습니다.",
        detail: `mode=${testMode}\nerror=${error.message}`,
      });

      datadogLogs.logger.error("chat_response_error", {
        session_id: sessionId,
        conversation_id: conversationId || "unknown",
        error_message: error.message,
        frontend_test_mode: testMode,
      });

      datadogRum.addError(error, {
        source: "chat-ui-fetch",
        session_id: sessionId,
        conversation_id: conversationId || "unknown",
        frontend_test_mode: testMode,
      });

      datadogRum.addAction("chat_response_error", {
        session_id: sessionId,
        conversation_id: conversationId || "unknown",
        error_message: error.message,
        frontend_test_mode: testMode,
      });

      setCurrentTrace({
        traceId: "live-api-call",
        workflow: "chat-request",
        model: "-",
        provider: "OpenAI",
        totalLatencyMs: elapsed,
        promptTokens: "-",
        completionTokens: "-",
        totalTokens: "-",
        costEstimate: "-",
        startedAt: new Date(startedAt).toLocaleTimeString(),
        spans: [
          {
            name: "browser.fetch_/chat",
            type: "http",
            durationMs: elapsed,
            status: "error",
          },
        ],
      });
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        scrollChatToBottom("smooth");
        focusInput();
      });
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (shouldCrash) {
    return <CrashForDemo />;
  }

  const isOnlyInitialState =
    messages.length === 1 &&
    messages[0]?.role === "assistant" &&
    messages[0]?.content === initialMessages[0].content &&
    !loading;

  return (
    <div
      style={{
        minHeight: "100svh",
        background:
          "radial-gradient(circle at top, rgba(59,130,246,0.06), transparent 28%), #f8fafc",
        padding: 16,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "min(1320px, calc(100vw - 32px))",
          height: "calc(100svh - 32px)",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1.35fr 0.65fr",
          gap: 16,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 28,
            boxShadow: "0 14px 40px rgba(15, 23, 42, 0.08)",
            padding: 18,
            display: "flex",
            flexDirection: "column",
            border: "1px solid rgba(226,232,240,0.9)",
            height: "100%",
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
              gap: 16,
              flexWrap: "wrap",
              flexShrink: 0,
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  fontSize: 12,
                  fontWeight: 800,
                  marginBottom: 10,
                }}
              >
                <Sparkles size={13} />
                Datadog Demo
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: 28,
                  color: "#0f172a",
                  letterSpacing: "-0.6px",
                  lineHeight: 1.2,
                }}
              >
                LLM Chat Playground
              </h1>

              <p style={{ margin: "8px 0 0", fontSize: 13, color: "#64748b" }}>
                ChatGPT처럼 시작하고, Datadog처럼 분석하는 데모 UI
              </p>

              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Pill>session: {sessionId ? sessionId.slice(0, 8) : "-"}</Pill>
                <Pill dark>conv: {conversationId ? conversationId.slice(0, 12) : "new"}</Pill>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <div
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "#e2e8f0",
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                Demo UI
              </div>

              <button
                onClick={startNewChat}
                style={{
                  height: 38,
                  border: "1px solid #cbd5e1",
                  borderRadius: 999,
                  padding: "0 14px",
                  background: "#fff",
                  color: "#0f172a",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                새 대화
              </button>
            </div>
          </div>

          <div
            style={{
              borderRadius: 22,
              padding: 16,
              marginBottom: 12,
              background: modeMeta.bg,
              border: `1px solid ${modeMeta.border}`,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: modeMeta.textColor,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              Select test scenario
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    background: modeMeta.iconBg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {modeMeta.icon}
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: modeMeta.titleColor,
                    }}
                  >
                    Mode: {modeMeta.emoji} {modeMeta.shortLabel}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      color: modeMeta.textColor,
                      lineHeight: 1.7,
                      maxWidth: 720,
                    }}
                  >
                    {modeMeta.description}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <TestModeButton
                  active={testMode === "normal"}
                  onClick={() => selectTestMode("normal")}
                >
                  🟢 정상 모드
                </TestModeButton>

                <TestModeButton
                  active={testMode === "backend"}
                  onClick={() => selectTestMode("backend")}
                  tone="warning"
                >
                  🔥 백엔드 에러
                </TestModeButton>

                <TestModeButton
                  active={testMode === "network"}
                  onClick={() => selectTestMode("network")}
                  tone="danger"
                >
                  🌐 네트워크 에러
                </TestModeButton>

                <TestModeButton active={false} onClick={triggerRenderCrash} tone="danger">
                  💥 프론트 에러
                </TestModeButton>
              </div>
            </div>
          </div>

          {testMode !== "normal" && (
            <div
              style={{
                marginBottom: 12,
                borderRadius: 16,
                background: "#fff8e7",
                border: "1px solid #fde68a",
                padding: "12px 14px",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                color: "#92400e",
                fontSize: 13,
                lineHeight: 1.7,
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                현재는 <strong>{modeMeta.label}</strong> 상태입니다. 지금 전송하는 요청은
                테스트 시나리오 기준으로 처리됩니다.
              </div>
            </div>
          )}

          <div
            style={{
              marginBottom: 12,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              flexShrink: 0,
            }}
          >
            {conversations.length === 0 ? (
              <div style={{ fontSize: 12, color: "#64748b" }}>저장된 대화가 아직 없습니다.</div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setConversationId(conv.id)}
                  style={{
                    border:
                      conversationId === conv.id ? "1px solid #0f172a" : "1px solid #cbd5e1",
                    background: conversationId === conv.id ? "#e2e8f0" : "#fff",
                    borderRadius: 999,
                    padding: "8px 12px",
                    fontSize: 12,
                    cursor: "pointer",
                    maxWidth: 220,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontWeight: conversationId === conv.id ? 700 : 500,
                  }}
                  title={conv.title || "New Chat"}
                >
                  {conv.title || "New Chat"}
                </button>
              ))
            )}
          </div>

          <div
            ref={chatScrollRef}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              border: "1px solid #e2e8f0",
              borderRadius: 24,
              background:
                "radial-gradient(circle at top, rgba(59,130,246,0.06), transparent 30%), linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
              padding: 16,
              scrollBehavior: "smooth",
            }}
          >
            {isOnlyInitialState ? (
              <EmptyChatState
                onSuggestionClick={(text) => {
                  setInput(text);
                  requestAnimationFrame(() => {
                    focusInput();
                  });
                }}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "82%",
                        borderRadius: 22,
                        padding: 16,
                        boxShadow: "0 8px 20px rgba(15, 23, 42, 0.06)",
                        background: msg.role === "user" ? "#0f172a" : "#f1f5f9",
                        color: msg.role === "user" ? "#fff" : "#0f172a",
                        border: msg.role === "user" ? "none" : "1px solid #e2e8f0",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          fontSize: 12,
                          opacity: 0.85,
                          marginBottom: 8,
                          fontWeight: 700,
                        }}
                      >
                        {msg.role === "user" ? <User size={14} /> : <Bot size={14} />}
                        <span>{msg.role === "user" ? "🧑 You" : "🤖 Assistant"}</span>
                        <span>•</span>
                        <span>{msg.timestamp}</span>
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                        {msg.role === "assistant" ? `✨ ${msg.content}` : msg.content}
                      </div>
                    </div>
                  </div>
                ))}

                {loading && (
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    <div
                      style={{
                        borderRadius: 18,
                        background: "#f1f5f9",
                        padding: "14px 16px",
                        fontSize: 14,
                        color: "#475569",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      응답 생성 중...
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 12, flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="💬 Ask anything about Datadog, traces, errors..."
              style={{
                flex: 1,
                height: 52,
                borderRadius: 18,
                border: "1px solid #cbd5e1",
                padding: "0 18px",
                fontSize: 14,
                outline: "none",
                boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.03)",
                background: "#fff",
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !hydrated}
              style={{
                height: 52,
                border: "none",
                borderRadius: 18,
                padding: "0 20px",
                background: "#0f172a",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
                fontWeight: 800,
                opacity: loading || !hydrated ? 0.6 : 1,
                boxShadow: "0 10px 22px rgba(15, 23, 42, 0.16)",
              }}
            >
              <span>🚀</span>
              <Send size={16} />
              Send
            </button>
          </div>
        </div>

        <div
          style={{
            background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
            borderRadius: 28,
            boxShadow: "0 14px 40px rgba(15, 23, 42, 0.08)",
            padding: 18,
            border: "1px solid rgba(226,232,240,0.9)",
            height: "100%",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div style={{ flexShrink: 0 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 999,
                background: "#eef2ff",
                color: "#4338ca",
                fontSize: 12,
                fontWeight: 800,
                marginBottom: 12,
              }}
            >
              👀 Live Trace Summary
            </div>

            <div
              style={{
                fontSize: 13,
                color: "#64748b",
                lineHeight: 1.7,
                marginBottom: 16,
              }}
            >
              질문 이후에만 Trace / Latency / Span 정보가 차오르는 구조입니다.
            </div>

            <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
              {stats.map((stat) => (
                <StatBox key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} />
              ))}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              paddingRight: 2,
            }}
          >
            <div
              style={{
                borderRadius: 22,
                border: "1px solid #e2e8f0",
                background: "#fff",
                padding: 18,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 800,
                  color: "#0f172a",
                  marginBottom: 12,
                }}
              >
                <Activity size={16} />
                Span Timeline
              </div>

              {!currentTrace ? (
                <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.8 }}>
                  아직 실행된 요청이 없습니다.
                  <br />
                  왼쪽에서 질문을 보내면 span 정보가 여기에 표시됩니다.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {currentTrace.spans?.map((span, index) => (
                    <div
                      key={`${span.name}-${index}`}
                      style={{
                        borderRadius: 16,
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                        padding: 14,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "center",
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                          {span.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: span.status === "error" ? "#be123c" : "#166534",
                            background: span.status === "error" ? "#ffe4e6" : "#dcfce7",
                            padding: "4px 8px",
                            borderRadius: 999,
                          }}
                        >
                          {span.status}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Pill>{span.type}</Pill>
                        <Pill>{span.durationMs} ms</Pill>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                borderRadius: 22,
                border: "1px solid #e2e8f0",
                background: "#fff",
                padding: 18,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 800,
                  color: "#0f172a",
                  marginBottom: 12,
                }}
              >
                <Database size={16} />
                Request Metadata
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  <strong style={{ color: "#334155" }}>Workflow:</strong>{" "}
                  {currentTrace?.workflow || "-"}
                </div>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  <strong style={{ color: "#334155" }}>Provider:</strong>{" "}
                  {currentTrace?.provider || "-"}
                </div>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  <strong style={{ color: "#334155" }}>Started At:</strong>{" "}
                  {currentTrace?.startedAt || "-"}
                </div>
              </div>

              <div
                style={{
                  marginTop: 16,
                  borderRadius: 16,
                  background: "#f8fafc",
                  border: "1px dashed #cbd5e1",
                  padding: 14,
                  fontSize: 12,
                  color: "#64748b",
                  lineHeight: 1.7,
                }}
              >
                Datadog APM / RUM / Logs와 함께 보면,
                <br />
                프론트 이벤트 → 네트워크 요청 → 백엔드 처리 흐름을 한눈에 설명하기 좋습니다.
              </div>
            </div>
          </div>
        </div>
      </div>

      <ErrorModal
        errorState={errorState}
        onRetry={retryLastMessage}
        onDismiss={() => setErrorState(null)}
      />
    </div>
  );
}