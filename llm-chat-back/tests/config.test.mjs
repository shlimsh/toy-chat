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
  assert.ok(
    issues.some(
      (issue) =>
        issue.includes("OPENAI_API_KEY") && issue.includes("Azure AI")
    )
  );
  assert.ok(issues.some((issue) => issue.includes("MYSQL_HOST")));
  assert.ok(issues.some((issue) => issue.includes("DD_VERSION")));
});

test("Azure AI만 설정해도 유효하며 RAG Keyword 모드를 안내한다", () => {
  const env = validEnv({
    OPENAI_API_KEY: "",
    AZURE_OPENAI_API_KEY: "test-azure-key",
    AZURE_OPENAI_ENDPOINT: "https://example.services.ai.azure.com/models/chat",
  });
  const { config, issues, warnings } = validateEnvironment(env);

  assert.deepEqual(issues, []);
  assert.equal(config.openaiEnabled, false);
  assert.equal(config.azureEnabled, true);
  assert.ok(warnings.some((warning) => warning.includes("Keyword")));
});

test("OpenAI만 설정하면 Azure 없이 유효하다", () => {
  const { config, issues } = validateEnvironment(validEnv());

  assert.deepEqual(issues, []);
  assert.equal(config.openaiEnabled, true);
  assert.equal(config.azureEnabled, false);
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

test("운영 환경에서 전체 요청·응답 본문 Span 수집을 거부한다", () => {
  const { issues } = validateEnvironment(
    validEnv({
      NODE_ENV: "production",
      SPAN_BODY_CAPTURE_MODE: "full",
    })
  );

  assert.ok(
    issues.some((issue) => issue.includes("SPAN_BODY_CAPTURE_MODE=full"))
  );
});

test("정상 환경설정은 숫자와 목록을 정규화한다", () => {
  const { config, issues } = validateEnvironment(
    validEnv({
      LLM_REQUEST_TIMEOUT_MS: "45000",
      RAG_MIN_SCORE: "0.25",
      RAG_MAX_CHUNKS_PER_DOCUMENT: "3",
      RAG_EMBEDDING_BATCH_SIZE: "24",
      CORS_ORIGIN: "http://localhost:5173,http://127.0.0.1:5173",
      SMS_API_URL: "https://example.execute-api.test/send",
      SMS_RATE_LIMIT_MAX: "5",
      SMS_RATE_LIMIT_WINDOW_MS: "120000",
      SPAN_BODY_CAPTURE_MODE: "metadata",
      MONITORING_RUM_SERVICE: "custom-rum-service",
    })
  );
  assert.deepEqual(issues, []);
  assert.equal(config.llmRequestTimeoutMs, 45_000);
  assert.equal(config.ragMinScore, 0.25);
  assert.equal(config.ragMaxChunksPerDocument, 3);
  assert.equal(config.ragEmbeddingBatchSize, 24);
  assert.equal(config.corsOrigins.length, 2);
  assert.equal(config.smsEnabled, true);
  assert.equal(config.smsRateLimitMax, 5);
  assert.equal(config.smsRateLimitWindowMs, 120_000);
  assert.equal(config.spanBodyCaptureMode, "metadata");
  assert.equal(config.monitoringRumService, "custom-rum-service");
});
