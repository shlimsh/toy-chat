import React from "react";
import { reportFrontendError } from "./lib/observability.js";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    const errorId =
      globalThis.crypto?.randomUUID?.().slice(0, 8) ||
      Date.now().toString(36);
    this.setState({ errorId });
    reportFrontendError(error, {
      event: "frontend_render_error",
      error_id: errorId,
      error_boundary: true,
      component_stack: errorInfo?.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            minHeight: "100vh",
            padding: 24,
            display: "grid",
            placeItems: "center",
            background: "#f8fafc",
            color: "#0f172a",
            fontFamily:
              'Inter, Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
          }}
        >
          <div
            style={{
              width: "min(520px, 100%)",
              padding: 28,
              borderRadius: 24,
              border: "1px solid #fecdd3",
              background: "#fff",
              boxShadow: "0 20px 48px rgba(15,23,42,0.08)",
            }}
          >
            <div style={{ color: "#be123c", fontWeight: 900, fontSize: 13 }}>
              화면 오류
            </div>
            <h2 style={{ margin: "8px 0 10px", fontSize: 24 }}>
              화면을 표시하지 못했습니다.
            </h2>
            <p style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>
              일시적인 화면 오류가 발생했습니다. 페이지를 새로고침해 주세요.
              문제가 계속되면 아래 오류 ID를 담당자에게 전달해 주세요.
            </p>
            {this.state.errorId ? (
              <div
                style={{
                  marginTop: 14,
                  color: "#64748b",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                오류 ID: {this.state.errorId}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: 20,
                height: 42,
                padding: "0 18px",
                border: 0,
                borderRadius: 999,
                background: "#0f172a",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              페이지 새로고침
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
