import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  incrementPatch,
  readEnvValue,
  syncDatadogVersion,
} from "../scripts/sync-dd-version.mjs";

test("patch 버전을 올린다", () => {
  assert.equal(incrementPatch("0.2.9"), "0.2.10");
});

test("소스가 바뀐 경우에만 DD_VERSION과 RUM 버전을 함께 올린다", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "toy-chat-version-"));
  const backendRoot = path.join(tempRoot, "llm-chat-back");
  const frontendRoot = path.join(tempRoot, "llm-chat");

  try {
    await fs.mkdir(path.join(backendRoot, "scripts"), { recursive: true });
    await fs.mkdir(path.join(frontendRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(backendRoot, ".env"),
      "DD_SERVICE=shlim-toy-chat-api\nDD_VERSION=0.2.0\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(backendRoot, "index.mjs"),
      "export const backend = true;\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(frontendRoot, "src", "App.jsx"),
      "export default function App() { return null; }\n",
      "utf8"
    );

    const first = await syncDatadogVersion({ backendRoot, frontendRoot });
    const second = await syncDatadogVersion({ backendRoot, frontendRoot });

    assert.equal(first.version, "0.2.1");
    assert.equal(first.changed, true);
    assert.equal(second.version, "0.2.1");
    assert.equal(second.changed, false);

    await fs.appendFile(
      path.join(frontendRoot, "src", "App.jsx"),
      "// source changed\n",
      "utf8"
    );

    const third = await syncDatadogVersion({ backendRoot, frontendRoot });
    const backendEnv = await fs.readFile(
      path.join(backendRoot, ".env"),
      "utf8"
    );
    const frontendEnv = await fs.readFile(
      path.join(frontendRoot, ".env.local"),
      "utf8"
    );

    assert.equal(third.version, "0.2.2");
    assert.equal(readEnvValue(backendEnv, "DD_VERSION"), "0.2.2");
    assert.equal(readEnvValue(frontendEnv, "VITE_DD_VERSION"), "0.2.2");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
