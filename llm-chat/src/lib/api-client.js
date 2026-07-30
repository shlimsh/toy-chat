const ERROR_MESSAGES = Object.freeze({
  auth_required: "로그인이 필요합니다. 다시 로그인해 주세요.",
  invalid_token: "로그인 시간이 만료되었습니다. 다시 로그인해 주세요.",
  name_required: "이름을 입력해 주세요.",
  email_required: "이메일을 입력해 주세요.",
  password_required: "비밀번호를 입력해 주세요.",
  email_already_exists: "이미 가입된 이메일입니다. 로그인해 주세요.",
  user_not_found: "존재하지 않는 이메일입니다.",
  invalid_password: "비밀번호가 올바르지 않습니다.",
  conversation_not_found:
    "대화를 찾을 수 없습니다. 새 대화를 시작해 주세요.",
  message_required: "질문을 입력해 주세요.",
  invalid_json: "요청 형식이 올바르지 않습니다.",
  forced_demo_error:
    "백엔드 오류 테스트가 정상적으로 실행되었습니다. Normal 모드로 변경한 뒤 다시 시도해 주세요.",
  monitoring_unavailable:
    "모니터링 데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.",
  sms_not_configured: "문자 발송 기능이 아직 설정되지 않았습니다.",
  sms_rate_limited:
    "문자 발송 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  sms_unavailable:
    "문자 발송 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  database_unavailable:
    "데이터 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  chat_unavailable:
    "답변을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  service_shutting_down:
    "서버가 안전하게 재시작되는 중입니다. 잠시 후 다시 시도해 주세요.",
  route_not_found: "요청한 기능을 찾을 수 없습니다.",
  network_unavailable:
    "서버에 연결할 수 없습니다. 네트워크와 서버 실행 상태를 확인해 주세요.",
  request_timeout: "응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
  malformed_response:
    "서버 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  internal_server_error:
    "요청 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
});

const CONTEXT_TITLES = Object.freeze({
  auth: "로그인 실패",
  chat: "답변 생성 실패",
  conversations: "대화 목록 조회 실패",
  messages: "대화 내용 조회 실패",
  monitoring: "모니터링 조회 실패",
  sms: "문자 발송 실패",
  network: "서버 연결 실패",
  session: "로그인 세션 만료",
});

const CONTEXT_MESSAGES = Object.freeze({
  auth: "로그인 요청을 처리하지 못했습니다. 입력 정보를 확인해 주세요.",
  chat: "답변을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  conversations:
    "대화 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.",
  messages:
    "대화 내용을 불러오지 못했습니다. 대화를 다시 선택해 주세요.",
  monitoring:
    "모니터링 데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.",
  sms: "문자 발송 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  network:
    "서버에 연결할 수 없습니다. 네트워크와 서버 실행 상태를 확인해 주세요.",
  session: "로그인 시간이 만료되었습니다. 다시 로그인해 주세요.",
});

const RETRYABLE_CODES = new Set([
  "network_unavailable",
  "request_timeout",
  "malformed_response",
  "monitoring_unavailable",
  "sms_rate_limited",
  "sms_unavailable",
  "database_unavailable",
  "chat_unavailable",
  "service_shutting_down",
  "internal_server_error",
  "provider_rate_limited",
  "provider_timeout",
  "provider_unavailable",
  "provider_request_failed",
]);

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function getResponseCode(data, status) {
  const rawCode =
    typeof data?.error === "string"
      ? data.error
      : typeof data?.error?.code === "string"
      ? data.error.code
      : data?.code;
  const normalized = normalizeCode(rawCode);

  if (normalized) return normalized;
  if (status === 401) return "invalid_token";
  if (status === 404) return "route_not_found";
  if (status === 408 || status === 504) return "request_timeout";
  if (status >= 500) return "internal_server_error";
  return "request_failed";
}

