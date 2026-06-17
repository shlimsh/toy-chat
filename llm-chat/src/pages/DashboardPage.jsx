import React, { useMemo } from "react";
import {
  Activity,
  Bot,
  Clock3,
  Database,
  MessageCircle,
  MessageSquareText,
  TestTube2,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

const UI_FONT =
  'Inter, Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Segoe UI", Arial, sans-serif';

const KPI_THEME = {
  conversations: {
    iconBg: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    cardBg: "linear-gradient(135deg, rgba(99,102,241,0.16), rgba(139,92,246,0.06))",
    border: "rgba(99,102,241,0.28)",
    color: "#4f46e5",
    glow: "rgba(99,102,241,0.16)",
  },
  messages: {
    iconBg: "linear-gradient(135deg, #06b6d4, #2563eb)",
    cardBg: "linear-gradient(135deg, rgba(6,182,212,0.16), rgba(37,99,235,0.06))",
    border: "rgba(6,182,212,0.28)",
    color: "#0891b2",
    glow: "rgba(6,182,212,0.16)",
  },
  users: {
    iconBg: "linear-gradient(135deg, #22c55e, #14b8a6)",
    cardBg: "linear-gradient(135deg, rgba(34,197,94,0.16), rgba(20,184,166,0.06))",
    border: "rgba(34,197,94,0.28)",
    color: "#16a34a",
    glow: "rgba(34,197,94,0.16)",
  },
  latency: {
    iconBg: "linear-gradient(135deg, #f97316, #ec4899)",
    cardBg: "linear-gradient(135deg, rgba(249,115,22,0.18), rgba(236,72,153,0.06))",
    border: "rgba(249,115,22,0.3)",
    color: "#ea580c",
    glow: "rgba(249,115,22,0.16)",
  },
};

export default function DashboardPage({ conversations = [], currentTrace = null }) {
  const dashboard = useMemo(() => {
    const totalConversations = conversations.length;

    const recentConversations = [...conversations]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 6);

    return {
      totalConversations,
      todayMessages: totalConversations * 2 + 7,
      activeUsers: 3,
      avgResponse: "1.2s",
      model: "gpt-5-mini",
      testStatus: "Passed",
      branch: "haha",
      service: "shlim-toy-chat-api",
      recentConversations,
    };
  }, [conversations]);

  return (
    <div style={styles.pageWrap}>
      <div style={styles.kpiGrid}>
        <KpiCard
          theme={KPI_THEME.conversations}
          icon={<MessageSquareText size={16} />}
          label="Total Conversations"
          value={dashboard.totalConversations}
          sub="누적 대화 수"
        />
        <KpiCard
          theme={KPI_THEME.messages}
          icon={<Zap size={16} />}
          label="Today Messages"
          value={dashboard.todayMessages}
          sub="오늘 메시지 추정"
        />
        <KpiCard
          theme={KPI_THEME.users}
          icon={<Users size={16} />}
          label="Active Users"
          value={dashboard.activeUsers}
          sub="최근 사용자"
        />
        <KpiCard
          theme={KPI_THEME.latency}
          icon={<Clock3 size={16} />}
          label="Avg Response"
          value={dashboard.avgResponse}
          sub="평균 응답 시간"
        />
      </div>

      <div style={styles.contentGrid}>
        <section style={styles.panelLarge}>
          <div style={styles.panelHeader}>
            <div>
              <div style={styles.sectionEyebrow}>
                <TrendingUp size={13} />
                Conversation Flow
              </div>
              <h3 style={styles.panelTitle}>최근 대화 흐름</h3>
              <p style={styles.panelDesc}>최근 생성된 대화 세션 기준</p>
            </div>

            <div style={styles.panelAction}>
              <Activity size={14} />
            </div>
          </div>

          <div style={styles.timeline}>
            {dashboard.recentConversations.length === 0 ? (
              <div style={styles.emptyBox}>아직 표시할 대화 기록이 없습니다.</div>
            ) : (
              dashboard.recentConversations.map((item, index) => (
                <div key={item.id || index} style={styles.timelineItem}>
                  <div
                    style={{
                      ...styles.timelineIcon,
                      background: getTimelineGradient(index),
                    }}
                  >
                    <MessageCircle size={14} />
                  </div>

                  <div style={styles.timelineBody}>
                    <strong style={styles.timelineTitle}>
                      {item.title || item.last_message || "Untitled conversation"}
                    </strong>
                    <span style={styles.timelineDate}>{formatDate(item.created_at)}</span>
                  </div>

                  <div style={styles.timelineNumber}>{index + 1}</div>
                </div>
              ))
            )}
          </div>
        </section>

        <section style={styles.sideStack}>
          <MiniPanel
            accent="linear-gradient(135deg, #6366f1, #8b5cf6)"
            icon={<Bot size={15} />}
            title="AI Runtime"
            rows={[
              ["Model", dashboard.model, "blue"],
              ["Mode", "Normal", "green"],
              ["Prompt Flow", "Enabled", "purple"],
            ]}
          />

          <MiniPanel
            accent="linear-gradient(135deg, #22c55e, #14b8a6)"
            icon={<TestTube2 size={15} />}
            title="Test Visibility"
            rows={[
              ["Status", dashboard.testStatus, "green"],
              ["Runner", "mocha", "blue"],
              ["Branch", dashboard.branch, "orange"],
            ]}
          />

          <MiniPanel
            accent="linear-gradient(135deg, #f97316, #ec4899)"
            icon={<Database size={15} />}
            title="Trace Context"
            rows={[
              ["Service", dashboard.service, "purple"],
              ["Env", "dev", "orange"],
              ["Trace", currentTrace ? "Detected" : "Waiting", currentTrace ? "green" : "gray"],
            ]}
          />
        </section>
      </div>
    </div>
  );
}

