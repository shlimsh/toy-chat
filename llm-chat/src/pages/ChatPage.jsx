import React from "react";
import {
  Bot,
  Send,
  User,
  ServerCrash,
  MonitorSmartphone,
  CheckCircle2,
  Radar,
  AlertTriangle,
  X,
} from "lucide-react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function ErrorStateCard({ errorState, onRetry, onDismiss }) {
  if (!errorState) return null;

  return (
    <div style={styles.errorCard}>
      <div style={styles.errorCardTop}>
        <div style={styles.errorCardTitle}>
          <AlertTriangle size={16} />
          <strong>요청 실패</strong>
        </div>
        <button onClick={onDismiss} style={styles.errorInlineClose}>
          <X size={14} />
        </button>
      </div>

      <div style={styles.errorCardBody}>{errorState}</div>

      <div style={styles.errorActions}>
        <button onClick={onRetry} style={styles.errorPrimaryButton}>
          다시 시도
        </button>
        <button onClick={onDismiss} style={styles.errorGhostButton}>
          닫기
        </button>
      </div>
    </div>
  );
}

function ModeCard({ active, title, subtitle, icon, tone = "default", onClick }) {
  const danger = tone === "danger";

  return (
    <button
      onClick={onClick}
      style={{
        ...styles.modeCard,
        ...(danger ? styles.modeCardDanger : styles.modeCardDefault),
        ...(active
          ? danger
            ? styles.modeCardDangerActive
            : styles.modeCardDefaultActive
          : {}),
      }}
    >
      <div
        style={{
          ...styles.modeIconWrap,
          ...(active ? styles.modeIconWrapActive : {}),
        }}
      >
        {icon}
      </div>

      <div style={styles.modeTextWrap}>
        <div style={styles.modeTitle}>{title}</div>
        <div style={styles.modeSubtitle}>{subtitle}</div>
      </div>
    </button>
  );
}

function groupMessages(messages = []) {
  const groups = [];
  let currentUser = null;
  let assistants = [];
  let orphanAssistants = [];

  messages.forEach((msg) => {
    if (msg.role === "user") {
      if (orphanAssistants.length > 0) {
        groups.push({
          user: null,
          assistants: orphanAssistants,
        });
        orphanAssistants = [];
      }

      if (currentUser) {
        groups.push({
          user: currentUser,
          assistants,
        });
      }

      currentUser = msg;
      assistants = [];
      return;
    }

    if (msg.role === "assistant") {
      if (!currentUser) {
        orphanAssistants.push(msg);
        return;
      }

      assistants.push(msg);
    }
  });

  if (orphanAssistants.length > 0) {
    groups.push({
      user: null,
      assistants: orphanAssistants,
    });
  }

  if (currentUser) {
    groups.push({
      user: currentUser,
      assistants,
    });
  }

  return groups;
}

function ModelAnswerCard({ message, answerIndex = 0 }) {
  const fallbackProvider = answerIndex === 1 ? "Azure AI" : "OpenAI";
  const fallbackModel = answerIndex === 1 ? "grok-4.3" : "gpt-5-mini";

  const provider =
    message.provider && message.provider !== "-" ? message.provider : fallbackProvider;

  const model =
    message.model && message.model !== "-" ? message.model : fallbackModel;

  const isAzure = String(provider).toLowerCase().includes("azure");

  return (
    <div
      style={{
        ...styles.compareCard,
        ...(isAzure ? styles.compareCardAzure : styles.compareCardOpenAI),
      }}
    >
      <div style={styles.modelHeader}>
        <div style={styles.modelHeaderLeft}>
          <div
            style={{
              ...styles.modelIcon,
              ...(isAzure ? styles.azureIcon : styles.openaiIcon),
            }}
          >
            {isAzure ? "🧊" : "֎"}
          </div>

          <div style={styles.modelTitleWrap}>
            <div style={styles.providerName}>{provider}</div>
            <div style={styles.modelName}>{model}</div>
          </div>
        </div>

        <span
          style={{
            ...styles.providerBadge,
            ...(isAzure ? styles.providerBadgeAzure : styles.providerBadgeOpenAI),
          }}
        >
          {isAzure ? "Azure" : "OpenAI"}
        </span>
      </div>

      <div style={styles.answerScrollArea}>
        <div style={styles.answerText}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p style={styles.mdP}>{children}</p>,
              ul: ({ children }) => <ul style={styles.mdUl}>{children}</ul>,
              ol: ({ children }) => <ol style={styles.mdOl}>{children}</ol>,
              li: ({ children }) => <li style={styles.mdLi}>{children}</li>,
              strong: ({ children }) => (
                <strong style={styles.mdStrong}>{children}</strong>
              ),
              h1: ({ children }) => <h1 style={styles.mdH1}>{children}</h1>,
              h2: ({ children }) => <h2 style={styles.mdH2}>{children}</h2>,
              h3: ({ children }) => <h3 style={styles.mdH3}>{children}</h3>,
              code: ({ children }) => (
                <code style={styles.mdCode}>{children}</code>
              ),
            }}
          >
            {message.content || ""}
          </ReactMarkdown>
        </div>
      </div>

      <div style={styles.answerTimestamp}>{message.timestamp}</div>
    </div>
  );
}

