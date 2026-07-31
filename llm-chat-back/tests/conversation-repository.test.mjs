import assert from "node:assert/strict";
import test from "node:test";

Object.assign(process.env, {
  DD_VERSION: "0.2.4",
  JWT_SECRET: "test-secret-that-is-long-enough",
  MYSQL_DATABASE: "toy_chat",
  MYSQL_HOST: "127.0.0.1",
  MYSQL_USER: "toy_chat_user",
  OPENAI_API_KEY: "test-openai-key",
});

const { parseConversationCursor } = await import("../pagination.mjs");
const { getConversationPageByUserId } = await import(
  "../repositories/chat-repository.mjs"
);

const rows = [
  {
    id: "conv_3",
    user_id: 1,
    title: "세 번째 대화",
    created_at: "2026-07-30 15:00:00",
    updated_at: "2026-07-30 15:00:00",
  },
  {
    id: "conv_2",
    user_id: 1,
    title: "두 번째 대화",
    created_at: "2026-07-30 14:00:00",
    updated_at: "2026-07-30 14:00:00",
  },
  {
    id: "conv_1",
    user_id: 1,
    title: "첫 번째 대화",
    created_at: "2026-07-30 13:00:00",
    updated_at: "2026-07-30 13:00:00",
  },
];

test("conversation pagination avoids DB LIMIT and applies cursor in application", async () => {
  const calls = [];
  const executeQuery = async (sql, params) => {
    calls.push({ sql, params });
    return rows;
  };

  const firstPage = await getConversationPageByUserId({
    userId: 1,
    limit: 2,
    executeQuery,
  });

  assert.deepEqual(
    firstPage.conversations.map((conversation) => conversation.id),
    ["conv_3", "conv_2"]
  );
  assert.equal(firstPage.pageInfo.hasMore, true);
  assert.ok(firstPage.pageInfo.nextCursor);
  assert.doesNotMatch(calls[0].sql, /\bLIMIT\b/i);
  assert.deepEqual(calls[0].params, [1]);

  const secondPage = await getConversationPageByUserId({
    userId: 1,
    cursor: parseConversationCursor(firstPage.pageInfo.nextCursor),
    limit: 2,
    executeQuery,
  });

  assert.deepEqual(
    secondPage.conversations.map((conversation) => conversation.id),
    ["conv_1"]
  );
  assert.equal(secondPage.pageInfo.hasMore, false);
  assert.equal(secondPage.pageInfo.nextCursor, null);
});
