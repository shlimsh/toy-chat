import assert from "node:assert/strict";
import test from "node:test";

import {
  REQUIRED_DATABASE_INDEXES,
  ensureDatabaseIndexes,
} from "../database-indexes.mjs";

test("기존 DB에 없는 페이지네이션 인덱스만 생성한다", async () => {
  const statements = [];
  let lookupCount = 0;

  const query = async (sql, params = []) => {
    statements.push({ sql: sql.trim(), params });

    if (/information_schema\.statistics/i.test(sql)) {
      lookupCount += 1;
      return lookupCount === 1 ? [{ present: 1 }] : [];
    }

    return [];
  };

  const created = await ensureDatabaseIndexes(query, "toy_chat");

  assert.equal(
    statements.filter((item) =>
      /information_schema\.statistics/i.test(item.sql)
    ).length,
    REQUIRED_DATABASE_INDEXES.length
  );
  assert.deepEqual(created, ["idx_messages_conversation_id"]);
  assert.ok(
    statements.some((item) =>
      item.sql.includes(
        "ADD INDEX idx_messages_conversation_id (conversation_id, id)"
      )
    )
  );
});

test("동시 기동으로 이미 생성된 인덱스 오류는 무시한다", async () => {
  const query = async (sql) => {
    if (/information_schema\.statistics/i.test(sql)) return [];
    const error = new Error("duplicate index");
    error.code = "ER_DUP_KEYNAME";
    throw error;
  };

  const created = await ensureDatabaseIndexes(query, "toy_chat");
  assert.deepEqual(created, []);
});