export default function ChatPage({
  TEST_MODES,
  selectedMode,
  setMode,
  messages,
  loading,
  errorState,
  retryLastMessage,
  setErrorState,
  input,
  setInput,
  sendMessage,
  chatScrollRef,
  inputRef,
}) {
  const groupedMessages = groupMessages(messages);

  return (
    <>
      <div style={styles.modeGrid}>
        <ModeCard
          active={selectedMode === TEST_MODES.NORMAL}
          icon={<CheckCircle2 size={18} color="#2563eb" />}
          title="Normal"
          subtitle="정상 응답 모드"
          onClick={() => setMode(TEST_MODES.NORMAL)}
        />
        <ModeCard
          active={selectedMode === TEST_MODES.BACKEND}
          icon={<ServerCrash size={18} color="#e11d48" />}
          title="Backend"
          subtitle="서버 에러 재현"
          tone="danger"
          onClick={() => setMode(TEST_MODES.BACKEND)}
        />
        <ModeCard
          active={selectedMode === TEST_MODES.NETWORK}
          icon={<Radar size={18} color="#e11d48" />}
          title="Network"
          subtitle="연결 실패 재현"
          tone="danger"
          onClick={() => setMode(TEST_MODES.NETWORK)}
        />
        <ModeCard
          active={selectedMode === TEST_MODES.FRONTEND}
          icon={<MonitorSmartphone size={18} color="#e11d48" />}
          title="Frontend"
          subtitle="브라우저 에러 재현"
          tone="danger"
          onClick={() => setMode(TEST_MODES.FRONTEND)}
        />
      </div>

      <div style={styles.chatWrap}>
        <div ref={chatScrollRef} style={styles.chatBody}>
          {groupedMessages.map((group, groupIndex) => (
            <div key={`group-${groupIndex}`} style={styles.messageGroup}>
              {group.user ? (
                <div style={styles.userRow}>
                  <div style={styles.userBubble}>
                    <div style={styles.bubbleMeta}>
                      <User size={13} />
                      <span>{group.user.timestamp}</span>
                    </div>
                    <div style={styles.bubbleText}>{group.user.content}</div>
                  </div>
                </div>
              ) : null}

              {group.assistants.length > 0 ? (
                <div
                  style={{
                    ...styles.compareGrid,
                    gridTemplateColumns:
                      group.assistants.length === 1
                        ? "minmax(0, 1fr)"
                        : "repeat(2, minmax(0, 1fr))",
                  }}
                >
{group.assistants.map((msg, index) => (
  <ModelAnswerCard
    key={msg.id}
    message={msg}
    answerIndex={index}
  />
))}
                </div>
              ) : null}
            </div>
          ))}

          {loading ? (
            <div style={styles.loadingRow}>
              <div style={styles.loadingCard}>
                <Bot size={14} />
                <span>OpenAI와 Azure AI 답변 생성 중...</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div style={styles.errorWrap}>
        <ErrorStateCard
          errorState={errorState}
          onRetry={retryLastMessage}
          onDismiss={() => setErrorState(null)}
        />
      </div>

      <div style={styles.inputRow}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="질문을 입력하세요"
          style={styles.chatInput}
        />
        <button onClick={sendMessage} style={styles.sendButton}>
          <Send size={16} />
        </button>
      </div>
    </>
  );
}

const styles = {
  modeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 18,
    flexShrink: 0,
  },
  modeCard: {
    borderRadius: 24,
    padding: 14,
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.15s ease",
    minHeight: 88,
  },
  modeCardDefault: {
    border: "1px solid #dbe7f5",
    background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
    boxShadow: "0 12px 26px rgba(15,23,42,0.04)",
  },
  modeCardDanger: {
    border: "1px solid #f3d1d8",
    background: "linear-gradient(180deg, #ffffff 0%, #fff8f9 100%)",
    boxShadow: "0 12px 26px rgba(15,23,42,0.04)",
  },
  modeCardDefaultActive: {
    background: "linear-gradient(135deg, #eff6ff, #dbeafe)",
    borderColor: "#93c5fd",
    boxShadow: "0 16px 32px rgba(37,99,235,0.10)",
  },
  modeCardDangerActive: {
    background: "linear-gradient(135deg, #fff1f2, #ffe4e6)",
    borderColor: "#fda4af",
    boxShadow: "0 16px 32px rgba(225,29,72,0.10)",
  },
  modeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    background: "#fff",
    border: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
  },
  modeIconWrapActive: {
    transform: "scale(1.02)",
  },
  modeTextWrap: {
    minWidth: 0,
  },
  modeTitle: {
    fontWeight: 900,
    color: "#0f172a",
    fontSize: 15,
    marginBottom: 4,
  },
  modeSubtitle: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 1.45,
  },
  chatWrap: {
    borderRadius: 26,
    padding: 16,
    marginBottom: 12,
    background: "linear-gradient(180deg, #fbfdff 0%, #f8fafc 100%)",
    border: "1px solid #e2e8f0",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
  },
  chatBody: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingRight: 6,
  },
  messageGroup: {
    marginBottom: 22,
  },
  userRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginBottom: 12,
  },
  userBubble: {
    maxWidth: "76%",
    borderRadius: 22,
    padding: 14,
    lineHeight: 1.65,
    background: "#0f172a",
    color: "#fff",
    boxShadow: "0 12px 28px rgba(15,23,42,0.16)",
  },
  bubbleMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    opacity: 0.8,
    marginBottom: 8,
  },
  bubbleText: {
    fontSize: 13,
    whiteSpace: "pre-wrap",
    letterSpacing: "-0.1px",
  },
