import React, { useEffect, useMemo, useRef, useState } from "react";
import { datadogRum } from "@datadog/browser-rum";
import { datadogLogs } from "@datadog/browser-logs";
import {
  Bot,
  Send,
  User,
  LogOut,
  Sparkles,
  Activity,
  Database,
  Wrench,
  AlertTriangle,
  X,
  ServerCrash,
  MonitorSmartphone,
  CheckCircle2,
  Radar,
} from "lucide-react";

const API_BASE_URL = "";

const TEST_MODES = {
  NORMAL: "normal",
  BACKEND: "backend",
  NETWORK: "network",
  FRONTEND: "frontend",
};

const toSafeDate = (value) => {
  if (!value) return new Date();

  if (typeof value === "string") {
    const normalized = value.includes(" ") ? value.replace(" ", "T") : value;
    return new Date(normalized);
  }

  return new Date(value);
};

const pad2 = (num) => String(num).padStart(2, "0");

const formatSeoulDateTime = (value = new Date()) => {
  const date = toSafeDate(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value || "";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");

  return `${year}.${month}.${day} ${hour}:${minute}:${second}`;
};

const formatRelativeTime = (value) => {
  const date = toSafeDate(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 10) return "방금";
  if (diffSec < 60) return `${diffSec}초 전`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;

  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}일 전`;
};

const buildTimestampLabel = (rawCreatedAt) => {
  if (!rawCreatedAt) {
    return formatSeoulDateTime(new Date());
  }

  const relative = formatRelativeTime(rawCreatedAt);
  const absolute = formatSeoulDateTime(rawCreatedAt);

  if (!relative) return absolute;
  if (!absolute) return relative;

  return `${relative} · ${absolute}`;
};

const makeLocalTimestamp = () => {
  const now = new Date().toISOString();
  return {
    rawCreatedAt: now,
    timestamp: buildTimestampLabel(now),
  };
};

const initialMessages = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "안녕하세요. 로그인 기반 Datadog 데모 채팅입니다. 질문을 입력하면 채팅과 함께 trace 정보가 오른쪽 패널에 표시됩니다.",
    ...makeLocalTimestamp(),
  },
];

function Modal({
  open,
  title,
  description,
  onClose,
  onAction,
  actionLabel,
  tone = "default",
}) {
  if (!open) return null;

  const isDanger = tone === "danger";

  return (
    <div style={styles.modalBackdrop}>
      <div
        style={{
          ...styles.modalCard,
          ...(isDanger ? styles.modalCardDanger : styles.modalCardDefault),
        }}
      >
        <div
          style={{
            ...styles.modalHeader,
            ...(isDanger ? styles.modalHeaderDanger : styles.modalHeaderDefault),
          }}
        >
          <div style={styles.modalTitleWrap}>
            <div
              style={{
                ...styles.modalIconWrap,
                ...(isDanger
                  ? styles.modalIconWrapDanger
                  : styles.modalIconWrapDefault),
              }}
            >
              <AlertTriangle
                size={18}
                color={isDanger ? "#e11d48" : "#2563eb"}
              />
            </div>
            <div>
              <div style={styles.modalEyebrow}>TEST MODE</div>
              <strong style={styles.modalTitle}>{title}</strong>
            </div>
          </div>

          <button onClick={onClose} style={styles.iconCloseButton}>
            <X size={16} />
          </button>
        </div>

        <div style={styles.modalBody}>{description}</div>

        <div style={styles.modalFooter}>
          {onAction ? (
            <button onClick={onAction} style={styles.modalPrimaryButton}>
              {actionLabel || "확인"}
            </button>
          ) : null}
          <button onClick={onClose} style={styles.modalGhostButton}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

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

function TracePanel({
  user,
  stats,
  conversations,
  conversationId,
  onSelectConversation,
  onNewChat,
  currentTrace,
}) {
  return (
    <div style={styles.sidePanel}>
      <div style={styles.sideTopSection}>
        <div style={styles.badgeBlue}>
          <Activity size={13} />
          Trace Summary
        </div>
        <div style={styles.sideTitle}>Observability Panel</div>
        <div style={styles.sideSub}>
          {user.name} · {user.email}
        </div>
      </div>

      <div style={styles.statsGrid}>
        {stats.map((item) => (
          <div key={item.label} style={styles.statCard}>
            <div style={styles.statIcon}>{item.icon}</div>
            <div style={styles.statLabel}>{item.label}</div>
            <div style={styles.statValue}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={styles.sideBox}>
        <div style={styles.sideSectionTitle}>
          <Database size={16} />
          Conversation History
        </div>

        <button onClick={onNewChat} style={styles.smallPillButton}>
          새 대화
        </button>

        <div style={styles.historyList}>
          {conversations.length === 0 ? (
            <div style={styles.emptyHistory}>아직 대화가 없습니다.</div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                style={{
                  ...styles.historyItem,
                  ...(conversationId === conv.id
                    ? styles.historyItemActive
                    : {}),
                }}
              >
                {conv.title}
              </button>
            ))
          )}
        </div>
      </div>

      <div style={{ ...styles.sideBox, flex: 1, minHeight: 0 }}>
        <div style={styles.sideSectionTitle}>
          <Wrench size={16} />
          Current Trace
        </div>

        <div style={styles.traceText}>
          <div>
            <strong>Model:</strong> {currentTrace?.model || "-"}
          </div>
          <div>
            <strong>Latency:</strong>{" "}
            {currentTrace?.totalLatencyMs !== undefined
              ? `${currentTrace.totalLatencyMs} ms`
              : "-"}
          </div>
          <div>
            <strong>Tokens:</strong>{" "}
            {currentTrace?.totalTokens !== undefined
              ? currentTrace.totalTokens
              : "-"}
          </div>
          <div>
            <strong>Cost:</strong> {currentTrace?.costEstimate || "-"}
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthScreen({ onLoginSuccess }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (
      !email.trim() ||
      !password.trim() ||
      (mode === "register" && !name.trim())
    ) {
      setError(
        mode === "login"
          ? "이메일과 비밀번호를 입력해 주세요."
          : "이름, 이메일, 비밀번호를 모두 입력해 주세요."
      );
      return;
    }

    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const body =
        mode === "login"
          ? { email: email.trim(), password }
          : { name: name.trim(), email: email.trim(), password };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "요청 처리 중 오류가 발생했습니다."
        );
      }

      localStorage.setItem("authToken", data.token);
      localStorage.setItem("authUser", JSON.stringify(data.user));

      datadogRum.setUser({
        id: String(data.user.id),
        email: data.user.email,
        name: data.user.name,
      });

      datadogLogs.setUser({
        id: String(data.user.id),
        email: data.user.email,
        name: data.user.name,
      });

      onLoginSuccess(data.user, data.token);
    } catch (err) {
      setError(err?.message ?? "로그인 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setName("");
    setEmail("");
    setPassword("");
    setError("");
  };

  const isSubmitDisabled =
    loading ||
    !email.trim() ||
    !password.trim() ||
    (mode === "register" && !name.trim());

  return (
    <div style={styles.authWrap}>
      <div style={styles.authOuter}>
        <div className="auth-card" style={styles.authCard}>
          <div style={styles.authBrand}>toy-chat</div>

          <div style={styles.authIntro}>
            <div style={styles.authSubtitle}>
              {mode === "login"
                ? "계정 정보를 입력하여 서비스를 시작하세요."
                : "새 계정을 만들고 바로 대화를 시작하세요."}
            </div>
          </div>

          <form onSubmit={submit} style={styles.authForm}>
            {mode === "register" && (
              <input
                type="text"
                className="auth-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="이름"
                autoComplete="name"
                style={styles.authInput}
              />
            )}

            <input
              type="email"
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              autoComplete="email"
              style={styles.authInput}
            />

            <input
              type="password"
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              style={styles.authInput}
            />

            {error ? (
              <div className="auth-error" style={styles.authError}>
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              className="auth-submit"
              disabled={isSubmitDisabled}
              style={{
                ...styles.authSubmit,
                ...(isSubmitDisabled ? styles.authSubmitDisabled : {}),
              }}
            >
              {loading
                ? "처리 중..."
                : mode === "login"
                ? "로그인"
                : "회원가입"}
            </button>
          </form>

          <div style={styles.authDivider}>
            <span style={styles.authDividerLine} />
            <span style={styles.authDividerText}>또는</span>
            <span style={styles.authDividerLine} />
          </div>

          <button
            type="button"
            style={styles.authGhostButton}
            onClick={() =>
              switchMode(mode === "login" ? "register" : "login")
            }
          >
            {mode === "login"
              ? "계정이 없으신가요? 회원가입"
              : "이미 계정이 있으신가요? 로그인"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("authToken"));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("authUser");
    return raw ? JSON.parse(raw) : null;
  });
  const [authChecking, setAuthChecking] = useState(true);

  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentTrace, setCurrentTrace] = useState(null);
  const [conversationId, setConversationId] = useState(
    localStorage.getItem("conversationId")
  );
  const [conversations, setConversations] = useState([]);
  const [errorState, setErrorState] = useState(null);
  const [lastSubmittedMessage, setLastSubmittedMessage] = useState("");
  const [selectedMode, setSelectedMode] = useState(TEST_MODES.NORMAL);

  const [modal, setModal] = useState({
    open: false,
    title: "",
    description: "",
    action: null,
    actionLabel: "",
    tone: "default",
  });

  const chatScrollRef = useRef(null);
  const inputRef = useRef(null);

  const clearSession = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUser");
    localStorage.removeItem("conversationId");

    setToken(null);
    setUser(null);
    setConversationId(null);
    setConversations([]);
    setMessages(initialMessages);
    setCurrentTrace(null);
    setErrorState(null);

    datadogRum.clearUser();
    datadogLogs.clearUser();
  };

  useEffect(() => {
    const validateSession = async () => {
      const savedToken = localStorage.getItem("authToken");
      const savedUserRaw = localStorage.getItem("authUser");

      if (!savedToken || !savedUserRaw) {
        clearSession();
        setAuthChecking(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${savedToken}`,
          },
        });

        const data = await response.json();

        if (!response.ok || !data?.user) {
          throw new Error(data?.error || "invalid session");
        }

        setToken(savedToken);
        setUser(data.user);
        localStorage.setItem("authUser", JSON.stringify(data.user));

        datadogRum.setUser({
          id: String(data.user.id),
          email: data.user.email,
          name: data.user.name,
        });

        datadogLogs.setUser({
          id: String(data.user.id),
          email: data.user.email,
          name: data.user.name,
        });
      } catch {
        clearSession();
      } finally {
        setAuthChecking(false);
      }
    };

    validateSession();
  }, []);

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  const stats = useMemo(() => {
    if (!currentTrace) {
      return [
        { label: "Model", value: "-", icon: "🤖" },
        { label: "Latency", value: "-", icon: "⚡" },
        { label: "Tokens", value: "-", icon: "🧮" },
        { label: "Cost", value: "$-", icon: "💰" },
      ];
    }

    return [
      { label: "Model", value: currentTrace.model || "-", icon: "🤖" },
      {
        label: "Latency",
        value:
          currentTrace.totalLatencyMs !== undefined
            ? `${currentTrace.totalLatencyMs} ms`
            : "-",
        icon: "⚡",
      },
      {
        label: "Tokens",
        value:
          currentTrace.totalTokens !== undefined
            ? `${currentTrace.totalTokens}`
            : "-",
        icon: "🧮",
      },
      {
        label: "Cost",
        value: `$${currentTrace.costEstimate || "-"}`,
        icon: "💰",
      },
    ];
  }, [currentTrace]);

  const openModal = (
    title,
    description,
    action = null,
    actionLabel = "",
    tone = "default"
  ) => {
    setModal({
      open: true,
      title,
      description,
      action,
      actionLabel,
      tone,
    });
  };

  const closeModal = () => {
    setModal({
      open: false,
      title: "",
      description: "",
      action: null,
      actionLabel: "",
      tone: "default",
    });
  };

  const scrollToBottom = () => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  };

  const focusInput = () => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const loadConversations = async () => {
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/conversations`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "failed to load conversations");
      }

      setConversations(data.conversations || []);
    } catch (error) {
      console.error(error);
    }
  };

  const loadMessages = async (targetConversationId) => {
    if (!targetConversationId || !token) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/conversations/${targetConversationId}/messages`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "failed to load messages");
      }

      const restored = (data.messages || [])
        .filter((msg) => msg.role === "user" || msg.role === "assistant")
        .map((msg, index) => ({
          id: msg.id || `${msg.role}-${index}`,
          role: msg.role,
          content: msg.content,
          rawCreatedAt: msg.created_at,
          timestamp: buildTimestampLabel(msg.created_at),
        }));

      setMessages(restored.length > 0 ? restored : initialMessages);
      requestAnimationFrame(scrollToBottom);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (token) {
      loadConversations();
    }
  }, [token]);

  useEffect(() => {
    if (conversationId) {
      localStorage.setItem("conversationId", conversationId);
      loadMessages(conversationId);
    } else {
      localStorage.removeItem("conversationId");
      setMessages(initialMessages);
      setCurrentTrace(null);
    }
  }, [conversationId]);

  useEffect(() => {
    requestAnimationFrame(scrollToBottom);
  }, [messages, loading]);

  const logout = () => {
    clearSession();
  };

  const startNewChat = () => {
    setConversationId(null);
    setMessages(initialMessages);
    setCurrentTrace(null);
    setErrorState(null);
    localStorage.removeItem("conversationId");
    focusInput();
  };

  const retryLastMessage = () => {
    if (!lastSubmittedMessage) return;
    setInput(lastSubmittedMessage);
    setErrorState(null);
    focusInput();
  };

  const setMode = (mode) => {
    setSelectedMode(mode);

    const modeDescription = {
      [TEST_MODES.NORMAL]:
        "현재 모드는 Normal 입니다. 일반 질문은 정상 응답 흐름으로 처리됩니다.",
      [TEST_MODES.BACKEND]:
        "현재 모드는 Backend Error 입니다. 다음 요청은 forceError=true로 서버 에러를 재현합니다.",
      [TEST_MODES.NETWORK]:
        "현재 모드는 Network Error 입니다. 전송 시 잘못된 API 엔드포인트 호출로 네트워크 실패를 재현합니다.",
      [TEST_MODES.FRONTEND]:
        "현재 모드는 Frontend Error 입니다. 전송 시 브라우저 런타임 에러를 강제로 발생시킵니다.",
    };

    openModal(
      "현재 테스트 모드",
      modeDescription[mode],
      null,
      "",
      mode === TEST_MODES.NORMAL ? "default" : "danger"
    );
  };

  const triggerNetworkMode = async () => {
    try {
      await fetch("http://127.0.0.1:3999/not-found", {
        method: "POST",
      });
    } catch (error) {
      const localTime = makeLocalTimestamp();

      setErrorState(`네트워크 에러 발생: ${error.message}`);
      setMessages((prev) => [
        ...prev,
        {
          id: `net-${Date.now()}`,
          role: "assistant",
          content: `에러 발생: ${error.message}`,
          ...localTime,
        },
      ]);
    }
  };

  const triggerFrontendMode = () => {
    setTimeout(() => {
      throw new Error("Intentional frontend error for demo");
    }, 0);
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading || !token) return;

    setLastSubmittedMessage(trimmed);
    setErrorState(null);

    if (selectedMode === TEST_MODES.NETWORK) {
      await triggerNetworkMode();
      return;
    }

    if (selectedMode === TEST_MODES.FRONTEND) {
      triggerFrontendMode();
      return;
    }

    const userTime = makeLocalTimestamp();

    const userMessage = {
      id: Date.now(),
      role: "user",
      content: trimmed,
      ...userTime,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          conversationId,
          message: trimmed,
          ...(selectedMode === TEST_MODES.BACKEND ? { forceError: true } : {}),
        }),
      });

      const text = await response.text();

      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(text || `HTTP ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      if (data?.conversationId) {
        setConversationId(data.conversationId);
      }

      const assistantRawCreatedAt =
        data?.message?.created_at || new Date().toISOString();

      setMessages((prev) => [
        ...prev,
        {
          id: data.message.id,
          role: "assistant",
          content: data.message.content,
          rawCreatedAt: assistantRawCreatedAt,
          timestamp: buildTimestampLabel(assistantRawCreatedAt),
        },
      ]);

      setCurrentTrace(data.trace || null);
      loadConversations();
    } catch (error) {
      const localTime = makeLocalTimestamp();

      setErrorState(error.message);

      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `에러 발생: ${error.message}`,
          ...localTime,
        },
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(scrollToBottom);
      focusInput();
    }
  };

  if (authChecking) {
    return (
      <div style={styles.authWrap}>
        <div style={styles.authOuter}>
          <div className="auth-card" style={styles.authCard}>
            <div style={styles.authBrand}>toy-chat</div>
            <div style={styles.authIntro}>
              <div style={styles.authTitle}>세션 확인 중</div>
              <div style={styles.authSubtitle}>
                로그인 정보를 확인하고 있습니다.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <AuthScreen
        onLoginSuccess={(nextUser, nextToken) => {
          setUser(nextUser);
          setToken(nextToken);
          setAuthChecking(false);
        }}
      />
    );
  }

  return (
    <div style={styles.page}>
      <Modal
        open={modal.open}
        title={modal.title}
        description={modal.description}
        onClose={closeModal}
        onAction={modal.action}
        actionLabel={modal.actionLabel}
        tone={modal.tone}
      />

      <div style={styles.layout}>
        <div style={styles.mainPanel}>
          <div style={styles.header}>
            <div style={styles.headerLeft}>
              <div style={styles.badgeBlue}>
                <Sparkles size={13} />
                Datadog Demo
              </div>

              <h1 style={styles.title}>LLM Chat Playground</h1>

              <p style={styles.subtitle}>
                ChatGPT처럼 시작하고, Datadog처럼 분석하는 데모 UI
              </p>

              <div style={styles.pillRow}>
                <div style={styles.pill}>user: {user.name}</div>
                <div style={styles.pill}>email: {user.email}</div>
                <div style={styles.pillDark}>
                  conv: {conversationId ? conversationId.slice(0, 12) : "new"}
                </div>
              </div>
            </div>

            <div style={styles.headerActions}>
              <button onClick={startNewChat} style={styles.topButton}>
                새 대화
              </button>
              <button onClick={logout} style={styles.topButton}>
                <LogOut size={14} />
                로그아웃
              </button>
            </div>
          </div>

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
                    justifyContent:
                      msg.role === "user" ? "flex-end" : "flex-start",
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
                      {msg.role === "user" ? (
                        <User size={13} />
                      ) : (
                        <Bot size={13} />
                      )}
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
        </div>

        <TracePanel
          user={user}
          stats={stats}
          conversations={conversations}
          conversationId={conversationId}
          onSelectConversation={setConversationId}
          onNewChat={startNewChat}
          currentTrace={currentTrace}
        />
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100svh",
    background:
      "radial-gradient(circle at top, rgba(59,130,246,0.08), transparent 24%), linear-gradient(180deg, #f8fbff 0%, #f8fafc 100%)",
    padding: 18,
    fontFamily: "Arial, sans-serif",
  },
  layout: {
    width: "min(1360px, calc(100vw - 36px))",
    height: "calc(100svh - 36px)",
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "1.35fr 0.65fr",
    gap: 18,
  },
  mainPanel: {
    background: "rgba(255,255,255,0.94)",
    backdropFilter: "blur(16px)",
    borderRadius: 32,
    boxShadow: "0 20px 54px rgba(15,23,42,0.08)",
    padding: 22,
    display: "flex",
    flexDirection: "column",
    border: "1px solid rgba(226,232,240,0.95)",
    minHeight: 0,
    overflow: "hidden",
  },
  sidePanel: {
    background: "rgba(255,255,255,0.94)",
    backdropFilter: "blur(16px)",
    borderRadius: 32,
    boxShadow: "0 20px 54px rgba(15,23,42,0.08)",
    padding: 22,
    display: "flex",
    flexDirection: "column",
    border: "1px solid rgba(226,232,240,0.95)",
    minHeight: 0,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
    gap: 18,
    flexWrap: "wrap",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  badgeBlue: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    borderRadius: 999,
    background: "#eff6ff",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 10,
    width: "fit-content",
  },
  title: {
    margin: 0,
    fontSize: 27,
    color: "#0f172a",
    letterSpacing: "-0.7px",
    lineHeight: 1.12,
  },
  subtitle: {
    margin: "10px 0 0",
    fontSize: 13,
    color: "#64748b",
  },
  pillRow: {
    marginTop: 14,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  pill: {
    padding: "7px 12px",
    borderRadius: 999,
    background: "#eff6ff",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 800,
  },
  pillDark: {
    padding: "7px 12px",
    borderRadius: 999,
    background: "#0f172a",
    color: "#fff",
    fontSize: 12,
    fontWeight: 800,
  },
  headerActions: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  topButton: {
    height: 40,
    border: "1px solid #d8e0ea",
    borderRadius: 999,
    padding: "0 15px",
    background: "#fff",
    color: "#0f172a",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
  },
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
  sideTopSection: {
    marginBottom: 16,
  },
  sideTitle: {
    fontSize: 24,
    fontWeight: 900,
    color: "#0f172a",
    letterSpacing: "-0.5px",
  },
  sideSub: {
    marginTop: 8,
    color: "#64748b",
    fontSize: 13,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginBottom: 16,
    flexShrink: 0,
  },
  statCard: {
    border: "1px solid #e2e8f0",
    background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
    borderRadius: 22,
    padding: 16,
    minHeight: 96,
    boxShadow: "0 10px 22px rgba(15,23,42,0.04)",
  },
  statIcon: {
    fontSize: 20,
    marginBottom: 10,
  },
  statLabel: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 6,
    fontWeight: 700,
  },
  statValue: {
    fontSize: 15,
    fontWeight: 900,
    color: "#0f172a",
    wordBreak: "break-word",
  },
  sideBox: {
    borderRadius: 24,
    padding: 14,
    background: "linear-gradient(180deg, #fbfdff 0%, #f8fafc 100%)",
    border: "1px solid #e2e8f0",
    marginBottom: 14,
  },
  sideSectionTitle: {
    fontWeight: 900,
    color: "#0f172a",
    marginBottom: 10,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  smallPillButton: {
    height: 36,
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    padding: "0 14px",
    fontWeight: 800,
    cursor: "pointer",
    marginBottom: 10,
  },
  historyList: {
    maxHeight: 220,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  historyItem: {
    textAlign: "left",
    border: "1px solid #e2e8f0",
    color: "#0f172a",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    background: "#fff",
  },
  historyItemActive: {
    background: "#dbeafe",
    borderColor: "#93c5fd",
  },
  emptyHistory: {
    color: "#64748b",
    fontSize: 13,
  },
  traceText: {
    fontSize: 13,
    color: "#475569",
    lineHeight: 1.9,
  },

  authWrap: {
    minHeight: "100svh",
    background: "#f5f6f7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },

  authOuter: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },

  authCard: {
    width: 372,
    minHeight: 560,
    background: "#fff",
    borderRadius: 16,
    border: "1px solid #dbdbdb",
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
    padding: "58px 32px 44px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
  },

  authBrand: {
    textAlign: "center",
    fontSize: 30,
    fontWeight: 800,
    color: "#111827",
    letterSpacing: "-0.5px",
    marginBottom: 36,
  },

  authIntro: {
    textAlign: "center",
    marginBottom: 42,
  },

  authSubtitleSolo: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 1.7,
  },

  authTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: "#111827",
  },

  authSubtitle: {
    marginTop: 12,
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 1.6,
  },

  authForm: {
    display: "grid",
    gap: 16,
  },

  authInput: {
    height: 46,
    borderRadius: 8,
    border: "1px solid #dbdbdb",
    background: "#fafafa",
    padding: "0 14px",
    fontSize: 14,
    outline: "none",
    transition: "all 0.15s ease",
  },
  authError: {
    padding: "12px 14px",
    borderRadius: 12,
    background: "#fff1f2",
    color: "#be123c",
    border: "1px solid #fecdd3",
    fontSize: 13,
    lineHeight: 1.5,
  },
  authSubmit: {
    height: 42,
    borderRadius: 8,
    border: "none",
    background: "#4da3ff",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    marginTop: 12,
    transition: "all 0.18s ease",
  },
  authSubmitDisabled: {
    opacity: 0.72,
    cursor: "not-allowed",
  },
  authDivider: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    margin: "36px 0 28px",
  },
  authDividerLine: {
    flex: 1,
    height: 1,
    background: "#e5e7eb",
  },

  authDividerText: {
    fontSize: 12,
    fontWeight: 700,
    color: "#9ca3af",
  },

  authGhostButton: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#2563eb",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    marginTop: "auto",
    paddingTop: 12,
  },

  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(2,6,23,0.42)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 20,
  },
  modalCard: {
    width: 500,
    maxWidth: "calc(100vw - 40px)",
    borderRadius: 28,
    border: "1px solid #e2e8f0",
    boxShadow: "0 28px 70px rgba(15,23,42,0.28)",
    overflow: "hidden",
    background: "#fff",
  },
  modalCardDefault: {
    background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  },
  modalCardDanger: {
    background: "linear-gradient(180deg, #ffffff 0%, #fff8f9 100%)",
  },
  modalHeader: {
    padding: "18px 20px",
    borderBottom: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalHeaderDefault: {
    background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)",
  },
  modalHeaderDanger: {
    background: "linear-gradient(180deg, #fff5f6 0%, #ffffff 100%)",
  },
  modalTitleWrap: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  modalIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #e2e8f0",
    background: "#fff",
  },
  modalIconWrapDefault: {
    boxShadow: "0 10px 24px rgba(37,99,235,0.10)",
  },
  modalIconWrapDanger: {
    boxShadow: "0 10px 24px rgba(225,29,72,0.10)",
  },
  modalEyebrow: {
    fontSize: 11,
    fontWeight: 900,
    color: "#64748b",
    letterSpacing: "0.08em",
    marginBottom: 2,
  },
  modalTitle: {
    fontSize: 18,
    color: "#0f172a",
  },
  modalBody: {
    padding: 20,
    color: "#334155",
    lineHeight: 1.8,
    fontSize: 14,
  },
  modalFooter: {
    padding: "0 20px 20px",
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
  },
  modalPrimaryButton: {
    height: 38,
    borderRadius: 999,
    border: "none",
    background: "#0f172a",
    color: "#fff",
    padding: "0 14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  modalGhostButton: {
    height: 38,
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    padding: "0 14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  iconCloseButton: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    border: "1px solid #e2e8f0",
    background: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 6px 14px rgba(15,23,42,0.04)",
  },
};