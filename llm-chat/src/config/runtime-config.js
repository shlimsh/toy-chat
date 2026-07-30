function required(name, value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(
      `${name} 설정이 없습니다. npm run dev를 다시 실행해 버전을 동기화해 주세요.`
    );
  }
  return normalized;
}

export const runtimeConfig = Object.freeze({
  apiBaseUrl: String(import.meta.env.VITE_API_BASE_URL || "").trim(),
  datadog: Object.freeze({
    applicationId: String(
      import.meta.env.VITE_DD_APPLICATION_ID ||
        "3854465b-fb60-41ed-957b-67b2c3616aea"
    ).trim(),
    clientToken: String(
      import.meta.env.VITE_DD_CLIENT_TOKEN ||
        "pub449df5722fca21cfef9b38fe276703ea"
    ).trim(),
    site: String(import.meta.env.VITE_DD_SITE || "datadoghq.com").trim(),
    service: String(
      import.meta.env.VITE_DD_SERVICE || "shlim-toy-chat-front"
    ).trim(),
    env: String(import.meta.env.VITE_DD_ENV || "dev").trim(),
    version:
      import.meta.env.MODE === "test"
        ? String(import.meta.env.VITE_DD_VERSION || "0.0.0").trim()
        : required("VITE_DD_VERSION", import.meta.env.VITE_DD_VERSION),
    release: Object.freeze({
      buildMode: import.meta.env.PROD ? "production" : "development",
      sourceMapsExpected: Boolean(import.meta.env.PROD),
      minifiedPathPrefix: String(
        import.meta.env.VITE_DD_MINIFIED_PATH_PREFIX ||
          "http://localhost:5173/assets"
      )
        .trim()
        .replace(/\/+$/, ""),
    }),
  }),
});
