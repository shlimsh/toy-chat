import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Activity,
  Cpu,
  Database,
  MousePointerClick,
  RefreshCw,
  Users,
} from "lucide-react";
import { runtimeConfig } from "../config/runtime-config.js";
import { requestJson, toUserError } from "../lib/api-client.js";

const UI_FONT =
  'Inter, Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Segoe UI", Arial, sans-serif';

export default function MonitoringPage({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await requestJson(
        `${runtimeConfig.apiBaseUrl}/api/monitoring/summary`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeoutMs: 15000,
        }
      );

      setData(result);
    } catch (err) {
      setError(toUserError(err, "monitoring"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const cards = useMemo(() => {
    const metrics = data?.metrics || {};
    const details = data?.details || {};

    return [
      {
        label: "CPU Usage",
        value: metrics.cpu || "-",
        desc: "Top 3 hosts · Today avg",
        icon: <Cpu size={18} />,
        rows: details.cpuHosts || [],
        type: "hosts",
      },
      {
        label: "Memory Usage",
        value: metrics.memory || "-",
        desc: "Top 3 hosts · Today avg",
        icon: <Database size={18} />,
        rows: details.memoryHosts || [],
        type: "hosts",
      },
      {
        label: "Latency",
        value: metrics.latency || "-",
        desc: "Top 3 resources · Today avg",
        icon: <Activity size={18} />,
        rows: details.latencyResources || [],
        type: "resources",
      },
      {
        label: "Visitors",
        value: metrics.visitors || "-",
        desc: "Top 3 users · Today total",
        icon: <Users size={18} />,
        rows: details.visitorsUsers || [],
        type: "users",
      },
    ];
  }, [data]);

  return (
    <div style={styles.pageWrap}>
      <div style={styles.header}>
        <div style={styles.eyebrow}>
          <MousePointerClick size={13} />
          Organization : !DPN | MetanetX
        </div>

        <button
          onClick={loadSummary}
          disabled={loading}
          aria-label="모니터링 데이터 새로고침"
          style={{
            ...styles.refreshButton,
            ...(loading ? styles.refreshButtonDisabled : {}),
          }}
        >
          <RefreshCw size={14} />
          {loading ? "조회 중..." : "새로고침"}
        </button>
      </div>

      {error ? (
        <div role="alert" aria-live="assertive" style={styles.errorBox}>
          <strong>{error.title}</strong>
          <span style={styles.errorMessage}>{error.message}</span>
          {error.requestId ? (
            <small style={styles.errorRequestId}>
              요청 ID: {error.requestId}
            </small>
          ) : null}
        </div>
      ) : null}

      {!loading && data?.status === "partial" ? (
        <div role="status" aria-live="polite" style={styles.warningBox}>
          일부 지표를 불러오지 못했습니다. 조회 가능한 데이터만
          표시합니다.
        </div>
      ) : null}

      <div style={styles.cardGrid}>
        {cards.map((item) => (
          <MetricCard
            key={item.label}
            item={item}
            value={loading ? "Loading..." : item.value}
          />
        ))}
      </div>
    </div>
  );
}

function MetricCard({ item, value }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricHeader}>
        <div style={styles.metricTop}>
          <div style={styles.iconBox}>{item.icon}</div>

          <div>
            <div style={styles.metricLabel}>{item.label}</div>
            <div style={styles.metricDesc}>{item.desc}</div>
          </div>
        </div>

        <div style={styles.metricHeaderValue}>{value}</div>
      </div>

      <div style={styles.detailList}>
        {(item.rows || []).length === 0 ? (
          <div style={styles.emptyDetail}>
            No {getEmptyLabel(item.type)} data
          </div>
        ) : (
          item.rows.map((row, index) => (
            <div
              key={`${item.label}-${index}`}
              style={styles.detailRow}
            >
              <span style={styles.detailName}>
                {index + 1}. {getRowName(item.type, row)}
              </span>
              <strong style={styles.detailValue}>{row.displayValue}</strong>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function getRowName(type, row) {
  if (type === "hosts") return row.host;
  if (type === "resources") return row.resource;
  if (type === "users") return row.username;
  return "unknown";
}

function getEmptyLabel(type) {
  if (type === "hosts") return "host";
  if (type === "resources") return "resource";
  if (type === "users") return "user";
  return "detail";
}

const styles = {
  pageWrap: {
    flex: 1,
    minHeight: 0,
    padding: "0 4px",
    fontFamily: UI_FONT,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    padding: "4px 2px 0",
    flexShrink: 0,
  },
  eyebrow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    color: "#475569",
    fontSize: 12,
    fontWeight: 800,
  },
  refreshButton: {
    height: 36,
    borderRadius: 999,
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#0f172a",
    padding: "0 13px",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
    boxShadow: "0 8px 18px rgba(15,23,42,0.04)",
  },
  refreshButtonDisabled: {
    opacity: 0.58,
    cursor: "not-allowed",
  },
  errorBox: {
    border: "1px solid #fecdd3",
    background: "#fff1f2",
    color: "#be123c",
    borderRadius: 14,
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    display: "grid",
    gap: 4,
  },
  errorMessage: {
    lineHeight: 1.5,
  },
  errorRequestId: {
    color: "#9f1239",
    opacity: 0.78,
  },
  warningBox: {
    border: "1px solid #fde68a",
    background: "#fffbeb",
    color: "#92400e",
    borderRadius: 14,
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.5,
    flexShrink: 0,
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    flexShrink: 0,
  },
  metricCard: {
    minHeight: 130,
    border: "1px solid #e2e8f0",
    background: "#fff",
    borderRadius: 22,
    padding: 15,
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
  },
  metricHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  metricTop: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    minWidth: 0,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 13,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#0f172a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  metricLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: 800,
  },
  metricDesc: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.35,
  },
  metricHeaderValue: {
    fontSize: 22,
    fontWeight: 800,
    color: "#0f172a",
    letterSpacing: "-0.5px",
    flexShrink: 0,
  },
  detailList: {
    display: "grid",
    gap: 6,
    marginTop: 4,
  },
  detailRow: {
    minHeight: 27,
    borderRadius: 10,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    padding: "5px 8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    fontSize: 11,
  },
  detailName: {
    color: "#475569",
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  detailValue: {
    color: "#0f172a",
    fontWeight: 800,
    flexShrink: 0,
  },
  emptyDetail: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: 700,
    textAlign: "center",
  },
};