function getSafeMessage(code, data, status) {
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];

  const serverMessage =
    typeof data?.message === "string" ? data.message.trim() : "";

  // 4xx 검증 메시지는 서버가 입력 오류를 구체적으로 설명하도록 허용한다.
  // 5xx 원문은 내부 호스트명, SDK 오류, Stack 정보가 섞일 수 있어 노출하지 않는다.
  if (status >= 400 && status < 500 && serverMessage) {
    return serverMessage;
  }

  return status >= 500
    ? ERROR_MESSAGES.internal_server_error
    : "요청을 처리하지 못했습니다. 입력 내용을 확인해 주세요.";
}

export class ApiError extends Error {
  constructor(
    message,
    {
      code = "request_failed",
      status = 0,
      retryable = false,
      requestId = null,
      cause,
    } = {}
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = "ApiError";
    this.code = normalizeCode(code) || "request_failed";
    this.status = Number(status || 0);
    this.retryable = Boolean(retryable);
    this.requestId = requestId || null;
  }
}

export async function requestJson(
  input,
  {
    timeoutMs = 30000,
    signal,
    headers,
    ...fetchOptions
  } = {}
) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(signal?.reason);

  if (signal?.aborted) {
    abortFromParent();
  } else {
    signal?.addEventListener("abort", abortFromParent, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response;

  try {
    response = await fetch(input, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    const isAbort = error?.name === "AbortError";

    if (isAbort && !timedOut && signal?.aborted) {
      throw new ApiError("요청이 취소되었습니다.", {
        code: "request_cancelled",
        retryable: false,
        cause: error,
      });
    }

    const code = isAbort && timedOut
      ? "request_timeout"
      : "network_unavailable";

    throw new ApiError(ERROR_MESSAGES[code], {
      code,
      retryable: true,
      cause: error,
    });
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromParent);
  }

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new ApiError(ERROR_MESSAGES.malformed_response, {
        code: "malformed_response",
        status: response.status,
        retryable: true,
        cause: error,
      });
    }
  }

  if (!response.ok) {
    const code = getResponseCode(data, response.status);
    const isKnownCode = Object.prototype.hasOwnProperty.call(
      ERROR_MESSAGES,
      code
    );
    const retryable =
      typeof data?.retryable === "boolean"
        ? data.retryable
        : RETRYABLE_CODES.has(code) ||
          (!isKnownCode && response.status >= 500);

    throw new ApiError(getSafeMessage(code, data, response.status), {
      code,
      status: response.status,
      retryable,
      requestId: data?.requestId,
    });
  }

  return data;
}

export function toUserError(error, context = "request") {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(
          CONTEXT_MESSAGES[context] || ERROR_MESSAGES.internal_server_error,
          {
            code: "internal_server_error",
            retryable: true,
            cause: error,
          }
        );

  return {
    title: CONTEXT_TITLES[context] || "요청 실패",
    message:
      apiError.message ||
      CONTEXT_MESSAGES[context] ||
      ERROR_MESSAGES.internal_server_error,
    hint:
      apiError.code === "network_unavailable"
        ? "백엔드가 실행 중인지와 API 주소를 확인해 주세요."
        : apiError.code === "invalid_token" ||
          apiError.code === "auth_required"
        ? "보안을 위해 로그인 화면으로 이동했습니다."
        : "",
    code: apiError.code,
    status: apiError.status,
    retryable: apiError.retryable,
    requestId: apiError.requestId,
  };
}

export function createUserError(code, context, overrides = {}) {
  const normalizedCode = normalizeCode(code);
  const error = new ApiError(
    overrides.message ||
      ERROR_MESSAGES[normalizedCode] ||
      CONTEXT_MESSAGES[context] ||
      ERROR_MESSAGES.internal_server_error,
    {
      code: normalizedCode,
      status: overrides.status,
      retryable:
        typeof overrides.retryable === "boolean"
          ? overrides.retryable
          : RETRYABLE_CODES.has(normalizedCode),
      requestId: overrides.requestId,
    }
  );

  return {
    ...toUserError(error, context),
    ...overrides,
    code: normalizedCode,
  };
}

export { ERROR_MESSAGES };
