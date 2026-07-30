import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeState } from "../runtime-state.mjs";

test("DB와 RAG가 모두 준비되어야 ready 상태가 된다", () => {
  const state = createRuntimeState();
  assert.equal(state.ready, false);
  state.databaseReady = true;
  assert.equal(state.ready, false);
  state.ragReady = true;
  assert.equal(state.ready, true);
  state.shuttingDown = true;
  assert.equal(state.ready, false);
});
