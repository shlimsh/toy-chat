import React, { useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Lock,
  Radio,
  Save,
  ShieldCheck,
  Sparkles,
  Zap,
  Cloud,
} from "lucide-react";

const UI_FONT =
  'Inter, Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Segoe UI", Arial, sans-serif';

const PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    icon: <Bot size={16} />,
    defaultModel: "gpt-5-mini",
    models: [
      {
        id: "gpt-5.5",
        name: "GPT-5.5",
        desc: "Frontier Model",
        badge: "Locked",
        disabled: true,
        score: "Max",
      },
      {
        id: "gpt-5.4",
        name: "GPT-5.4",
        desc: "High Intelligence",
        badge: "Locked",
        disabled: true,
        score: "High",
      },
      {
        id: "gpt-5-mini",
        name: "GPT-5 mini",
        desc: "현재 데모 기본 모델",
        badge: "Recommended",
        disabled: false,
        score: "Balanced",
      },
      {
        id: "gpt-5-nano",
        name: "GPT-5 nano",
        desc: "빠른 응답 · 저비용",
        badge: "Fast",
        disabled: false,
        score: "Fast",
      },
      {
        id: "gpt-4.1",
        name: "GPT-4.1",
        desc: "GPT-4 계열 최상위",
        badge: "Locked",
        disabled: true,
        score: "High",
      },
      {
        id: "gpt-4.1-mini",
        name: "GPT-4.1 mini",
        desc: "GPT-4 계열 균형형",
        badge: "Legacy",
        disabled: false,
        score: "Balanced",
      },
      {
        id: "gpt-4.1-nano",
        name: "GPT-4.1 nano",
        desc: "GPT-4 계열 최저비용",
        badge: "Low Cost",
        disabled: false,
        score: "Low Cost",
      },
    ],
  },
  {
    id: "azure",
    name: "Azure AI",
    icon: <Cloud size={16} />,
    defaultModel: "grok-4.3",
    models: [
      {
        id: "grok-4.3",
        name: "grok-4.3",
        desc: "현재 Azure AI 기본 모델",
        badge: "Active",
        disabled: false,
        score: "Balanced",
      },
      {
        id: "gpt-4o",
        name: "GPT-4o",
        desc: "Azure OpenAI 범용 모델",
        badge: "Available",
        disabled: false,
        score: "Balanced",
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o mini",
        desc: "빠른 응답 · 저비용",
        badge: "Fast",
        disabled: false,
        score: "Fast",
      },
      {
        id: "gpt-4.1-azure",
        name: "GPT-4.1",
        desc: "Azure 고성능 모델",
        badge: "Locked",
        disabled: true,
        score: "High",
      },
    ],
  },
];

