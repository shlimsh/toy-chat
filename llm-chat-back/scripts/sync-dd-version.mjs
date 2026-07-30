import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.dirname(scriptDir);
const projectRoot = path.dirname(backendDir);
const frontendDir = path.join(projectRoot, "llm-chat");
const backendEnvPath = path.join(backendDir, ".env");
const frontendEnvPath = path.join(frontendDir, ".env.local");
const statePath = path.join(projectRoot, ".dd-version-state.json");
const lockPath = path.join(projectRoot, ".dd-version.lock");

const IGNORED_NAMES = new Set([
  ".env",
  ".env.local",
  ".dd-version-state.json",
  ".dd-version.lock",
  "node_modules",
  "dist",
  "coverage",
  "logs",
  "rag-cache.json",
]);
const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".html",
]);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return fs.openSync(lockPath, "wx");
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await wait(100);
    }
  }
  throw new Error("버전 동기화 잠금을 얻지 못했습니다. 잠시 후 다시 실행하세요.");
}

function sourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED_NAMES.has(entry.name) || entry.name.startsWith(".env")) continue;
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...sourceFiles(fullPath));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function sourceFingerprint() {
  const hash = crypto.createHash("sha256");
  const files = [
    ...sourceFiles(backendDir),
    ...sourceFiles(frontendDir),
  ].sort();

  for (const file of files) {
    hash.update(path.relative(projectRoot, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function envValue(content, name) {
  const match = content.match(new RegExp(`^${name}\\s*=\\s*(.+)$`, "m"));
  return match?.[1]?.trim() || "";
}

function parseVersion(value) {
  const match = String(value).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(
      `DD_VERSION은 major.minor.patch 형식이어야 합니다. 현재 값: ${value || "(없음)"}`
    );
  }
  return match.slice(1).map(Number);
}

function bumpPatch(version) {
  const [major, minor, patch] = parseVersion(version);
  return `${major}.${minor}.${patch + 1}`;
}

function setEnvValue(content, name, value) {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const expression = new RegExp(`^${name}\\s*=.*$`, "m");

  if (expression.test(content)) {
    return content.replace(expression, `${name}=${value}`);
  }

  const prefix = content && !content.endsWith("\n") ? newline : "";
  return `${content}${prefix}${name}=${value}${newline}`;
}

function writeAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function readState() {
  try {
    return JSON.parse(readText(statePath));
  } catch {
    return {};
  }
}

const lockHandle = await acquireLock();

try {
  const backendEnv = readText(backendEnvPath);
  if (!backendEnv) {
    throw new Error(
      "llm-chat-back/.env가 없습니다. 기존 .env를 유지한 상태에서 다시 실행하세요."
    );
  }

  const fingerprint = sourceFingerprint();
  const state = readState();
  const currentVersion = envValue(backendEnv, "DD_VERSION");
  parseVersion(currentVersion);

  const nextVersion =
    state.sourceFingerprint === fingerprint
      ? currentVersion
      : bumpPatch(currentVersion);

  writeAtomic(
    backendEnvPath,
    setEnvValue(backendEnv, "DD_VERSION", nextVersion)
  );
  writeAtomic(
    frontendEnvPath,
    setEnvValue(
      readText(frontendEnvPath),
      "VITE_DD_VERSION",
      nextVersion
    )
  );
  writeAtomic(
    statePath,
    `${JSON.stringify(
      {
        version: nextVersion,
        sourceFingerprint: fingerprint,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`
  );

  console.log(
    state.sourceFingerprint === fingerprint
      ? `[DD_VERSION] ${nextVersion} 유지`
      : `[DD_VERSION] ${currentVersion} → ${nextVersion}`
  );
} finally {
  fs.closeSync(lockHandle);
  fs.rmSync(lockPath, { force: true });
}

