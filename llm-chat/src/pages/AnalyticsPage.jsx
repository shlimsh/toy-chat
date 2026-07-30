export default function AnalyticsPage({ conversations = [] }) {
  const classifyQuestion = (title = "") => {
    const text = String(title).toLowerCase();

    if (
      text.includes("datadog") ||
      text.includes("데이터독") ||
      text.includes("apm") ||
      text.includes("rum") ||
      text.includes("incident") ||
      text.includes("장애")
    ) {
      return "Datadog";
    }

    if (
      text.includes("cpu") ||
      text.includes("memory") ||
      text.includes("메모리") ||
      text.includes("server") ||
      text.includes("서버") ||
      text.includes("monitoring")
    ) {
      return "Monitoring";
    }

    if (
      text.includes("error") ||
      text.includes("에러") ||
      text.includes("fail") ||
      text.includes("failed") ||
      text.includes("exception") ||
      text.includes("오류")
    ) {
      return "Error";
    }

    if (
      text.includes("aws") ||
      text.includes("lambda") ||
      text.includes("람다") ||
      text.includes("api gateway") ||
      text.includes("sns")
    ) {
      return "AWS";
    }

    return "General";
  };

  const categoryMap = conversations.reduce((acc, conv) => {
    const category = classifyQuestion(conv.title);
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  const chartData = Object.entries(categoryMap)
    .map(([label, value]) => ({ label, value }))
    .filter((item) => item.value > 0);

  const displayChartData =
    chartData.length > 0 ? chartData : [{ label: "General", value: 1 }];

  const max = Math.max(...displayChartData.map((item) => item.value));

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.chartBox}>
          <div style={styles.sectionTitle}>Question Category</div>

          {displayChartData.map((item) => (
            <div key={item.label} style={styles.barRow}>
              <div style={styles.barLabel}>{item.label}</div>
              <div style={styles.barTrack}>
                <div
                  style={{
                    ...styles.barFill,
                    width: `${(item.value / max) * 100}%`,
                  }}
                />
              </div>
              <div style={styles.barValue}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={styles.successBox}>
          <div style={styles.sectionTitle}>Question Success Rate</div>

          <div style={styles.successRow}>
            <div style={styles.successRate}>92%</div>
            <div style={styles.successMeta}>
              <div>Success: 23</div>
              <div>Failed: 2</div>
            </div>
          </div>

          <div style={styles.rateTrack}>
            <div style={styles.rateFill} />
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px 0",
  },

  card: {
    width: "min(520px, 92%)",
    background: "#fff",
    borderRadius: 22,
    border: "1px solid #dbdbdb",
    boxShadow: "0 12px 30px rgba(15,23,42,0.07)",
    padding: 28,
    display: "grid",
    gap: 18,
  },

  chartBox: {
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    padding: 20,
    background: "#fbfdff",
  },

  sectionTitle: {
    textAlign: "left",
    fontSize: 15,
    fontWeight: 900,
    color: "#111827",
    marginBottom: 18,
  },

  barRow: {
    display: "grid",
    gridTemplateColumns: "92px 1fr 28px",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },

  barLabel: {
    textAlign: "left",
    fontSize: 12,
    fontWeight: 800,
    color: "#64748b",
  },

  barTrack: {
    height: 10,
    borderRadius: 999,
    background: "#e5e7eb",
    overflow: "hidden",
  },

  barFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
  },

  barValue: {
    fontSize: 12,
    fontWeight: 900,
    color: "#111827",
  },

  successBox: {
    border: "1px solid #dbeafe",
    borderRadius: 18,
    padding: 20,
    background: "#fbfdff",
  },

  successRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  successRate: {
    fontSize: 34,
    fontWeight: 900,
    color: "#2563eb",
    lineHeight: 1,
  },

  successMeta: {
    textAlign: "right",
    fontSize: 13,
    fontWeight: 800,
    color: "#64748b",
    lineHeight: 1.8,
  },

  rateTrack: {
    marginTop: 16,
    height: 8,
    borderRadius: 999,
    background: "#e5e7eb",
    overflow: "hidden",
  },

  rateFill: {
    width: "92%",
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #22c55e, #3b82f6)",
  },
};
