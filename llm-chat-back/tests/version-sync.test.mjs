import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const scriptSource = path.resolve(
  testDir,
  "../scripts/sync-dd-version.mjs"
);

function value(content, name) {
  return content.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1];
}

test("소스가 바뀔 때만 patch 버전을 한 번 증가시키고 양쪽을 동기화한다", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "toy-chat-version-"));
  const back = path.join(root, "llm-chat-back");
  const front = path.join(root, "llm-chat");
  const scripts = path.join(back, "scripts");
  fs.mkdirSync(scripts, { recursive: true });
  fs.mkdirSync(path.join(back, "src"), { recursive: true });
  fs.mkdirSync(path.join(front, "src"), { recursive: true });
  fs.copyFileSync(scriptSource, path.join(scripts, "sync-dd-version.mjs"));
  fs.writeFileSync(path.join(back, ".env"), "DD_VERSION=1.2.3\n");
  fs.writeFileSync(path.join(back, "src", "app.mjs"), "export const a = 1;\n");
  fs.writeFileSync(path.join(front, "src", "App.jsx"), "export default 1;\n");

  const script = path.join(scripts, "sync-dd-version.mjs");
  execFileSync(process.execPath, [script]);
  assert.equal(value(fs.readFileSync(path.join(back, ".env"), "utf8"), "DD_VERSION"), "1.2.4");
  assert.equal(
    value(fs.readFileSync(path.join(front, ".env.local"), "utf8"), "VITE_DD_VERSION"),
    "1.2.4"
  );

  execFileSync(process.execPath, [script]);
  assert.equal(value(fs.readFileSync(path.join(back, ".env"), "utf8"), "DD_VERSION"), "1.2.4");

  fs.writeFileSync(path.join(front, "src", "App.jsx"), "export default 2;\n");
  execFileSync(process.execPath, [script]);
  assert.equal(value(fs.readFileSync(path.join(back, ".env"), "utf8"), "DD_VERSION"), "1.2.5");

  fs.rmSync(root, { recursive: true, force: true });
});

