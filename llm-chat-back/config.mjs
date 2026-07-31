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

function decimal(value, fallback, { name, min, max }, issues) {
  const normalized = Number(value ?? fallback);

  if (!Number.isFinite(normalized) || normalized < min || normalized > max) {
    issues.push(`${name}은(는) ${min}~${max} 범위의 숫자여야 합니다.`);
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

function enumValue(value, fallback, { name, allowed }, issues) {
  const normalized = text(value, fallback).toLowerCase();

  if (!allowed.includes(normalized)) {
    issues.push(`${name}은(는) ${allowed.join(", ")} 중 하나여야 합니다.`);
    return fallback;
  }

  return normalized;
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
  const ragMinScore = decimal(env.RAG_MIN_SCORE, 0.18, {
    name: "RAG_MIN_SCORE",
    min: 0,
    max: 1,
  }, issues);
  const ragMaxChunksPerDocument = integer(
    env.RAG_MAX_CHUNKS_PER_DOCUMENT,
    2,
    {
      name: "RAG_MAX_CHUNKS_PER_DOCUMENT",
      min: 1,
      max: 10,
    },
    issues
  );
  const ragEmbeddingBatchSize = integer(env.RAG_EMBEDDING_BATCH_SIZE, 32, {
    name: "RAG_EMBEDDING_BATCH_SIZE",
    min: 1,
    max: 100,
  }, issues);
  const spanBodyTagMax = integer(env.SPAN_BODY_TAG_MAX, 8192, {
    name: "SPAN_BODY_TAG_MAX",
    min: 512,
    max: 65_536,
  }, issues);
  const spanBodyCaptureMode = enumValue(
    env.SPAN_BODY_CAPTURE_MODE,
    "metadata",
    {
      name: "SPAN_BODY_CAPTURE_MODE",
      allowed: ["off", "metadata", "full"],
    },
    issues
  );
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
  const smsRequestTimeoutMs = integer(env.SMS_REQUEST_TIMEOUT_MS, 15_000, {
    name: "SMS_REQUEST_TIMEOUT_MS",
    min: 1_000,
    max: 60_000,
  }, issues);
  const smsRateLimitWindowMs = integer(
    env.SMS_RATE_LIMIT_WINDOW_MS,
    60_000,
    {
      name: "SMS_RATE_LIMIT_WINDOW_MS",
      min: 1_000,
      max: 3_600_000,
    },
    issues
  );
  const smsRateLimitMax = integer(env.SMS_RATE_LIMIT_MAX, 3, {
    name: "SMS_RATE_LIMIT_MAX",
    min: 1,
    max: 100,
  }, issues);
  const conversationPageSize = integer(env.CONVERSATION_PAGE_SIZE, 20, {
    name: "CONVERSATION_PAGE_SIZE",
    min: 1,
    max: 100,
  }, issues);
  const messagePageSize = integer(env.MESSAGE_PAGE_SIZE, 50, {
    name: "MESSAGE_PAGE_SIZE",
    min: 1,
    max: 200,
  }, issues);
  const llmHistoryMessageLimit = integer(
    env.LLM_HISTORY_MESSAGE_LIMIT,
    80,
    {
      name: "LLM_HISTORY_MESSAGE_LIMIT",
      min: 1,
      max: 200,
    },
    issues
  );

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

  if (isProduction && spanBodyCaptureMode === "full") {
    issues.push(
      "운영 환경에서는 SPAN_BODY_CAPTURE_MODE=full을 사용할 수 없습니다."
    );
  }

  const jwtSecret = requireValue(env, "JWT_SECRET", issues);
  const openaiApiKey = text(env.OPENAI_API_KEY);
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

  const openaiEnabled = Boolean(openaiApiKey);
  const azureEnabled = Boolean(azureApiKey && azureEndpoint);

  if (!openaiEnabled && !azureEnabled) {
    issues.push(
      "OPENAI_API_KEY 또는 Azure AI 설정 중 하나 이상이 필요합니다."
    );
  }

  if (!openaiEnabled && azureEnabled) {
    warnings.push(
      "OpenAI Embedding을 사용할 수 없어 RAG는 Keyword 검색 모드로 동작합니다."
    );
  }

  const datadogApiKey = text(env.DD_API_KEY);
  const datadogAppKey = text(env.DD_APP_KEY);
  if (Boolean(datadogApiKey) !== Boolean(datadogAppKey)) {
    warnings.push(
      "Monitoring API를 사용하려면 DD_API_KEY와 DD_APP_KEY를 함께 설정해야 합니다."
    );
  }

  const smsApiUrl = text(env.SMS_API_URL);
  if (!smsApiUrl) {
    warnings.push(
      "SMS_API_URL이 없어 문자 발송 기능은 비활성 상태로 동작합니다."
    );
  } else {
    try {
      const parsed = new URL(smsApiUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        issues.push("SMS_API_URL은 http 또는 https URL이어야 합니다.");
      }
      if (isProduction && parsed.protocol !== "https:") {
        issues.push("운영 환경의 SMS_API_URL은 https를 사용해야 합니다.");
      }
    } catch {
      issues.push("SMS_API_URL이 올바른 URL 형식이 아닙니다.");
    }
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
    openaiEnabled,
    openaiModel: text(env.OPENAI_MODEL, "gpt-5-mini"),
    embeddingModel: text(
      env.OPENAI_EMBEDDING_MODEL,
      "text-embedding-3-small"
    ),
    azureApiKey,
    azureEndpoint,
    azureModel: text(env.AZURE_OPENAI_MODEL, "gpt-4o-mini"),
    azureEnabled,
    ragChunkSize,
    ragChunkOverlap,
    ragTopK,
    ragMinScore,
    ragMaxChunksPerDocument,
    ragEmbeddingBatchSize,
    spanBodyTagMax,
    spanBodyCaptureMode,
    llmRequestTimeoutMs,
    readinessTimeoutMs,
    shutdownTimeoutMs,
    smsApiUrl,
    smsEnabled: Boolean(smsApiUrl),
    smsRequestTimeoutMs,
    smsRateLimitWindowMs,
    smsRateLimitMax,
    conversationPageSize,
    messagePageSize,
    llmHistoryMessageLimit,
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
    monitoringRumService: text(
      env.MONITORING_RUM_SERVICE,
      "shlim-toy-chat-front"
    ),
    monitoringRumMetric: text(
      env.MONITORING_RUM_METRIC,
      "rum.measure.session"
    ),
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