compareGrid: {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
  alignItems: "stretch",
},

compareCard: {
  border: "1px solid #e2e8f0",
  borderRadius: 22,
  background: "#fff",
  padding: 16,
  boxShadow: "0 10px 22px rgba(15,23,42,0.05)",
  minWidth: 0,
  height: 420,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
},

compareCardOpenAI: {
  borderTop: "3px solid #6b7280",
},

compareCardAzure: {
  borderTop: "3px solid #38bdf8",
},

modelTitleWrap: {
  flex: 1,
  minWidth: 0,
  margin: 0,
  padding: 0,
  textAlign: "left",
},

providerBadge: {
  width: 58,
  height: 34,

  flexShrink: 0,

  display: "flex",
  alignItems: "center",
  justifyContent: "center",

  borderRadius: 999,

  fontSize: 10,
  fontWeight: 800,
},

providerBadgeOpenAI: {
  color: "#374151",
  background: "#f3f4f6",
  borderColor: "#d1d5db",
},

providerBadgeAzure: {
  color: "#0369a1",
  background: "#f0f9ff",
  borderColor: "#bae6fd",
},

answerScrollArea: {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  paddingRight: 6,
  paddingLeft: 0,
},
modelHeader: {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
  paddingBottom: 12,
  borderBottom: "1px solid #edf2f7",
},

modelHeaderLeft: {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flex: 1,
  minWidth: 0,
  textAlign: "left",
},

