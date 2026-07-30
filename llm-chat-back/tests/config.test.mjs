import assert from "node:assert/strict";
import test from "node:test";

Object.assign(process.env, {
  DD_VERSION: "0.2.3",
  JWT_SECRET: "test-secret",
  MYSQL_DATABASE: "toy_chat",
  MYSQL_HOST: "127.0.0.1",
  MYSQL_USER: "toy_chat_user",
  OPENAI_API_KEY: "test-openai-key",
});

const { validateEnvironment } = await import("../config.mjs");

function validEnv(overrides = {}) {
  return {
    DD_VERSION: "0.2.3",
    JWT_SECRET: "test-secret",
    MYSQL_DATABASE: "toy_chat",
    MYSQL_HOST: "127.0.0.1",
    MYSQL_USER: "toy_chat_user",
    OPENAI_API_KEY: "test-openai-key",
    ...overrides,
  };
}

test("필수 환경변수 누락을 한 번에 안내한다", () => {
  const { issues } = validateEnvironment({});
  assert.ok(issues.some((issue) => issue.includes("JWT_SECRET")));
  assert.ok(issues.some((issue) => issue.includes("OPENAI_API_KEY")));
  assert.ok(issues.some((issue) => issue.includes("MYSQL_HOST")));
  assert.ok(issues.some((issue) => issue.includes("DD_VERSION")));
});

test("RAG overlap과 chunk size의 관계를 검증한다", () => {
  const { issues } = validateEnvironment(
    validEnv({
      RAG_CHUNK_SIZE: "500",
      RAG_CHUNK_OVERLAP: "500",
    })
  );
  assert.ok(issues.some((issue) => issue.includes("RAG_CHUNK_OVERLAP")));
});

test("운영 환경의 wildcard CORS를 거부한다", () => {
  const { issues } = validateEnvironment(
    validEnv({
      NODE_ENV: "production",
      CORS_ORIGIN: "*",
      RUM_TIMING_ALLOW_ORIGIN: "*",
    })
  );
  assert.equal(issues.filter((issue) => issue.includes("*")).length, 2);
});

test("정상 환경설정은 숫자와 목록을 정규화한다", () => {
  const { config, issues } = validateEnvironment(
    validEnv({
      LLM_REQUEST_TIMEOUT_MS: "45000",
      CORS_ORIGIN: "http://localhost:5173,http://127.0.0.1:5173",
    })
  );
  assert.deepEqual(issues, []);
  assert.equal(config.llmRequestTimeoutMs, 45_000);
  assert.equal(config.corsOrigins.length, 2);
});

