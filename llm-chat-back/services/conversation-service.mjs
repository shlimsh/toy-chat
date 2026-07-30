import crypto from "crypto";

import { query } from "../db.mjs";

function generateConversationId() {
  return `conv_${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 64);
}

function parseMetadata(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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
  const id = generateConversationId();

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
    SELECT id, conversation_id, role, content, metadata_json, created_at
    FROM messages
    WHERE id = ?
    LIMIT 1
    `,
    [result.insertId]
  );

  const row = rows[0] || null;
  return row
    ? { ...row, metadata: parseMetadata(row.metadata_json) }
    : null;
}

export async function getMessagesByConversationId(conversationId) {
  const rows = await query(
    `
    SELECT id, conversation_id, role, content, metadata_json, created_at
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC, id ASC
    `,
    [conversationId]
  );

  return rows.map((row) => ({
    ...row,
    metadata: parseMetadata(row.metadata_json),
  }));
}

export async function getConversationsByUserId(userId) {
  return query(
    `
    SELECT id, user_id, title, created_at, updated_at
    FROM conversations
    WHERE user_id = ?
    ORDER BY updated_at DESC, created_at DESC
    `,
    [userId]
  );
}
