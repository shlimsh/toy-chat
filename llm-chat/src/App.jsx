import React, { useEffect, useMemo, useRef, useState } from "react";
import { datadogRum } from "@datadog/browser-rum";
import { Bot, Send, User, Activity, Clock3, Database, Wrench } from "lucide-react";
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

function StatBox({ label, value }) {
  return (
    <div
      style={{
        background: "#f1f5f9",
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
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
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        background: dark ? "#e2e8f0" : "#fff",
        border: "1px solid #cbd5e1",
        color: "#334155",
      }}
    >
      {children}
    </span>
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

export default function App() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentTrace, setCurrentTrace] = useState(null);

  const [sessionId, setSessionId] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  const chatScrollRef = useRef(null);
  const inputRef = useRef(null);

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
        { label: "Model", value: "-" },
        { label: "Latency", value: "-" },
        { label: "Tokens", value: "-" },
        { label: "Cost", value: "-" },
      ];
    }

    return [
      { label: "Model", value: currentTrace.model },
      { label: "Latency", value: `${currentTrace.totalLatencyMs} ms` },
      { label: "Tokens", value: `${currentTrace.totalTokens}` },
      { label: "Cost", value: `$${currentTrace.costEstimate}` },
    ];
  }, [currentTrace]);

  const startNewChat = () => {
    localStorage.removeItem("conversationId");
    setConversationId(null);
    datadogRum.setGlobalContextProperty("app_conversation_id", null);
    setMessages(initialMessages);
    setCurrentTrace(null);

    requestAnimationFrame(() => {
      scrollChatToBottom("auto");
      focusInput();
    });
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading || !sessionId) return;

    datadogLogs.logger.info("chat_submit", {
      message_preview: trimmed.slice(0, 100),
      session_id: sessionId,
      conversation_id: conversationId || "new",
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
      const response = await fetch("http://localhost:3001/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          conversationId,
          message: trimmed,
        }),
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
        content: data?.text || "응답이 비어 있습니다.",
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
      const assistantMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: `에러: ${error.message}`,
        timestamp: new Date().toLocaleTimeString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      datadogLogs.logger.error("chat_response_error", {
        session_id: sessionId,
        conversation_id: conversationId || "unknown",
        error_message: error.message,
      });

      setCurrentTrace({
        traceId: "live-api-call",
        workflow: "chat-request",
        model: "-",
        provider: "OpenAI",
        totalLatencyMs: Date.now() - startedAt,
        promptTokens: "-",
        completionTokens: "-",
        totalTokens: "-",
        costEstimate: "-",
        startedAt: new Date(startedAt).toLocaleTimeString(),
        spans: [
          {
            name: "browser.fetch_/chat",
            type: "http",
            durationMs: Date.now() - startedAt,
            status: "error",
          },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: 24,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1.3fr 0.7fr",
          gap: 24,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
            padding: 24,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
              gap: 12,
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 28, color: "#0f172a" }}>LLM Chat Demo</h1>
              <p style={{ margin: "8px 0 0", fontSize: 14, color: "#64748b" }}>
                Datadog LLM Observability 데모용 채팅 화면
              </p>
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Pill>session: {sessionId ? sessionId.slice(0, 8) : "-"}</Pill>
                <Pill dark>conv: {conversationId ? conversationId.slice(0, 12) : "new"}</Pill>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "#e2e8f0",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Demo UI
              </div>
              <button
                onClick={startNewChat}
                style={{
                  height: 36,
                  border: "1px solid #cbd5e1",
                  borderRadius: 999,
                  padding: "0 14px",
                  background: "#fff",
                  color: "#0f172a",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                새 대화
              </button>
            </div>
          </div>

          <div
            style={{
              marginBottom: 16,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
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
              height: "68vh",
              overflowY: "auto",
              border: "1px solid #e2e8f0",
              borderRadius: 18,
              background: "#fff",
              padding: 16,
            }}
          >
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
                      maxWidth: "80%",
                      borderRadius: 18,
                      padding: 16,
                      boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)",
                      background: msg.role === "user" ? "#0f172a" : "#f1f5f9",
                      color: msg.role === "user" ? "#fff" : "#0f172a",
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
                      }}
                    >
                      {msg.role === "user" ? <User size={14} /> : <Bot size={14} />}
                      <span>{msg.role === "user" ? "You" : "Assistant"}</span>
                      <span>•</span>
                      <span>{msg.timestamp}</span>
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                      {msg.content}
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
                    }}
                  >
                    응답 생성 중...
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="질문을 입력하세요. 예: datadog에서 trace는 어떻게 보여?"
              style={{
                flex: 1,
                height: 48,
                borderRadius: 16,
                border: "1px solid #cbd5e1",
                padding: "0 16px",
                fontSize: 14,
                outline: "none",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !hydrated}
              style={{
                height: 48,
                border: "none",
                borderRadius: 16,
                padding: "0 18px",
                background: "#0f172a",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
                fontWeight: 600,
                opacity: loading || !hydrated ? 0.6 : 1,
              }}
            >
              <Send size={16} />
              전송
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              background: "#fff",
              borderRadius: 24,
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
              padding: 24,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                color: "#0f172a",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Activity size={20} />
              Trace Summary
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginTop: 16,
              }}
            >
              {stats.map((item) => (
                <StatBox key={item.label} label={item.label} value={item.value} />
              ))}
            </div>

            {currentTrace && (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: "1px solid #e2e8f0",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontSize: 14,
                  color: "#475569",
                }}
              >
                <div>
                  <strong style={{ color: "#0f172a" }}>Trace ID:</strong> {currentTrace.traceId}
                </div>
                <div>
                  <strong style={{ color: "#0f172a" }}>Workflow:</strong> {currentTrace.workflow}
                </div>
                <div>
                  <strong style={{ color: "#0f172a" }}>Provider:</strong> {currentTrace.provider}
                </div>
                <div>
                  <strong style={{ color: "#0f172a" }}>Started:</strong> {currentTrace.startedAt}
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              background: "#fff",
              borderRadius: 24,
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
              padding: 24,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>Span Timeline</h2>

            {!currentTrace ? (
              <p style={{ marginTop: 16, fontSize: 14, color: "#64748b" }}>
                메시지를 보내면 span 예시가 표시됩니다.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                {currentTrace.spans.map((span, index) => (
                  <div
                    key={`${span.name}-${index}`}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 16,
                      padding: 16,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                          {span.name}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          <Pill>{span.type}</Pill>
                          <Pill dark>{span.status}</Pill>
                        </div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#334155" }}>
                        {span.durationMs} ms
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              background: "#fff",
              borderRadius: 24,
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
              padding: 24,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>관찰 포인트</h2>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                marginTop: 16,
                fontSize: 14,
                color: "#334155",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Clock3 size={16} style={{ marginTop: 2 }} />
                <div>응답 지연 시간을 모델 호출과 retrieval 단계로 분리해서 볼 수 있습니다.</div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Database size={16} style={{ marginTop: 2 }} />
                <div>RAG가 있다면 retrieval latency와 문서 검색 결과를 별도로 연결할 수 있습니다.</div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Wrench size={16} style={{ marginTop: 2 }} />
                <div>Agent 구조라면 tool call을 span으로 남겨 병목과 실패 지점을 분석할 수 있습니다.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}