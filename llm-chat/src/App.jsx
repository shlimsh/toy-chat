import React, { useEffect, useMemo, useRef, useState } from "react";
import { datadogRum } from "@datadog/browser-rum";
import { datadogLogs } from "@datadog/browser-logs";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import {
  LogOut,
  Sparkles,
  Activity,
  Database,
  AlertTriangle,
  X,
  MessageCircle,
  LayoutDashboard,
  BarChart3,
  Settings,
  Info,
  Mail,
  PlusCircle,
} from "lucide-react";

import ChatPage from "./pages/ChatPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import MonitoringPage from "./pages/MonitoringPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import AboutPage from "./pages/AboutPage.jsx";

const getWeatherIcon = (main = "") => {
  const value = String(main).toLowerCase();

  if (value.includes("clear")) return "☀️";
  if (value.includes("cloud")) return "☁️";
  if (value.includes("rain")) return "🌧️";
  if (value.includes("snow")) return "❄️";
  if (value.includes("thunder")) return "⛈️";
  if (value.includes("drizzle")) return "🌦️";
  if (value.includes("mist") || value.includes("fog") || value.includes("haze")) {
    return "🌫️";
  }

  return "🌡️";
};

const LAMBDA_API_URL =
  "https://zxezp1ixj5.execute-api.us-east-1.amazonaws.com/shlim/send";

const API_BASE_URL = "";

const TEST_MODES = {
  NORMAL: "normal",
  BACKEND: "backend",
  NETWORK: "network",
  FRONTEND: "frontend",
};

const UI_FONT =
  'Inter, Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Segoe UI", Arial, sans-serif';

const COLORS = {
  text: "#0f172a",
  muted: "#64748b",
  softMuted: "#475569",
  panel: "rgba(255,255,255,0.96)",
  card: "#ffffff",
  border: "#e2e8f0",
  borderSoft: "#e5e7eb",
  blueSoft: "#eff6ff",
  blue: "#2563eb",
};

const CARD_SHADOW = "0 8px 18px rgba(15,23,42,0.04)";
const ITEM_SHADOW = "0 4px 10px rgba(15,23,42,0.025)";


