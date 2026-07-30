import React, { useEffect, useRef, useState } from "react";

import { runtimeConfig } from "../config/runtime-config.js";
import { requestJson, toUserError } from "../lib/api-client.js";
import {
  datadogLogs,
  datadogRum,
  reportFrontendError,
} from "../lib/observability.js";

export default function AuthScreen({
  onLoginSuccess,
  notice = "",
  styles,
}) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const activeRequestRef = useRef(null);

  useEffect(
    () => () => {
      activeRequestRef.current?.abort();
    },
    []
  );

  const submit = async (event) => {
    event.preventDefault();
    setError(null);

    if (
      !email.trim() ||
      !password.trim() ||
      (mode === "register" && !name.trim())
    ) {
      setError({
        message:
          mode === "login"
            ? "이메일과 비밀번호를 입력해 주세요."
            : "이름, 이메일, 비밀번호를 모두 입력해 주세요.",
      });
      return;
    }

    const controller = new AbortController();
    activeRequestRef.current?.abort();
    activeRequestRef.current = controller;
    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const body =
        mode === "login"
          ? { email: email.trim(), password }
          : { name: name.trim(), email: email.trim(), password };
      const data = await requestJson(
        `${runtimeConfig.apiBaseUrl}${endpoint}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          timeoutMs: 15_000,
          signal: controller.signal,
        }
      );

      localStorage.setItem("authToken", data.token);
      localStorage.setItem("authUser", JSON.stringify(data.user));
      const datadogUser = {
        id: String(data.user.id),
        email: data.user.email,
        name: data.user.name,
      };
      datadogRum.setUser(datadogUser);
      datadogLogs.setUser(datadogUser);
      onLoginSuccess(data.user, data.token);
    } catch (requestError) {
      if (requestError?.code === "request_cancelled") return;

      const userError = toUserError(requestError, "auth");
      setError(userError);

      if (mode === "login" && requestError?.status >= 400) {
        datadogRum.addAction("login_failed", {
          error_code: requestError.code,
          request_id: requestError.requestId,
        });
        reportFrontendError(requestError, {
          event: "frontend_auth_failure",
          feature: "auth",
        });
      }
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        setLoading(false);
      }
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setName("");
    setEmail("");
    setPassword("");
    setError(null);
  };

  const disabled =
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
            {mode === "register" ? (
              <input
                type="text"
                className="auth-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="이름"
                autoComplete="name"
                style={styles.authInput}
              />
            ) : null}

            <input
              type="email"
              className="auth-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="이메일"
              autoComplete="email"
              style={styles.authInput}
            />
            <input
              type="password"
              className="auth-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              style={styles.authInput}
            />

            {error || notice ? (
              <div
                className="auth-error"
                role="alert"
                aria-live="assertive"
                style={styles.authError}
              >
                {error?.message || notice}
                {error?.hint ? (
                  <div style={styles.authErrorHint}>{error.hint}</div>
                ) : null}
              </div>
            ) : null}

            <button
              type="submit"
              className="auth-submit"
              disabled={disabled}
              style={{
                ...styles.authSubmit,
                ...(disabled ? styles.authSubmitDisabled : {}),
              }}
            >
              {loading ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
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

