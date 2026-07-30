import "dotenv/config";

const DEFAULT_LOCAL_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export class ConfigurationError extends Error {
  constructor(issues) {
    super(
      [
        `환경설정 오류 ${issues.length}건이 발견되었습니다.`,
        ...issues.map((issue) => `- ${issue}`),
      ].join("\n")
    );
    this.name = "ConfigurationError";
    this.code = "CONFIGURATION_INVALID";
    this.issues = issues;
  }
}

function text(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function integer(value, fallback, { name, min, max }, issues) {
  const normalized = Number(value ?? fallback);

  if (!Number.isInteger(normalized) || normalized < min || normalized > max) {
    issues.push(`${name}은(는) ${min}~${max} 범위의 정수여야 합니다.`);
    return fallback;
  }

  return normalized;
}

function csv(value, fallback = []) {
  const items = String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? [...new Set(items)] : fallback;
}

function requireValue(env, name, issues) {
  const value = text(env[name]);
  if (!value) issues.push(`${name} 값이 필요합니다.`);
  return value;
}

export function validateEnvironment(env = process.env) {
  const issues = [];
  const warnings = [];

  const nodeEnv = text(env.NODE_ENV, "development");
  const isProduction = nodeEnv === "production";
  const port = integer(env.PORT, 3001, {
    name: "PORT",
    min: 1,
    max: 65535,
  }, issues);

  const ragChunkSize = integer(env.RAG_CHUNK_SIZE, 1000, {
    name: "RAG_CHUNK_SIZE",
    min: 100,
    max: 20_000,
  }, issues);
  const ragChunkOverlap = integer(env.RAG_CHUNK_OVERLAP, 150, {
    name: "RAG_CHUNK_OVERLAP",
    min: 0,
    max: 19_999,
  }, issues);
  const ragTopK = integer(env.RAG_TOP_K, 3, {
    name: "RAG_TOP_K",
    min: 1,
    max: 20,
  }, issues);
  const spanBodyTagMax = integer(env.SPAN_BODY_TAG_MAX, 8192, {
    name: "SPAN_BODY_TAG_MAX",
    min: 512,
    max: 65_536,
  }, issues);
  const llmRequestTimeoutMs = integer(env.LLM_REQUEST_TIMEOUT_MS, 60_000, {
    name: "LLM_REQUEST_TIMEOUT_MS",
    min: 1_000,
    max: 300_000,
  }, issues);
  const readinessTimeoutMs = integer(env.READINESS_TIMEOUT_MS, 2_000, {
    name: "READINESS_TIMEOUT_MS",
    min: 250,
    max: 10_000,
  }, issues);
  const shutdownTimeoutMs = integer(env.SHUTDOWN_TIMEOUT_MS, 10_000, {
    name: "SHUTDOWN_TIMEOUT_MS",
    min: 1_000,
    max: 60_000,
  }, issues);

  if (ragChunkOverlap >= ragChunkSize) {
    issues.push("RAG_CHUNK_OVERLAP은 RAG_CHUNK_SIZE보다 작아야 합니다.");
  }

  const corsOrigins = csv(env.CORS_ORIGIN, DEFAULT_LOCAL_ORIGINS);
  const timingAllowOrigins = csv(
    env.RUM_TIMING_ALLOW_ORIGIN,
    corsOrigins
  );

  if (isProduction && corsOrigins.includes("*")) {
    issues.push("운영 환경에서는 CORS_ORIGIN에 *를 사용할 수 없습니다.");
  }

  if (isProduction && timingAllowOrigins.includes("*")) {
    issues.push(
      "운영 환경에서는 RUM_TIMING_ALLOW_ORIGIN에 *를 사용할 수 없습니다."
    );
  }

  const jwtSecret = requireValue(env, "JWT_SECRET", issues);
  const openaiApiKey = requireValue(env, "OPENAI_API_KEY", issues);
  const mysqlHost = requireValue(env, "MYSQL_HOST", issues);
  const mysqlUser = requireValue(env, "MYSQL_USER", issues);
  const mysqlDatabase = requireValue(env, "MYSQL_DATABASE", issues);
  const ddVersion = requireValue(env, "DD_VERSION", issues);

  if (
    isProduction &&
    ["change-this-secret-now", "secret", "password"].includes(
      jwtSecret.toLowerCase()
    )
  ) {
    issues.push("운영 환경의 JWT_SECRET을 안전한 임의 문자열로 변경해야 합니다.");
  } else if (
    ["change-this-secret-now", "secret", "password"].includes(
      jwtSecret.toLowerCase()
    )
  ) {
    warnings.push("JWT_SECRET이 데모용 값입니다. 외부 공개 전 변경하세요.");
  }

  const azureApiKey = text(env.AZURE_OPENAI_API_KEY);
  const azureEndpoint = text(env.AZURE_OPENAI_ENDPOINT);

  if (Boolean(azureApiKey) !== Boolean(azureEndpoint)) {
    issues.push(
      "Azure 모델을 사용할 때 AZURE_OPENAI_API_KEY와 AZURE_OPENAI_ENDPOINT를 함께 설정해야 합니다."
    );
  }

  const datadogApiKey = text(env.DD_API_KEY);
  const datadogAppKey = text(env.DD_APP_KEY);
  if (Boolean(datadogApiKey) !== Boolean(datadogAppKey)) {
    warnings.push(
      "Monitoring API를 사용하려면 DD_API_KEY와 DD_APP_KEY를 함께 설정해야 합니다."
    );
  }

  const config = Object.freeze({
    nodeEnv,
    isProduction,
    port,
    service: text(env.DD_SERVICE, "shlim-toy-chat-api"),
    env: text(env.DD_ENV, "dev"),
    version: ddVersion,
    ddSite: text(env.DD_SITE, "datadoghq.com"),
    mlApp: text(
      env.DD_LLMOBS_ML_APP,
      text(env.DD_SERVICE, "shlim-toy-chat")
    ),
    openaiApiKey,
    openaiModel: text(env.OPENAI_MODEL, "gpt-5-mini"),
    embeddingModel: text(
      env.OPENAI_EMBEDDING_MODEL,
      "text-embedding-3-small"
    ),
    azureApiKey,
    azureEndpoint,
    azureModel: text(env.AZURE_OPENAI_MODEL, "gpt-4o-mini"),
    azureEnabled: Boolean(azureApiKey && azureEndpoint),
    ragChunkSize,
    ragChunkOverlap,
    ragTopK,
    spanBodyTagMax,
    llmRequestTimeoutMs,
    readinessTimeoutMs,
    shutdownTimeoutMs,
    corsOrigins,
    timingAllowOrigins,
    jwtSecret,
    mysql: Object.freeze({
      host: mysqlHost,
      port: integer(env.MYSQL_PORT, 3306, {
        name: "MYSQL_PORT",
        min: 1,
        max: 65535,
      }, issues),
      user: mysqlUser,
      password: text(env.MYSQL_PASSWORD),
      database: mysqlDatabase,
    }),
    datadogApiEnabled: Boolean(datadogApiKey && datadogAppKey),
  });

  return { config, issues, warnings };
}

export function loadConfig(env = process.env) {
  const result = validateEnvironment(env);
  if (result.issues.length > 0) {
    throw new ConfigurationError(result.issues);
  }
  return result;
}

const loaded = loadConfig();

export const config = loaded.config;
export const configWarnings = Object.freeze(loaded.warnings);
