const CONVERSATION_CURSOR_MAX_LENGTH = 512;
const CONVERSATION_ID_MAX_LENGTH = 64;

export class PaginationInputError extends Error {
  constructor(message, code = "invalid_pagination_cursor") {
    super(message);
    this.name = "PaginationInputError";
    this.code = code;
  }
}

export function toSqlLimit(value, { min = 1, max = 200 } = {}) {
  const normalized = Number(value);

  if (
    !Number.isSafeInteger(normalized) ||
    normalized < min ||
    normalized > max
  ) {
    throw new TypeError(`SQL LIMIT must be an integer between ${min} and ${max}`);
  }

  return normalized;
}

export function validateConversationId(value) {
  const normalized = String(value ?? "").trim();

  if (
    !normalized ||
    normalized.length > CONVERSATION_ID_MAX_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(normalized)
  ) {
    throw new PaginationInputError(
      "대화 ID 형식이 올바르지 않습니다.",
      "invalid_conversation_id"
    );
  }

  return normalized;
}

export function encodeConversationCursor({ updatedAt, id }) {
  const payload = JSON.stringify({
    updatedAt: String(updatedAt ?? ""),
    id: validateConversationId(id),
  });

  return Buffer.from(payload, "utf8").toString("base64url");
}

export function parseConversationCursor(value) {
  if (value === undefined || value === null || value === "") return null;

  const encoded = String(value).trim();
  if (!encoded || encoded.length > CONVERSATION_CURSOR_MAX_LENGTH) {
    throw new PaginationInputError("대화 목록 Cursor가 올바르지 않습니다.");
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );
    const updatedAt = String(decoded?.updatedAt ?? "").trim();
    const id = validateConversationId(decoded?.id);

    if (
      !updatedAt ||
      updatedAt.length > 64 ||
      Number.isNaN(Date.parse(updatedAt.replace(" ", "T")))
    ) {
      throw new Error("invalid updatedAt");
    }

    return { updatedAt, id };
  } catch (error) {
    if (error instanceof PaginationInputError) throw error;
    throw new PaginationInputError("대화 목록 Cursor가 올바르지 않습니다.");
  }
}

export function parseMessageCursor(value) {
  if (value === undefined || value === null || value === "") return null;

  const normalized = String(value).trim();
  if (!/^[1-9]\d{0,18}$/.test(normalized)) {
    throw new PaginationInputError("메시지 Cursor가 올바르지 않습니다.");
  }

  const cursor = Number(normalized);
  if (!Number.isSafeInteger(cursor) || cursor < 1) {
    throw new PaginationInputError("메시지 Cursor가 올바르지 않습니다.");
  }

  return cursor;
}
