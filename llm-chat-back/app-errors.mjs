const ERROR_DEFINITIONS = Object.freeze({
  auth_required: {
    status: 401,
    message: "로그인이 필요합니다. 다시 로그인해 주세요.",
    retryable: false,
  },
  invalid_token: {
    status: 401,
    message: "로그인 시간이 만료되었습니다. 다시 로그인해 주세요.",
    retryable: false,
  },
  name_required: {
    status: 400,
    message: "이름을 입력해 주세요.",
    retryable: false,
  },
  email_required: {
    status: 400,
    message: "이메일을 입력해 주세요.",
    retryable: false,
  },
  password_required: {
    status: 400,
    message: "비밀번호를 입력해 주세요.",
    retryable: false,
  },
  email_already_exists: {
    status: 409,
    message: "이미 가입된 이메일입니다. 로그인해 주세요.",
    retryable: false,
  },
  user_not_found: {
    status: 404,
    message: "존재하지 않는 이메일입니다.",
    retryable: false,
  },
  invalid_password: {
    status: 401,
    message: "비밀번호가 올바르지 않습니다.",
    retryable: false,
  },
  conversation_not_found: {
    status: 404,
    message: "대화를 찾을 수 없습니다. 새 대화를 시작해 주세요.",
    retryable: false,
  },
  message_required: {
    status: 400,
    message: "질문을 입력해 주세요.",
    retryable: false,
  },
  invalid_json: {
    status: 400,
    message: "요청 형식이 올바르지 않습니다.",
    retryable: false,
  },
  cors_not_allowed: {
    status: 403,
    message: "허용되지 않은 주소에서 요청했습니다.",
    retryable: false,
  },
  route_not_found: {
    status: 404,
    message: "요청한 기능을 찾을 수 없습니다.",
    retryable: false,
  },
  forced_demo_error: {
    status: 500,
    message:
      "백엔드 오류 테스트가 정상적으로 실행되었습니다. Normal 모드로 변경한 뒤 다시 시도해 주세요.",
    retryable: false,
  },
  monitoring_unavailable: {
    status: 503,
    message:
      "모니터링 데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.",
    retryable: true,
  },
  database_unavailable: {
    status: 503,
    message: "데이터 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  chat_unavailable: {
    status: 503,
    message: "답변을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  service_shutting_down: {
    status: 503,
    message:
      "서버가 안전하게 재시작되는 중입니다. 잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  internal_server_error: {
    status: 500,
    message: "요청 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
});

const DATABASE_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "PROTOCOL_CONNECTION_LOST",
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
]);

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function getErrorDefinition(code) {
  return (
    ERROR_DEFINITIONS[normalizeCode(code)] ||
    ERROR_DEFINITIONS.internal_server_error
  );
}

export function sendApiError(
  req,
  res,
  code,
  { status, message, retryable } = {}
) {
  const normalizedCode = normalizeCode(code) || "internal_server_error";
  const definition = getErrorDefinition(normalizedCode);

  return res.status(status || definition.status).json({
    error: normalizedCode,
    message: message || definition.message,
    retryable:
      typeof retryable === "boolean" ? retryable : definition.retryable,
    requestId: req?.requestId || undefined,
  });
}

export function classifyServerError(error, fallbackCode = "internal_server_error") {
  if (DATABASE_ERROR_CODES.has(String(error?.code || "").toUpperCase())) {
    return "database_unavailable";
  }

  return normalizeCode(fallbackCode) || "internal_server_error";
}

export function toProviderUserError(provider, error) {
  const providerName = String(provider || "AI 서비스");
  const status = Number(error?.status || error?.response?.status || 0);
  const rawCode = String(
    error?.code || error?.error?.code || error?.cause?.code || ""
  ).toLowerCase();
  const rawMessage = String(error?.message || "").toLowerCase();
  const combined = `${rawCode} ${rawMessage}`;

  if (
    status === 429 ||
    combined.includes("rate_limit") ||
    combined.includes("too many requests")
  ) {
    return {
      code: "provider_rate_limited",
      message: `${providerName} 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.`,
      retryable: true,
    };
  }

  if (
    combined.includes("timeout") ||
    combined.includes("timed out") ||
    combined.includes("aborterror") ||
    rawCode === "request_timeout" ||
    rawCode === "etimedout"
  ) {
    return {
      code: "provider_timeout",
      message: `${providerName} 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.`,
      retryable: true,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    combined.includes("api key") ||
    combined.includes("authentication")
  ) {
    return {
      code: "provider_auth_failed",
      message: `${providerName} 연결 설정을 확인해 주세요.`,
      retryable: false,
    };
  }

  if (
    combined.includes("not configured") ||
    combined.includes("endpoint") ||
    combined.includes("missing")
  ) {
    return {
      code: "provider_not_configured",
      message: `${providerName}가 아직 설정되지 않았습니다.`,
      retryable: false,
    };
  }

  if (
    status >= 500 ||
    rawCode === "econnrefused" ||
    rawCode === "econnreset" ||
    combined.includes("unavailable")
  ) {
    return {
      code: "provider_unavailable",
      message: `${providerName} 서비스에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.`,
      retryable: true,
    };
  }

  return {
    code: "provider_request_failed",
    message: `${providerName} 답변 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.`,
    retryable: true,
  };
}

export { ERROR_DEFINITIONS };