export default function SettingsPage() {
  const [selectedModels, setSelectedModels] = useState({
    openai: "gpt-5-mini",
    azure: "grok-4.3",
  });

  const [streaming, setStreaming] = useState(true);
  const [toolCalling, setToolCalling] = useState(true);
  const [memory, setMemory] = useState(true);
  const [rag, setRag] = useState(true);
  const [llmObs, setLlmObs] = useState(true);
  const [rum, setRum] = useState(true);
  const [apm, setApm] = useState(true);
  const [logs, setLogs] = useState(true);
  const [savedAt, setSavedAt] = useState(null);

  const currentRuntime = useMemo(() => {
    return PROVIDERS.map((provider) => {
      const selectedId = selectedModels[provider.id];
      const model =
        provider.models.find((item) => item.id === selectedId) ||
        provider.models[0];

      return {
        provider,
        model,
      };
    });
  }, [selectedModels]);

  const runtimeOnCount = [streaming, toolCalling, memory, rag, llmObs].filter(
    Boolean
  ).length;
  const datadogOnCount = [rum, apm, logs].filter(Boolean).length;

  const selectModel = (providerId, model) => {
    if (model.disabled) return;

    setSelectedModels((prev) => ({
      ...prev,
      [providerId]: model.id,
    }));
  };

  const applySettings = () => {
    setSavedAt(
      new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    );
  };

  return (
    <div style={styles.pageWrap}>
      <style>{`
        .settings-card, .model-card {
          transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
        }
        .settings-card:hover, .model-card:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 30px rgba(15,23,42,.08);
        }
        .model-card:not(:disabled):hover {
          border-color: rgba(124,58,237,.45);
        }
        .model-card:disabled {
          cursor: not-allowed;
        }
      `}</style>

      <section style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>
            <Sparkles size={13} />
            AI Runtime Control Center
          </div>
          <p style={styles.subtitle}>
            OpenAI와 Azure AI 모델, 런타임 옵션, Datadog 수집 설정을 관리하는
            데모 설정 페이지
          </p>
        </div>

        <div style={styles.heroStatus}>
          <span>현재 Runtime</span>
          {currentRuntime.map(({ provider, model }) => (
            <div key={provider.id} style={styles.heroRuntimeRow}>
              <strong>{provider.name}</strong>
              <small>{model.name}</small>
            </div>
          ))}
        </div>
      </section>

      <section style={styles.layout}>
        <div style={styles.leftColumn}>
          <div className="settings-card" style={styles.panel}>
            <PanelHeader
              icon={<Bot size={16} />}
              title="Provider Model Selection"
              desc="OpenAI와 Azure AI 모델을 Provider 단위로 선택합니다."
            />

            <div style={styles.providerList}>
              {PROVIDERS.map((provider) => (
                <div key={provider.id} style={styles.providerSection}>
                  <div style={styles.providerHeader}>
                    <div style={styles.providerTitle}>
                      <div style={styles.providerIcon}>{provider.icon}</div>
                      <div>
                        <strong>{provider.name}</strong>
                        <span>
                          Active model ·{" "}
                          {
                            provider.models.find(
                              (item) => item.id === selectedModels[provider.id]
                            )?.name
                          }
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={styles.modelGrid}>
                    {provider.models.map((model) => {
                      const selected = selectedModels[provider.id] === model.id;

                      return (
                        <button
                          key={model.id}
                          type="button"
                          disabled={model.disabled}
                          className="model-card"
                          onClick={() => selectModel(provider.id, model)}
                          style={{
                            ...styles.modelCard,
                            ...(selected ? styles.modelSelected : {}),
                            ...(model.disabled ? styles.modelDisabled : {}),
                          }}
                        >
                          <div style={styles.modelTop}>
                            <div>
                              <strong style={styles.modelName}>
                                {model.name}
                              </strong>
                              <span style={styles.modelDesc}>
                                {model.desc}
                              </span>
                            </div>

                            <span
                              style={{
                                ...styles.badge,
                                ...(model.disabled
                                  ? styles.badgeLocked
                                  : selected
                                  ? styles.badgeActive
                                  : styles.badgeDefault),
                              }}
                            >
                              {model.disabled && <Lock size={10} />}
                              {selected && !model.disabled && (
                                <CheckCircle2 size={11} />
                              )}
                              {model.disabled
                                ? "Locked"
                                : selected
                                ? "Active"
                                : model.badge}
                            </span>
                          </div>

                          <div style={styles.modelBottom}>
                            <span>
                              {model.disabled
                                ? "Budget protected"
                                : "Available"}
                            </span>
                            <strong>{model.score}</strong>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.twoGrid}>
            <ControlPanel
              icon={<Zap size={16} />}
              title="Runtime"
              desc={`${runtimeOnCount}/5 enabled`}
              rows={[
                ["Streaming Response", streaming, setStreaming],
                ["Tool Calling", toolCalling, setToolCalling],
                ["Conversation Memory", memory, setMemory],
                ["Datadog RAG", rag, setRag],
                ["LLM Observability", llmObs, setLlmObs],
              ]}
            />

            <ControlPanel
              icon={<Radio size={16} />}
              title="Datadog Collection"
              desc={`${datadogOnCount}/3 enabled`}
              rows={[
                ["RUM Tracking", rum, setRum],
                ["APM Tracing", apm, setApm],
                ["Log Collection", logs, setLogs],
              ]}
              extra={
                <div style={styles.metaBox}>
                  <MetaRow label="Site" value="US1" />
                  <MetaRow label="Env" value="dev" />
                  <MetaRow label="Service" value="shlim-toy-chat-api" />
                </div>
              }
            />
          </div>
        </div>

        <aside style={styles.rightColumn}>
          <div className="settings-card" style={styles.panel}>
            <PanelHeader
              icon={<Gauge size={16} />}
              title="Runtime Status"
              desc="현재 데모 설정 요약"
            />

            {currentRuntime.map(({ provider, model }) => (
              <StatusRow
                key={provider.id}
                label={provider.name}
                value={model.name}
              />
            ))}

            <StatusRow label="Runtime" value={`${runtimeOnCount}/5 ON`} />
            <StatusRow label="Datadog" value={`${datadogOnCount}/3 ON`} />
            <StatusRow label="Backend Apply" value="Disabled" />
            <StatusRow label="Last Apply" value={savedAt || "Not applied"} />

            <button
              type="button"
              style={styles.applyButton}
              onClick={applySettings}
            >
              <Save size={15} />
              Save Demo Configuration
            </button>
          </div>

          <div className="settings-card" style={styles.panel}>
            <PanelHeader
              icon={<CircleDollarSign size={16} />}
              title="Budget Guard"
              desc="고비용 모델 호출 방지"
            />

            <div style={styles.guardBox}>
              <ShieldCheck size={22} />
              <div>
                <strong>Cost Protection Enabled</strong>
                <span>Locked models cannot be selected.</span>
              </div>
            </div>

            <div style={styles.lockList}>
              <LockedModel label="OpenAI · GPT-5.5" />
              <LockedModel label="OpenAI · GPT-5.4" />
              <LockedModel label="OpenAI · GPT-4.1" />
              <LockedModel label="Azure AI · GPT-4.1" />
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function PanelHeader({ icon, title, desc }) {
  return (
    <div style={styles.panelHeader}>
      <div style={styles.panelIcon}>{icon}</div>
      <div>
        <h3 style={styles.panelTitle}>{title}</h3>
        <p style={styles.panelDesc}>{desc}</p>
      </div>
    </div>
  );
}

function ControlPanel({ icon, title, desc, rows, extra }) {
  return (
    <div className="settings-card" style={styles.panel}>
      <PanelHeader icon={icon} title={title} desc={desc} />
      <div style={styles.toggleList}>
        {rows.map(([label, checked, setter]) => (
          <ToggleRow
            key={label}
            label={label}
            checked={checked}
            onChange={setter}
          />
        ))}
      </div>
      {extra}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div style={styles.toggleRow}>
      <div style={styles.toggleText}>
        <strong>{label}</strong>
        <span>{checked ? "Enabled" : "Disabled"}</span>
      </div>

      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          ...styles.toggle,
          ...(checked ? styles.toggleOn : styles.toggleOff),
        }}
      >
        <span
          style={{
            ...styles.toggleDot,
            transform: checked ? "translateX(18px)" : "translateX(0)",
          }}
        />
      </button>
    </div>
  );
}

function StatusRow({ label, value }) {
  return (
    <div style={styles.statusRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div style={styles.metaRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LockedModel({ label }) {
  return (
    <div style={styles.lockedItem}>
      <Lock size={12} />
      <span>{label}</span>
    </div>
  );
}

const styles = {
  pageWrap: {
    flex: 1,
    minHeight: 0,
    padding: "0 4px 14px",
    overflowY: "auto",
    overflowX: "hidden",
    fontFamily: UI_FONT,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  hero: {
    minHeight: 104,
    borderRadius: 26,
    padding: "18px 22px",
    background:
      "linear-gradient(135deg, #0f172a 0%, #312e81 52%, #2563eb 100%)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    boxShadow: "0 14px 32px rgba(37,99,235,.22)",
  },

  eyebrow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    color: "#dbeafe",
    fontSize: 18,
    fontWeight: 900,
    marginBottom: 7,
  },

  subtitle: {
    margin: "9px 0 0",
    maxWidth: 670,
    color: "#dbeafe",
    fontSize: 12,
    lineHeight: 1.5,
    fontWeight: 650,
  },

  heroStatus: {
    width: 300,
    borderRadius: 20,
    padding: 13,
    fontSize: 12,
    background: "rgba(255,255,255,.13)",
    border: "1px solid rgba(255,255,255,.18)",
    display: "grid",
    gap: 8,
    flexShrink: 0,
  },

  heroRuntimeRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    fontSize: 12,
  },

  layout: {
    display: "grid",
    gridTemplateColumns: "1fr 300px",
    gap: 10,
    alignItems: "start",
  },

  leftColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 0,
  },

  rightColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 0,
  },

  panel: {
    borderRadius: 22,
    padding: 15,
    background: "#fff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 8px 22px rgba(15,23,42,.055)",
  },

  panelHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },

  panelIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  panelTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 950,
  },

  panelDesc: {
    margin: "3px 0 0",
    color: "#64748b",
    fontSize: 11,
    lineHeight: 1.35,
    fontWeight: 650,
  },

  providerList: {
    display: "grid",
    gap: 14,
  },

  providerSection: {
    borderRadius: 18,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    padding: 12,
  },

  providerHeader: {
    marginBottom: 10,
  },

  providerTitle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "#0f172a",
    fontSize: 13,
    fontWeight: 950,
  },

  providerIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    background: "#ffffff",
    color: "#4f46e5",
    border: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  modelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
  },

  modelCard: {
    minHeight: 68,
    borderRadius: 16,
    padding: 11,
    border: "1px solid #e2e8f0",
    background: "linear-gradient(135deg, #fff, #f8fafc)",
    textAlign: "left",
    cursor: "pointer",
  },

  modelSelected: {
    borderColor: "rgba(124,58,237,.55)",
    background:
      "linear-gradient(135deg, rgba(124,58,237,.12), rgba(59,130,246,.06))",
  },

  modelDisabled: {
    opacity: 0.5,
    background: "#f8fafc",
  },

  modelTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },

  modelName: {
    display: "block",
    color: "#0f172a",
    fontSize: 13,
    fontWeight: 950,
  },

  modelDesc: {
    display: "block",
    color: "#64748b",
    fontSize: 10,
    lineHeight: 1.3,
    marginTop: 4,
    fontWeight: 650,
  },

  modelBottom: {
    marginTop: 7,
    display: "flex",
    justifyContent: "space-between",
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: 850,
  },

  badge: {
    minHeight: 22,
    padding: "0 8px",
    borderRadius: 999,
    border: "1px solid",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10,
    fontWeight: 950,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },

  badgeActive: {
    color: "#047857",
    background: "rgba(16,185,129,.12)",
    borderColor: "rgba(16,185,129,.25)",
  },

  badgeLocked: {
    color: "#b91c1c",
    background: "rgba(239,68,68,.1)",
    borderColor: "rgba(239,68,68,.22)",
  },

  badgeDefault: {
    color: "#6d28d9",
    background: "rgba(139,92,246,.1)",
    borderColor: "rgba(139,92,246,.22)",
  },

  twoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },

  toggleList: {
    display: "grid",
    gap: 7,
  },

  toggleRow: {
    minHeight: 38,
    borderRadius: 14,
    padding: "0 10px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  toggleText: {
    display: "grid",
    gap: 1,
    color: "#0f172a",
    fontSize: 11,
  },

  toggle: {
    width: 42,
    height: 22,
    borderRadius: 999,
    border: 0,
    padding: 2,
    cursor: "pointer",
    flexShrink: 0,
  },

  toggleOn: {
    background: "linear-gradient(135deg, #22c55e, #14b8a6)",
  },

  toggleOff: {
    background: "#cbd5e1",
  },

  toggleDot: {
    width: 18,
    height: 18,
    borderRadius: 999,
    background: "#fff",
    display: "block",
    transition: "transform .18s ease",
  },

  statusRow: {
    minHeight: 32,
    borderRadius: 13,
    padding: "0 10px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: "#64748b",
    fontSize: 10,
    fontWeight: 850,
    marginBottom: 7,
  },

  applyButton: {
    width: "100%",
    height: 38,
    marginTop: 7,
    border: 0,
    borderRadius: 14,
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff",
    fontSize: 12,
    fontWeight: 950,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    cursor: "pointer",
  },

  guardBox: {
    borderRadius: 16,
    padding: 12,
    background:
      "linear-gradient(135deg, rgba(16,185,129,.1), rgba(59,130,246,.06))",
    border: "1px solid rgba(16,185,129,.22)",
    display: "flex",
    gap: 10,
    color: "#0f172a",
    fontSize: 11,
  },

  lockList: {
    display: "grid",
    gap: 7,
    marginTop: 10,
  },

  lockedItem: {
    minHeight: 31,
    borderRadius: 12,
    padding: "0 10px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#b91c1c",
    fontSize: 11,
    fontWeight: 850,
  },

  metaBox: {
    marginTop: 8,
    display: "grid",
    gap: 6,
  },

  metaRow: {
    minHeight: 31,
    borderRadius: 12,
    padding: "0 10px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: "#64748b",
    fontSize: 10,
    fontWeight: 850,
  },
};