modelIcon: {
  width: 36,
  height: 36,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  border: "1px solid #e2e8f0",
},
openaiIcon: {
  background: "#f3f4f6",
  color: "#374151",
},
  azureIcon: {
    background: "#f0f9ff",
  },
providerName: {
  display: "block",
  width: "100%",
  fontSize: 14,
  fontWeight: 900,
  color: "#0f172a",
  lineHeight: 1.2,
  margin: 0,
  padding: 0,
  textAlign: "left",
},
modelName: {
  display: "block",
  width: "100%",
  marginTop: 4,
  fontSize: 12,
  color: "#64748b",
  fontWeight: 700,
  lineHeight: 1.2,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textAlign: "left",
},
answerText: {
  fontSize: 13,
  color: "#0f172a",
  lineHeight: 1.75,
  letterSpacing: "-0.1px",
  wordBreak: "keep-all",
  textAlign: "left",
},

answerTimestamp: {
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #f1f5f9",
  fontSize: 11,
  color: "#94a3b8",
  fontWeight: 700,
  flexShrink: 0,
},
  loadingRow: {
    display: "flex",
    justifyContent: "flex-start",
  },
  loadingCard: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 18,
    padding: "12px 14px",
    background: "#fff",
    color: "#475569",
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 22px rgba(15,23,42,0.05)",
    fontSize: 13,
    fontWeight: 800,
  },
  errorWrap: {
    flexShrink: 0,
    marginBottom: 2,
  },
  errorCard: {
    borderRadius: 22,
    padding: 14,
    border: "1px solid #fecdd3",
    background: "linear-gradient(180deg, #fff7f8 0%, #fff1f2 100%)",
    color: "#be123c",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxShadow: "0 10px 24px rgba(190,24,93,0.06)",
  },
  errorCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  errorCardTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  errorCardBody: {
    fontSize: 13,
    lineHeight: 1.7,
  },
  errorInlineClose: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "1px solid #fda4af",
    background: "#fff",
    color: "#be123c",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  errorActions: {
    display: "flex",
    gap: 8,
  },
  errorPrimaryButton: {
    height: 36,
    borderRadius: 999,
    border: "none",
    background: "#be123c",
    color: "#fff",
    padding: "0 14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  errorGhostButton: {
    height: 36,
    borderRadius: 999,
    border: "1px solid #fda4af",
    background: "#fff",
    color: "#be123c",
    padding: "0 14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  inputRow: {
    marginTop: 12,
    display: "flex",
    gap: 10,
    flexShrink: 0,
  },
  chatInput: {
    flex: 1,
    height: 54,
    borderRadius: 999,
    border: "1px solid #cfd8e3",
    padding: "0 18px",
    outline: "none",
    fontSize: 14,
    background: "#fff",
    boxShadow: "0 8px 18px rgba(15,23,42,0.03)",
  },
  sendButton: {
    width: 54,
    border: "none",
    background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
    color: "#fff",
    borderRadius: "50%",
    cursor: "pointer",
    boxShadow: "0 12px 24px rgba(15,23,42,0.18)",
  },
 mdH1: {
  fontSize: 18,
  fontWeight: 900,
  margin: "0 0 12px",
  color: "#0f172a",
},

mdH2: {
  fontSize: 16,
  fontWeight: 900,
  margin: "0 0 10px",
  color: "#0f172a",
},

mdH3: {
  fontSize: 14,
  fontWeight: 900,
  margin: "10px 0 8px",
  color: "#0f172a",
},

mdP: {
  margin: "0 0 10px",
  lineHeight: 1.75,
},

mdUl: {
  margin: "6px 0 10px",
  paddingLeft: 16,
  listStylePosition: "outside",
},

mdOl: {
  margin: "6px 0 10px",
  paddingLeft: 16,
  listStylePosition: "outside",
},

mdLi: {
  marginBottom: 5,
  lineHeight: 1.7,
  paddingLeft: 0,
},

mdStrong: {
  fontWeight: 900,
  color: "#111827",
},

mdCode: {
  background: "#f1f5f9",
  padding: "2px 6px",
  borderRadius: 6,
  fontFamily: "Consolas, monospace",
  fontSize: 12,
},
};