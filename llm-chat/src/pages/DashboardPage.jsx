import React from "react";

export default function DashboardPage({ conversations = [], currentTrace }) {
  return (
    <SimplePage title="Dashboard" subtitle="서비스 사용 현황을 한눈에 확인합니다.">
      <InfoRow label="Total conversations" value={conversations.length} />
      <InfoRow label="Current model" value={currentTrace?.model || "gpt-5-mini"} />
      <InfoRow
        label="Last latency"
        value={
          currentTrace?.totalLatencyMs !== undefined
            ? `${currentTrace.totalLatencyMs} ms`
            : "-"
        }
      />
      <InfoRow
        label="Last tokens"
        value={currentTrace?.totalTokens !== undefined ? currentTrace.totalTokens : "-"}
      />
    </SimplePage>
  );
}

function SimplePage({ title, subtitle, children }) {
  return (
    <div style={styles.simplePageWrap}>
      <div style={styles.simplePageCard}>
        <div style={styles.authBrand}>toy-chat</div>
        <h2 style={styles.simplePageTitle}>{title}</h2>
        <p style={styles.simplePageSubtitle}>{subtitle}</p>
        <div style={styles.simplePageBody}>{children}</div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoLabel}>{label}</span>
      <strong style={styles.infoValue}>{value}</strong>
    </div>
  );
}

const styles = {
  simplePageWrap: { flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  simplePageCard: { width: 420, minHeight: 480, background: "#fff", borderRadius: 18, border: "1px solid #dbdbdb", boxShadow: "0 8px 24px rgba(0,0,0,0.06)", padding: "48px 34px", display: "flex", flexDirection: "column", justifyContent: "flex-start", textAlign: "center" },
  authBrand: { textAlign: "center", fontSize: 30, fontWeight: 800, color: "#111827", letterSpacing: "-0.5px", marginBottom: 36 },
  simplePageTitle: { margin: 0, fontSize: 24, fontWeight: 800, color: "#111827" },
  simplePageSubtitle: { margin: "14px 0 0", fontSize: 14, color: "#6b7280", lineHeight: 1.7 },
  simplePageBody: { marginTop: 34, display: "grid", gap: 14 },
  infoRow: { minHeight: 54, borderRadius: 14, border: "1px solid #e5e7eb", background: "#f9fafb", padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  infoLabel: { fontSize: 13, color: "#6b7280", fontWeight: 700 },
  infoValue: { fontSize: 13, color: "#111827", fontWeight: 900, textAlign: "right" },
};