function GlobalStyle() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      html, body, #root { min-height: 100%; }
      body { margin: 0; font-family: ${UI_FONT}; color: #0f172a; }
      button, input, textarea, select { font-family: inherit; }
    `}</style>
  );
}

const toSafeDate = (value) => {
  if (!value) return new Date();

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
      return new Date(trimmed);
    }

if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
  return new Date(trimmed.replace(" ", "T") + "Z");
}

    return new Date(trimmed);
  }

  return new Date(value);
};

const formatSeoulDateTime = (value = new Date()) => {
  const date = toSafeDate(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(/\./g, ".")
    .replace(/\s/g, " ")
    .trim();
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
    id: "welcome-openai",
    role: "assistant",
    provider: "OpenAI",
    model: "gpt-5-mini",
    content:
      "안녕하세요. 로그인 기반 Datadog 데모 채팅입니다. 질문을 입력하면 채팅과 함께 trace 정보가 오른쪽 패널에 표시됩니다.",
    ...makeLocalTimestamp(),
  },
  {
    id: "welcome-azure",
    role: "assistant",
    provider: "Azure AI",
    model: "grok-4.3",
    content:
      "Azure AI도 함께 준비되어 있습니다. 질문을 보내면 OpenAI와 Azure AI 응답을 나란히 비교할 수 있습니다.",
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

function TracePanel({
  currentTrace,
  conversations,
  conversationId,
  onSelectConversation,
  nowDate,
  nowTime,
  weatherText,
  weatherLocation,
  weatherMain,
  forecastItems,
}) {
const providerTraces = Array.isArray(currentTrace?.models)
  ? currentTrace.models
  : [];

const runtimeItems =
  providerTraces.length > 0
    ? providerTraces.map((item) => ({
        provider: item.provider || "-",
        model: item.model || "-",
        latency:
          item.totalLatencyMs !== undefined ? `${item.totalLatencyMs} ms` : "-",
        tokens: item.totalTokens !== undefined ? `${item.totalTokens}` : "-",
        cost:
          item.costEstimate !== undefined ? `$${item.costEstimate}` : "$-",
        error: item.error || null,
        hasData: true,
      }))
    : [
        {
          provider: "OpenAI",
          model: "gpt-5-mini-2025-08-07",
          latency: "-",
          tokens: "-",
          cost: "$-",
          error: null,
          hasData: false,
        },
        {
          provider: "Azure AI",
          model: "grok-4.3",
          latency: "-",
          tokens: "-",
          cost: "$-",
          error: null,
          hasData: false,
        },
      ];

  const totalLatency =
    currentTrace?.totalLatencyMs !== undefined
      ? `${currentTrace.totalLatencyMs} ms`
      : "-";

  const totalTokens =
    currentTrace?.totalTokens !== undefined ? `${currentTrace.totalTokens}` : "-";

  const totalCost =
    currentTrace?.costEstimate !== undefined
      ? `$${currentTrace.costEstimate}`
      : "$-";

  return (
    <div style={styles.sidePanel}>
      <div style={styles.sideTopSection}>
        <a
          href="https://app.datadoghq.com/"
          target="_blank"
          rel="noreferrer"
          style={styles.bannerCard}
        >
          <div style={styles.bannerTitle}>🐶 Datadog 콘솔 바로가기</div>
        </a>

        <div style={styles.weatherSummaryCard}>
          <div style={styles.infoLineItem}>
            <span style={styles.infoLineIcon}>🕒</span>
            <span style={styles.infoLabel}>현재 시간</span>
            <span style={styles.infoLineValue}>
              {nowDate || "-"} · {nowTime || "-"}
            </span>
          </div>

          <div style={styles.infoLineItem}>
            <span style={styles.weatherEmoji}>{getWeatherIcon(weatherMain)}</span>
            <span style={styles.infoLabel}>{weatherLocation} 날씨</span>
            <span style={styles.infoLineValue}>{weatherText}</span>
          </div>

          <div style={styles.forecastListVertical}>
            {(forecastItems || []).map((item) => (
              <div key={item.date} style={styles.forecastRow}>
                <span style={styles.forecastDate}>
                  {item.date} {item.day ? `(${item.day})` : ""}
                </span>
                <span style={styles.forecastEmoji}>{item.icon}</span>
                <span style={styles.forecastTemp}>{item.temp}</span>
                <span style={styles.forecastDesc}>{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={styles.runtimeCard}>
        <div style={styles.runtimeHeader}>
          <div>
            <div style={styles.runtimeEyebrow}>LLM OBSERVABILITY</div>
            <div style={styles.runtimeTitle}>AI Runtime</div>
          </div>
          <div style={styles.runtimeBadge}>Dual Model</div>
        </div>

        <div style={styles.runtimeProviderList}>
          {runtimeItems.map((item) => (
            <div key={item.provider} style={styles.runtimeProviderCard}>
              <div style={styles.runtimeProviderHeader}>
                <div style={styles.runtimeProviderName}>
                  {item.provider === "Azure AI" ? "🧊" : "֎"} {item.provider}
                </div>
                <div 
style={{
  ...styles.runtimeStatus,
  ...(item.error ? styles.runtimeStatusError : {}),
  ...(!item.hasData && !item.error ? styles.runtimeStatusWaiting : {}),
}}
                >
                  {item.error ? "Failed" : item.hasData ? "OK" : "Waiting"}
                </div>
              </div>

              <div style={styles.runtimeModel}>{item.model}</div>

              <div style={styles.runtimeMiniGrid}>
                <div style={styles.runtimeMiniItem}>
                  <span>Latency</span>
                  <strong>{item.latency}</strong>
                </div>
                <div style={styles.runtimeMiniItem}>
                  <span>Tokens</span>
                  <strong>{item.tokens}</strong>
                </div>
                <div style={styles.runtimeMiniItemFull}>
                  <span>Cost</span>
                  <strong>{item.cost}</strong>
                </div>
              </div>

              {item.error ? (
                <div style={styles.runtimeErrorText}>{item.error}</div>
              ) : null}
            </div>
          ))}
        </div>

        <div style={styles.runtimeTotalBox}>
          <div style={styles.runtimeTotalRow}>
            <span>⚡ Total Latency</span>
            <strong>{totalLatency}</strong>
          </div>
          <div style={styles.runtimeTotalRow}>
            <span>🧮 Total Tokens</span>
            <strong>{totalTokens}</strong>
          </div>
          <div style={styles.runtimeTotalRow}>
            <span>💰 Estimated Cost</span>
            <strong>{totalCost}</strong>
          </div>
        </div>
      </div>

      <div style={styles.sideBox}>
        <div style={styles.sideSectionTitle}>
          <Database size={16} />
          대화 기록
        </div>

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
                  ...(conversationId === conv.id ? styles.historyItemActive : {}),
                }}
              >
                {conv.title}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PageButton({ to, label }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        ...styles.topButton,
        ...(isActive ? styles.topButtonActive : {}),
        textDecoration: "none",
      })}
    >
      {label}
    </NavLink>
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
              autoComplete={mode === "login" ? "current-password" : "new-password"}
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
            onClick={() => switchMode(mode === "login" ? "register" : "login")}
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

function RumViewTracker() {
  const location = useLocation();

  useEffect(() => {
    datadogRum.startView({
      name: location.pathname,
    });
  }, [location.pathname]);

  return null;
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
const skipNextConversationLoadRef = useRef(false);

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
    provider: msg.provider || msg.metadata?.provider || null,
    model: msg.model || msg.metadata?.model || null,
    trace: msg.trace || msg.metadata?.trace || null,
    rawCreatedAt: msg.created_at,
    timestamp: buildTimestampLabel(msg.created_at),
  }));

setMessages(restored.length > 0 ? restored : initialMessages);

const latestAssistantTraces = restored
  .filter((msg) => msg.role === "assistant" && msg.trace)
  .slice(-2)
  .map((msg) => msg.trace);

if (latestAssistantTraces.length > 0) {
  setCurrentTrace({
    model: latestAssistantTraces
      .map((item) => `${item.provider}: ${item.model}`)
      .join(" / "),
    models: latestAssistantTraces,
    totalLatencyMs: Math.max(
      ...latestAssistantTraces.map((item) => Number(item.totalLatencyMs || 0))
    ),
    totalTokens: latestAssistantTraces.reduce(
      (sum, item) => sum + Number(item.totalTokens || 0),
      0
    ),
    costEstimate: latestAssistantTraces
      .reduce((sum, item) => sum + Number(item.costEstimate || 0), 0)
      .toFixed(6),
  });
} else {
  setCurrentTrace(null);
}

requestAnimationFrame(scrollToBottom);
    } catch (error) {
      console.error(error);
    }
  };

useEffect(() => {
  if (!authChecking && token && user) {
    loadConversations();
  }
}, [authChecking, token, user]);

  useEffect(() => {
  if (conversationId) {
    localStorage.setItem("conversationId", conversationId);

    if (skipNextConversationLoadRef.current) {
      skipNextConversationLoadRef.current = false;
      return;
    }

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

  const [nowDate, setNowDate] = useState("");
  const [nowTime, setNowTime] = useState("");
  const [weatherText, setWeatherText] = useState("조회중...");
  const [weatherMain, setWeatherMain] = useState("clear");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();

      setNowDate(
        new Intl.DateTimeFormat("ko-KR", {
          timeZone: "Asia/Seoul",
          month: "2-digit",
          day: "2-digit",
          weekday: "short",
        }).format(now)
      );

      setNowTime(
        new Intl.DateTimeFormat("ko-KR", {
          timeZone: "Asia/Seoul",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(now)
      );
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);

    return () => clearInterval(timer);
  }, []);

const [weatherLocation, setWeatherLocation] = useState("서울");
const [forecastItems, setForecastItems] = useState([]);

useEffect(() => {
  const loadWeather = async () => {
    try {
      const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY;
      const lat = 37.5665;
      const lon = 126.9780;

      const currentResponse = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=kr`
      );

      const current = await currentResponse.json();

      setWeatherLocation("서울특별시");
      setWeatherMain(current.weather?.[0]?.main || "clear");


      setWeatherText(
        `${current.weather?.[0]?.description || "-"} · ${Math.round(
          current.main?.temp
        )}°C`
      );

      const forecastResponse = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=kr`
      );

      const forecast = await forecastResponse.json();


const seoulToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const weekDays = ["일", "월", "화", "수", "목", "금", "토"];

const daily = (forecast.list || [])
  .filter((item) => item.dt_txt?.includes("12:00:00"))
  .filter((item) => item.dt_txt.slice(0, 10) > seoulToday)
  .slice(0, 3)
  .map((item) => {
    const seoulDate = new Date(
      new Date(item.dt * 1000).toLocaleString("en-US", {
        timeZone: "Asia/Seoul",
      })
    );

    return {
      date: item.dt_txt.slice(5, 10).replace("-", "/"),
      day: weekDays[seoulDate.getDay()],
      temp: `${Math.round(item.main.temp)}°C`,
      desc: item.weather?.[0]?.description || "-",
      icon: getWeatherIcon(item.weather?.[0]?.main),
    };
  });

      setForecastItems(daily);
    } catch (err) {
      console.error(err);
      setWeatherText("조회 실패");
      setWeatherMain("clear");
      setForecastItems([]);
    }
  };


  
  loadWeather();
  const timer = setInterval(loadWeather, 10 * 60 * 1000);
  return () => clearInterval(timer);
}, []);

  const sendSmsToManager = async () => {
  console.log("SMS button clicked");

  try {
    datadogRum.addAction("send_sms_to_manager_click");

    const response = await fetch(LAMBDA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "담당자에게 문자 발송 요청",
      }),
    });

    console.log("SMS response status:", response.status);

    const data = await response.json();
    console.log("SMS response body:", data);

    if (!response.ok) {
      throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
    }

    openModal(
      "문자 발송 완료",
      "담당자에게 문자 발송 요청이 완료되었습니다.",
      null,
      "",
      "default"
    );
  } catch (error) {
    console.error("SMS failed:", error);
    setErrorState(error.message);
    datadogRum.addError(error);
  }
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
  if (!conversationId || data.conversationId !== conversationId) {
    skipNextConversationLoadRef.current = true;
  }

  setConversationId(data.conversationId);
}

const assistantMessages = Array.isArray(data?.responses)
  ? data.responses.map((item, index) => {
      const createdAt = item.created_at || new Date().toISOString();

      return {
        id: item.id || `assistant-${Date.now()}-${index}`,
        role: "assistant",
        provider: item.provider,
        model: item.model,
        content: item.content || "응답이 비어 있습니다.",
        rawCreatedAt: createdAt,
        timestamp: buildTimestampLabel(createdAt),
      };
    })
  : [
      {
        id: data?.message?.id ?? `assistant-${Date.now()}`,
        role: "assistant",
        provider: data?.message?.provider || "OpenAI",
        model: data?.message?.model || data?.trace?.model,
        content: data?.message?.content ?? "응답이 비어 있습니다.",
        rawCreatedAt: data?.message?.created_at || new Date().toISOString(),
        timestamp: buildTimestampLabel(
          data?.message?.created_at || new Date().toISOString()
        ),
      },
    ];

setMessages((prev) => [...prev, ...assistantMessages]);

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
      <>
        <GlobalStyle />
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
      </>
    );
  }

  if (!token || !user) {
    return (
      <>
        <GlobalStyle />
        <AuthScreen
        onLoginSuccess={(nextUser, nextToken) => {
          setUser(nextUser);
          setToken(nextToken);
          setAuthChecking(false);
        }}
      />
      </>
    );
  }

  return (
    <>
      <GlobalStyle />
      <RumViewTracker />

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
  <div style={styles.headerTop}>
    <div style={styles.topNavRow}>
      <div style={styles.badgeBlue}>
        <Sparkles size={13} />
        놀이터
      </div>

      <p style={styles.subtitleInline}>
        타이틀을 뭐로 할까 고민중인 shlim
      </p>
    </div>

<div style={styles.userInfo}>
  <div>
    <strong>사용자명: </strong>
    <span data-dd-privacy="mask">{user.name}</span>
  </div>

  <div>
    <strong>사용자 이메일: </strong>
    <span data-dd-privacy="mask">{user.email}</span>
  </div>
</div>
</div>
  <div style={styles.headerActions}>
<PageButton
  label={
    <>
      <MessageCircle size={14} />
      Chat
    </>
  }
  to="/"
/>
<PageButton
  label={
    <>
      <LayoutDashboard size={14} />
      Dashboard
    </>
  }
  to="/dashboard"
/>
<PageButton
  label={
    <>
      <Activity size={14} />
      Monitoring
    </>
  }
  to="/monitoring"
/>
<PageButton
  label={
    <>
      <BarChart3 size={14} />
      Analytics
    </>
  }
  to="/analytics"
/>
<PageButton
  label={
    <>
      <Settings size={14} />
      Settings
    </>
  }
  to="/settings"
/>
<PageButton
  label={
    <>
      <Info size={14} />
      About
    </>
  }
  to="/about"
/>

<button onClick={sendSmsToManager} style={styles.topButton}>
  <Mail size={14} />
  SMS 보내기
</button>

<button onClick={startNewChat} style={styles.topButton}>
  <PlusCircle size={14} />
  새 대화
</button>

                <button onClick={logout} style={styles.topButton}>
                  <LogOut size={14} />
                  로그아웃
                </button>
              </div>
            </div>

            <Routes>
              <Route
                path="/"
                element={
                  <ChatPage
                    TEST_MODES={TEST_MODES}
                    selectedMode={selectedMode}
                    setMode={setMode}
                    messages={messages}
                    loading={loading}
                    errorState={errorState}
                    retryLastMessage={retryLastMessage}
                    setErrorState={setErrorState}
                    input={input}
                    setInput={setInput}
                    sendMessage={sendMessage}
                    chatScrollRef={chatScrollRef}
                    inputRef={inputRef}
                  />
                }
              />

              <Route
                path="/dashboard"
                element={
                  <DashboardPage
                    conversations={conversations}
                    currentTrace={currentTrace}
                  />
                }
              />

              <Route path="/monitoring" element={<MonitoringPage />} />

              <Route
                path="/analytics"
                element={<AnalyticsPage conversations={conversations} />}
              />

              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/about" element={<AboutPage />} />
            </Routes>
          </div>

<TracePanel
  currentTrace={currentTrace}
  conversations={conversations}
  conversationId={conversationId}
  onSelectConversation={setConversationId}
  nowDate={nowDate}
  nowTime={nowTime}
  weatherText={weatherText}
  weatherLocation={weatherLocation}
  weatherMain={weatherMain}
  forecastItems={forecastItems}
/>
        </div>
      </div>
    </>
  );
}

const styles = {
  page: {
    minHeight: "100svh",
    background:
      "radial-gradient(circle at top, rgba(59,130,246,0.08), transparent 24%), linear-gradient(180deg, #f8fbff 0%, #f8fafc 100%)",
    padding: 18,
    fontFamily: UI_FONT,
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
    background: COLORS.panel,
    backdropFilter: "blur(16px)",
    borderRadius: 32,
    boxShadow: "0 20px 54px rgba(15,23,42,0.08)",
    padding: 22,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    border: `1px solid ${COLORS.border}`,
    minHeight: 0,
    overflow: "hidden",
  },
  sidePanel: {
    background: COLORS.panel,
    backdropFilter: "blur(16px)",
    borderRadius: 32,
    boxShadow: "0 20px 54px rgba(15,23,42,0.08)",
    padding: 22,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    border: `1px solid ${COLORS.border}`,
    minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    marginBottom: 18,
    gap: 12,
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  badgeBlue: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    borderRadius: 999,
    background: COLORS.blueSoft,
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 0,
    width: "fit-content",
  },
  title: {
    margin: 0,
    fontSize: 27,
    color: COLORS.text,
    letterSpacing: "-0.7px",
    lineHeight: 1.12,
  },
  subtitle: {
    margin: "10px 0 0",
    fontSize: 13,
    color: COLORS.muted,
  },
  subtitleInline: {
    margin: 0,
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: 700,
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
    background: COLORS.blueSoft,
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
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
topButton: {
  height: 38,
  border: "1px solid #d8e0ea",
  borderRadius: 999,
  padding: "0 14px",
  background: COLORS.card,
  color: COLORS.text,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  fontFamily: UI_FONT,

  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,

  boxShadow: CARD_SHADOW,
},
  topButtonActive: {
    background: "#0f172a",
    color: "#fff",
    borderColor: "#0f172a",
  },
  aiInsightCard: {
    width: "100%",
    border: `1px solid ${COLORS.border}`,
    background: COLORS.card,
    borderRadius: 18,
    padding: 14,
    marginBottom: 0,
    boxShadow: CARD_SHADOW,
    flexShrink: 0,
  },
  metricListVertical: {
    display: "grid",
    gap: 8,
  },
  metricRow: {
    minHeight: 38,
    borderRadius: 12,
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    boxShadow: ITEM_SHADOW,
    padding: "8px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 12,
    color: COLORS.text,
  },
metricRowLabel: {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "#475569",
  fontWeight: 600,
},
  metricIcon: {
    fontSize: 15,
    lineHeight: 1,
  },
  metricRowValue: {
    fontWeight: 900,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textAlign: "right",
  },
  sideTopSection: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    marginBottom: 0,
    flexShrink: 0,
  },
  sideTitle: {
    fontSize: 24,
    fontWeight: 900,
    color: COLORS.text,
    letterSpacing: "-0.5px",
  },
  sideSub: {
    marginTop: 8,
    color: COLORS.muted,
    fontSize: 13,
  },
  sideBox: {
    borderRadius: 18,
    padding: 14,
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    marginBottom: 0,
    boxShadow: CARD_SHADOW,
  },
  sideSectionTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: COLORS.text,
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  smallPillButton: {
    height: 36,
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    background: COLORS.card,
    color: COLORS.text,
    padding: "0 14px",
    fontWeight: 800,
    marginBottom: 10,
  },
historyList: {
  height: "min(430px, calc(100vh - 500px))",
  minHeight: 260,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 8,
},
historyItem: {
  textAlign: "left",
  border: "1px solid #e2e8f0",
  color: "#334155",
  borderRadius: 14,
  padding: "10px 12px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  background: "#fff",
},
  historyItemActive: {
    background: "#dbeafe",
    borderColor: "#93c5fd",
  },
  emptyHistory: {
    color: COLORS.muted,
    fontSize: 13,
  },
  traceText: {
    fontSize: 13,
    color: COLORS.softMuted,
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
    background: COLORS.card,
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
    color: COLORS.blue,
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
    border: `1px solid ${COLORS.border}`,
    boxShadow: "0 28px 70px rgba(15,23,42,0.28)",
    overflow: "hidden",
    background: COLORS.card,
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
    border: `1px solid ${COLORS.border}`,
    background: COLORS.card,
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
    color: COLORS.muted,
    letterSpacing: "0.08em",
    marginBottom: 2,
  },
modalTitle: {
  fontSize: 28,
  fontWeight: 700,
  color: COLORS.text,
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
    background: COLORS.card,
    color: COLORS.text,
    padding: "0 14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  iconCloseButton: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    border: `1px solid ${COLORS.border}`,
    background: COLORS.card,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 6px 14px rgba(15,23,42,0.04)",
  },
  topNavRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    marginBottom: 0,
  },
  pageNav: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  miniWidgetGrid: {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginTop: 16,
  marginBottom: 14,
},

miniWidgetCard: {
  border: `1px solid ${COLORS.border}`,
  background: COLORS.card,
  borderRadius: 18,
  padding: 14,
  boxShadow: CARD_SHADOW,
},

miniWidgetIcon: {
  fontSize: 20,
  marginBottom: 8,
},

miniWidgetLabel: {
  fontSize: 12,
  color: COLORS.muted,
  fontWeight: 800,
  marginBottom: 5,
},
miniWidgetValue: {
  fontSize: 12,
  color: COLORS.text,
  fontWeight: 800,
  lineHeight: 1.45,
},


timeDate: {
  fontSize: 13,
  fontWeight: 700,
  color: COLORS.softMuted,
  marginTop: 4,
},

timeClock: {
  fontSize: 14,
  fontWeight: 800,
  color: COLORS.text,
  marginTop: 4,
},
weatherIconImg: {
  width: 32,
  height: 32,
  objectFit: "contain",
  marginBottom: 4,
},
bannerCard: {
  minHeight: 52,
  borderRadius: 20,
  padding: "0 20px",
  marginBottom: 0,
  background:
    "linear-gradient(135deg, #632ca6 0%, #774aa9 40%, #7c5cff 100%)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 800,
  boxShadow: "0 12px 28px rgba(99,44,166,0.35)",
  transition: "all .2s ease",
},

bannerEyebrow: {
  fontSize: 11,
  opacity: 0.78,
  fontWeight: 900,
  letterSpacing: "0.08em",
  marginBottom: 4,
},

bannerTitle: {
  fontSize: 14,
  fontWeight: 800,
},

bannerArrow: {
  fontSize: 22,
  fontWeight: 900,
},
forecastCard: {
  width: "100%",
  border: `1px solid ${COLORS.border}`,
  background: COLORS.card,
  borderRadius: 18,
  padding: 14,
  marginBottom: 14,
  boxShadow: CARD_SHADOW,
},
forecastTitle: {
  fontSize: 12,
  color: COLORS.muted,
  fontWeight: 900,
  marginBottom: 10,
},

forecastList: {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
},

forecastItem: {
  borderRadius: 14,
  background: COLORS.card,
  border: `1px solid ${COLORS.border}`,
  padding: 10,
  display: "grid",
  gap: 5,
  textAlign: "center",
  fontSize: 12,
  color: "#334155",
},
forecastIconImg: {
  width: 32,
  height: 32,
  objectFit: "contain",
  margin: "0 auto",
},
weatherSummaryCard: {
  border: `1px solid ${COLORS.border}`,
  background: COLORS.card,
  borderRadius: 18,
  padding: 14,
  marginBottom: 0,
  display: "grid",
  gap: 9,
  boxShadow: CARD_SHADOW,
},
infoLineItem: {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 12,
  color: COLORS.text,
  fontWeight: 700,
  whiteSpace: "nowrap",
  overflow: "hidden",
},
infoLineIcon: {
  fontSize: 18,
  width: 28,
  textAlign: "center",
  flexShrink: 0,
},
weatherEmoji: {
  fontSize: 21,
  width: 28,
  textAlign: "center",
  lineHeight: 1,
  flexShrink: 0,
},
infoLabel: {
  width: 105,
  fontWeight: 800,
  color: COLORS.softMuted,
  flexShrink: 0,
},
infoLineValue: {
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  color: COLORS.text,
  fontWeight: 800,
},
cardSectionTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: COLORS.text,
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    gap: 8,
},
cardSectionTitleSmall: {
  fontSize: 13,
  fontWeight: 800,
  color: COLORS.softMuted,
  margin: "12px 0 8px",
  display: "flex",
  alignItems: "center",
  gap: 8,
},
aiSummaryHeader: {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12,
},

aiSummaryEyebrow: {
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: "0.08em",
  color: "#7c3aed",
  marginBottom: 3,
},

aiSummaryTitle: {
  fontSize: 15,
  fontWeight: 900,
  color: COLORS.text,
},

aiSummaryBadge: {
  borderRadius: 999,
  padding: "5px 9px",
  background: "#eef2ff",
  color: "#4f46e5",
  fontSize: 10,
  fontWeight: 900,
  border: "1px solid #c7d2fe",
},

aiSummaryBox: {
  borderRadius: 16,
  background:
    "linear-gradient(180deg, #f8faff 0%, #ffffff 100%)",
  border: "1px solid #dbeafe",
  boxShadow: "0 10px 22px rgba(37,99,235,0.08)",
  padding: 12,
  color: "#334155",
},

aiSummaryMainText: {
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.65,
  color: "#1e293b",
  marginBottom: 12,
},

aiSummaryGrid: {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
},

aiSummaryMiniCard: {
  minHeight: 62,
  borderRadius: 14,
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  boxShadow: ITEM_SHADOW,
  padding: "9px 10px",
  display: "grid",
  gap: 3,
},

aiSummaryMiniIcon: {
  fontSize: 15,
  lineHeight: 1,
},

aiSummaryMiniLabel: {
  fontSize: 10,
  color: COLORS.muted,
  fontWeight: 900,
},

aiSummaryMiniValue: {
  fontSize: 11,
  color: COLORS.text,
  fontWeight: 900,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
},
forecastListVertical: {
  display: "grid",
  gap: 8,
},
forecastRow: {
  minHeight: 40,
  borderRadius: 12,
  background: COLORS.card,
  border: `1px solid ${COLORS.border}`,
    boxShadow: ITEM_SHADOW,
  padding: "8px 12px",
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 12,
  color: "#334155",
  overflow: "hidden",
},
forecastDate: {
  width: 78,
  fontWeight: 800,
  color: COLORS.softMuted,
  flexShrink: 0,
},
forecastEmoji: {
  fontSize: 19,
  width: 26,
  textAlign: "center",
  lineHeight: 1,
  flexShrink: 0,
},
forecastTemp: {
  width: 48,
  fontWeight: 900,
  color: COLORS.text,
  flexShrink: 0,
},
forecastDesc: {
  flex: 1,
  color: COLORS.muted,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
},
forecastDescInline: {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
},
runtimeCard: {
  width: "100%",
  border: "1px solid #dbeafe",
  background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)",
  borderRadius: 18,
  padding: 14,
  boxShadow: "0 12px 26px rgba(37,99,235,0.08)",
  flexShrink: 0,
},
runtimeStatusWaiting: {
  color: "#64748b",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
},
runtimeHeader: {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12,
},

runtimeEyebrow: {
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: "0.1em",
  color: "#2563eb",
  marginBottom: 4,
},

runtimeTitle: {
  fontSize: 16,
  fontWeight: 900,
  color: COLORS.text,
},

runtimeBadge: {
  borderRadius: 999,
  padding: "5px 9px",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 10,
  fontWeight: 900,
  border: "1px solid #bfdbfe",
},

runtimeProviderList: {
  display: "grid",
  gap: 10,
},

runtimeProviderCard: {
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  padding: 12,
  boxShadow: ITEM_SHADOW,
},

runtimeProviderHeader: {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 7,
},

runtimeProviderName: {
  fontSize: 13,
  fontWeight: 900,
  color: COLORS.text,
},

runtimeStatus: {
  fontSize: 10,
  fontWeight: 900,
  color: "#15803d",
  background: "#dcfce7",
  border: "1px solid #bbf7d0",
  borderRadius: 999,
  padding: "4px 7px",
},

runtimeStatusError: {
  color: "#be123c",
  background: "#fff1f2",
  border: "1px solid #fecdd3",
},

runtimeModel: {
  fontSize: 12,
  fontWeight: 800,
  color: COLORS.muted,
  marginBottom: 10,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
},

runtimeMiniGrid: {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 7,
},

runtimeMiniItem: {
  borderRadius: 12,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  padding: "8px 9px",
  display: "grid",
  gap: 4,
  fontSize: 11,
  color: COLORS.muted,
  fontWeight: 800,
},

runtimeMiniItemFull: {
  gridColumn: "1 / -1",
  borderRadius: 12,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  padding: "8px 9px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontSize: 11,
  color: COLORS.muted,
  fontWeight: 800,
},

runtimeErrorText: {
  marginTop: 8,
  fontSize: 11,
  color: "#be123c",
  fontWeight: 700,
  lineHeight: 1.5,
},

runtimeTotalBox: {
  marginTop: 12,
  borderTop: "1px dashed #cbd5e1",
  paddingTop: 10,
  display: "grid",
  gap: 7,
},

runtimeTotalRow: {
  minHeight: 34,
  borderRadius: 12,
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  padding: "7px 10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 12,
  color: COLORS.softMuted,
  fontWeight: 800,
},
headerTop: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
},

userInfo: {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 2,
  fontSize: 12,
  color: COLORS.muted,
},
};
