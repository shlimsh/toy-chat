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
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  ...styles.bubble,
                  ...(msg.role === "user"
                    ? styles.userBubble
                    : styles.assistantBubble),
                }}
              >
                <div style={styles.bubbleMeta}>
                  {msg.role === "user" ? <User size={13} /> : <Bot size={13} />}
                  <span>{msg.timestamp}</span>
                </div>
                <div style={styles.bubbleText}>{msg.content}</div>
              </div>
            </div>
          ))}

          {loading ? (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={styles.assistantBubble}>답변 생성 중...</div>
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
  bubble: {
    maxWidth: "76%",
    borderRadius: 22,
    padding: 14,
    lineHeight: 1.65,
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
  userBubble: {
    background: "#0f172a",
    color: "#fff",
    boxShadow: "0 12px 28px rgba(15,23,42,0.16)",
  },
  assistantBubble: {
    background: "#fff",
    color: "#0f172a",
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 22px rgba(15,23,42,0.05)",
    fontSize: 13,
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
};
