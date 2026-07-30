import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeState } from "../runtime-state.mjs";

test("RAG가 Degraded여도 필수 의존성인 DB가 준비되면 ready 상태가 된다", () => {
  const state = createRuntimeState();
  assert.equal(state.ready, false);
  state.databaseReady = true;
  assert.equal(state.ready, true);
  state.ragReady = false;
  state.ragStatus = "degraded";
  state.ragMode = "keyword";
  assert.equal(state.ready, true);
  state.shuttingDown = true;
  assert.equal(state.ready, false);
});
