import crypto from "crypto";
import { query } from "../db.mjs";
import { safeJsonParse } from "../lib/telemetry.mjs";
import {
  encodeConversationCursor,
  toSqlLimit,
} from "../pagination.mjs";

function generateId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 64);
}

function mapMessage(row) {
  if (!row) return null;

  return {
    ...row,
    metadata: row.metadata_json
      ? safeJsonParse(row.metadata_json, null)
      : null,
  };
}

export async function getUserByEmail(email) {
  const rows = await query(
    `
    SELECT id, email, password_hash, name, created_at, updated_at
    FROM users
    WHERE email = ?
    LIMIT 1
    `,
    [email]
  );

  return rows[0] || null;
}

export async function getUserById(userId) {
  const rows = await query(
    `
    SELECT id, email, name, created_at, updated_at
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
}

export async function createUser({ name, email, passwordHash }) {
  const result = await query(
    `
    INSERT INTO users (name, email, password_hash)
    VALUES (?, ?, ?)
    `,
    [name, email, passwordHash]
  );

  return getUserById(result.insertId);
}

export async function createConversation({ userId, title }) {
  const id = generateId("conv");

  await query(
    `
    INSERT INTO conversations (id, user_id, title)
    VALUES (?, ?, ?)
    `,
    [id, userId, title]
  );

  const rows = await query(
    `
    SELECT id, user_id, title, created_at, updated_at
    FROM conversations
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
}

export async function getConversationByIdForUser(conversationId, userId) {
  const rows = await query(
    `
    SELECT id, user_id, title, created_at, updated_at
    FROM conversations
    WHERE id = ? AND user_id = ?
    LIMIT 1
    `,
    [conversationId, userId]
  );

  return rows[0] || null;
}

async function updateConversationTimestamp(conversationId) {
  await query(
    `
    UPDATE conversations
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    [conversationId]
  );
}

export async function createMessage({
  conversationId,
  role,
  content,
  metadata = null,
}) {
  const result = await query(
    `
    INSERT INTO messages (
      conversation_id,
      role,
      content,
      metadata_json
    )
    VALUES (?, ?, ?, ?)
    `,
    [
      conversationId,
      role,
      content,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );

  await updateConversationTimestamp(conversationId);

  const rows = await query(
    `
    SELECT
      id,
      conversation_id,
      role,
      content,
      metadata_json,
      created_at
    FROM messages
    WHERE id = ?
    LIMIT 1
    `,
    [result.insertId]
  );

  return mapMessage(rows[0]);
}

export async function getConversationPageByUserId({
  userId,
  cursor = null,
  limit,
  executeQuery = query,
}) {
  const safeLimit = toSqlLimit(limit, { min: 1, max: 100 });

  // 대화 목록은 MySQL/MariaDB 버전별 prepared statement 및 LIMIT/Cursor
  // 처리 차이를 피하기 위해 검증된 단순 조회만 DB에서 수행한다.
  // toy-chat 규모에서는 사용자별 목록을 정렬해 가져온 뒤 애플리케이션에서
  // Cursor를 적용하는 편이 호환성과 안정성 측면에서 더 안전하다.
  const rows = await executeQuery(
    `
    SELECT id, user_id, title, created_at, updated_at
    FROM conversations
    WHERE user_id = ?
    ORDER BY updated_at DESC, id DESC
    `,
    [userId]
  );

  const cursorRows = cursor
    ? rows.filter((row) => {
        const updatedAt = String(row.updated_at ?? "");
        const id = String(row.id ?? "");

        return (
          updatedAt < cursor.updatedAt ||
          (updatedAt === cursor.updatedAt && id < cursor.id)
        );
      })
    : rows;
  const conversations = cursorRows.slice(0, safeLimit);
  const hasMore = cursorRows.length > safeLimit;
  const last = conversations.at(-1);

  return {
    conversations,
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeConversationCursor({
              updatedAt: last.updated_at,
              id: last.id,
            })
          : null,
    },
  };
}

export async function getMessagePageByConversationId({
  conversationId,
  beforeId = null,
  limit,
}) {
  const safeLimit = toSqlLimit(limit, { min: 1, max: 200 });
  const fetchLimit = safeLimit + 1;
  const cursorClause = beforeId ? "AND id < ?" : "";
  const params = beforeId ? [conversationId, beforeId] : [conversationId];

  const rows = await query(
    `
    SELECT
      id,
      conversation_id,
      role,
      content,
      metadata_json,
      created_at
    FROM messages
    WHERE conversation_id = ?
      ${cursorClause}
    ORDER BY id DESC
    LIMIT ${fetchLimit}
    `,
    params
  );
  const hasMore = rows.length > safeLimit;
  const pageRows = rows.slice(0, safeLimit);
  const oldest = pageRows.at(-1);

  return {
    messages: pageRows.reverse().map(mapMessage),
    pageInfo: {
      hasMore,
      nextCursor: hasMore && oldest ? String(oldest.id) : null,
    },
  };
}

export async function getRecentMessagesByConversationId(
  conversationId,
  limit
) {
  const safeLimit = toSqlLimit(limit, { min: 1, max: 200 });
  const fetchLimit = Math.min(safeLimit * 2, 400);
  const rows = await query(
    `
    SELECT
      id,
      conversation_id,
      role,
      content,
      metadata_json,
      created_at
    FROM messages
    WHERE conversation_id = ?
    ORDER BY id DESC
    LIMIT ${fetchLimit}
    `,
    [conversationId]
  );

  return rows
    .map(mapMessage)
    .filter((message) => {
      if (message.role === "user") return true;
      if (message.role !== "assistant") return false;
      return String(message.metadata?.status || "success").toLowerCase() !== "failed";
    })
    .slice(0, safeLimit)
    .reverse();
}