function KpiCard({ theme, icon, label, value, sub }) {
  return (
    <div
      style={{
        ...styles.kpiCard,
        background: theme.cardBg,
        borderColor: theme.border,
        boxShadow: `0 8px 18px ${theme.glow}`,
      }}
    >
      <div style={{ ...styles.kpiTopBar, background: theme.iconBg }} />
      <div style={{ ...styles.kpiIcon, background: theme.iconBg }}>{icon}</div>

      <div style={styles.kpiText}>
        <div style={styles.kpiLabel}>{label}</div>
        <div style={{ ...styles.kpiValue, color: theme.color }}>{value}</div>
        <div style={styles.kpiSub}>{sub}</div>
      </div>
    </div>
  );
}

function MiniPanel({ accent, icon, title, rows }) {
  return (
    <div style={styles.miniPanel}>
      <div style={{ ...styles.miniTopBar, background: accent }} />

      <div style={styles.miniHeader}>
        <div style={{ ...styles.miniIcon, background: accent }}>{icon}</div>
        <strong style={styles.miniTitle}>{title}</strong>
      </div>

      <div style={styles.rowList}>
        {rows.map(([label, value, tone]) => (
          <div key={label} style={styles.infoRow}>
            <span style={styles.infoLabel}>{label}</span>
            <span style={{ ...styles.infoBadge, ...getBadgeStyle(tone) }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "No timestamp";

  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Invalid date";
  }
}

function getTimelineGradient(index) {
  const gradients = [
    "linear-gradient(135deg, #6366f1, #8b5cf6)",
    "linear-gradient(135deg, #06b6d4, #2563eb)",
    "linear-gradient(135deg, #22c55e, #14b8a6)",
    "linear-gradient(135deg, #f97316, #ec4899)",
    "linear-gradient(135deg, #facc15, #f97316)",
    "linear-gradient(135deg, #0ea5e9, #6366f1)",
  ];

  return gradients[index % gradients.length];
}

function getBadgeStyle(tone) {
  const map = {
    green: {
      color: "#047857",
      background: "rgba(16,185,129,0.14)",
      borderColor: "rgba(16,185,129,0.3)",
    },
    blue: {
      color: "#1d4ed8",
      background: "rgba(59,130,246,0.14)",
      borderColor: "rgba(59,130,246,0.3)",
    },
    purple: {
      color: "#6d28d9",
      background: "rgba(139,92,246,0.14)",
      borderColor: "rgba(139,92,246,0.3)",
    },
    orange: {
      color: "#c2410c",
      background: "rgba(249,115,22,0.15)",
      borderColor: "rgba(249,115,22,0.32)",
    },
    gray: {
      color: "#475569",
      background: "rgba(100,116,139,0.12)",
      borderColor: "rgba(100,116,139,0.24)",
    },
  };

  return map[tone] || map.gray;
}

const styles = {
  pageWrap: {
    flex: 1,
    minHeight: 0,
    padding: "0 4px",
    fontFamily: UI_FONT,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    overflow: "hidden",
    background:
      "linear-gradient(180deg, rgba(248,250,252,0.6), rgba(238,244,255,0.35))",
  },

  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
    flexShrink: 0,
  },
  kpiCard: {
    position: "relative",
    minHeight: 66,
    borderRadius: 18,
    border: "1px solid",
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    overflow: "hidden",
  },
  kpiTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  kpiIcon: {
    width: 33,
    height: 33,
    borderRadius: 13,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 7px 14px rgba(15,23,42,0.14)",
    flexShrink: 0,
  },
  kpiText: {
    minWidth: 0,
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: 900,
    color: "#64748b",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  kpiValue: {
    marginTop: 3,
    fontSize: 20,
    lineHeight: 1,
    fontWeight: 950,
    letterSpacing: "-0.7px",
  },
  kpiSub: {
    marginTop: 3,
    fontSize: 9,
    fontWeight: 800,
    color: "#94a3b8",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  contentGrid: {
    display: "grid",
    gridTemplateColumns: "1.5fr 1fr",
    gap: 8,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  panelLarge: {
    borderRadius: 22,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(226,232,240,0.95)",
    padding: 14,
    boxShadow: "0 8px 18px rgba(15,23,42,0.06)",
    minHeight: 0,
    overflow: "hidden",
    backdropFilter: "blur(14px)",
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    color: "#0f172a",
    marginBottom: 9,
  },
  sectionEyebrow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: "#4f46e5",
    fontSize: 9,
    fontWeight: 950,
    marginBottom: 4,
  },
  panelTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 950,
    letterSpacing: "-0.4px",
  },
  panelDesc: {
    margin: "4px 0 0",
    color: "#64748b",
    fontSize: 9,
    fontWeight: 750,
  },
  panelAction: {
    width: 30,
    height: 30,
    borderRadius: 12,
    background:
      "linear-gradient(135deg, rgba(99,102,241,0.14), rgba(6,182,212,0.12))",
    border: "1px solid rgba(99,102,241,0.22)",
    color: "#4f46e5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  timeline: {
    display: "grid",
    gap: 6,
  },
  timelineItem: {
    minHeight: 35,
    borderRadius: 14,
    background:
      "linear-gradient(135deg, rgba(248,250,252,0.96), rgba(241,245,249,0.74))",
    border: "1px solid #e2e8f0",
    padding: "6px 9px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 5px 12px rgba(15,23,42,0.04)",
  },
  timelineIcon: {
    width: 28,
    height: 28,
    borderRadius: 11,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 7px 14px rgba(15,23,42,0.12)",
    flexShrink: 0,
  },
  timelineBody: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 1,
    flex: 1,
  },
  timelineTitle: {
    fontSize: 12,
    lineHeight: 1.2,
    color: "#0f172a",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  timelineDate: {
    fontSize: 9,
    lineHeight: 1.15,
    color: "#64748b",
    fontWeight: 750,
  },
  timelineNumber: {
    minWidth: 22,
    height: 22,
    padding: "0 6px",
    borderRadius: 999,
    background: "#0f172a",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 9,
    fontWeight: 950,
    flexShrink: 0,
  },
  emptyBox: {
    borderRadius: 15,
    background: "#f8fafc",
    border: "1px dashed #cbd5e1",
    padding: 14,
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: 800,
    textAlign: "center",
  },

  sideStack: {
    display: "grid",
    gridTemplateRows: "repeat(3, minmax(0, 1fr))",
    gap: 7,
    minHeight: 0,
    overflow: "hidden",
  },
  miniPanel: {
    position: "relative",
    minHeight: 0,
    borderRadius: 19,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(226,232,240,0.95)",
    padding: "8px 10px",
    boxShadow: "0 7px 16px rgba(15,23,42,0.055)",
    overflow: "hidden",
    backdropFilter: "blur(14px)",
  },
  miniTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  miniHeader: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    color: "#0f172a",
    marginBottom: 6,
    paddingTop: 2,
  },
  miniTitle: {
    fontSize: 12,
    fontWeight: 950,
    lineHeight: 1,
  },
  miniIcon: {
    width: 27,
    height: 27,
    borderRadius: 11,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 7px 14px rgba(15,23,42,0.12)",
    flexShrink: 0,
  },
  rowList: {
    display: "grid",
    gap: 4,
  },
  infoRow: {
    minHeight: 22,
    borderRadius: 10,
    background:
      "linear-gradient(135deg, rgba(248,250,252,0.96), rgba(241,245,249,0.74))",
    border: "1px solid #e2e8f0",
    padding: "4px 7px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    fontSize: 9,
    color: "#64748b",
    fontWeight: 800,
  },
  infoLabel: {
    whiteSpace: "nowrap",
  },
  infoBadge: {
    minWidth: 0,
    maxWidth: "68%",
    height: 17,
    padding: "0 6px",
    borderRadius: 999,
    border: "1px solid",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 9,
    fontWeight: 950,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
};