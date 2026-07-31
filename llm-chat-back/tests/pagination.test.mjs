import assert from "node:assert/strict";
import test from "node:test";

import {
  PaginationInputError,
  encodeConversationCursor,
  parseConversationCursor,
  parseMessageCursor,
  toSqlLimit,
  validateConversationId,
} from "../pagination.mjs";

test("conversation cursor round-trip preserves updated_at and id", () => {
  const cursor = encodeConversationCursor({
    updatedAt: "2026-07-30 14:20:00",
    id: "conv_abc123",
  });

  assert.deepEqual(parseConversationCursor(cursor), {
    updatedAt: "2026-07-30 14:20:00",
    id: "conv_abc123",
  });
});

test("invalid cursors and overlong conversation ids are rejected", () => {
  assert.throws(
    () => parseConversationCursor("not-a-valid-cursor"),
    PaginationInputError
  );
  assert.throws(() => parseMessageCursor("1 OR 1=1"), PaginationInputError);
  assert.throws(
    () => validateConversationId(`conv_${"a".repeat(80)}`),
    PaginationInputError
  );
});

test("SQL limit accepts only bounded safe integers", () => {
  assert.equal(toSqlLimit(50), 50);
  assert.throws(() => toSqlLimit(0), TypeError);
  assert.throws(() => toSqlLimit(201), TypeError);
  assert.throws(() => toSqlLimit("not-a-number"), TypeError);
});
