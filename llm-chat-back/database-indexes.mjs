export const REQUIRED_DATABASE_INDEXES = Object.freeze([
  Object.freeze({
    table: "conversations",
    name: "idx_conversations_user_updated_id",
    statement:
      "ALTER TABLE conversations ADD INDEX idx_conversations_user_updated_id (user_id, updated_at, id)",
  }),
  Object.freeze({
    table: "messages",
    name: "idx_messages_conversation_id",
    statement:
      "ALTER TABLE messages ADD INDEX idx_messages_conversation_id (conversation_id, id)",
  }),
]);

const DUPLICATE_INDEX_CODES = new Set(["ER_DUP_KEYNAME", "ER_DUP_INDEX"]);

export async function ensureDatabaseIndexes(
  query,
  databaseName,
  { onCreated = () => {} } = {}
) {
  const created = [];

  for (const index of REQUIRED_DATABASE_INDEXES) {
    const rows = await query(
      `
      SELECT 1 AS present
      FROM information_schema.statistics
      WHERE table_schema = ?
        AND table_name = ?
        AND index_name = ?
      LIMIT 1
      `,
      [databaseName, index.table, index.name]
    );

    if (rows.length > 0) continue;

    try {
      await query(index.statement);
      created.push(index.name);
      onCreated(index);
    } catch (error) {
      if (!DUPLICATE_INDEX_CODES.has(String(error?.code || ""))) {
        throw error;
      }
    }
  }

  return created;
}
