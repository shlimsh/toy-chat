import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const backendEnvPath = path.join(projectRoot, "llm-chat-back", ".env");
const frontendEnvPath = path.join(projectRoot, "llm-chat", ".env.local");

function readText(filePath, { required = false } = {}) {
  if (!fs.existsSync(filePath)) {
    if (required) {
      throw new Error(
        `${filePath} 파일이 없습니다. 기존 백엔드 .env 파일을 먼저 배치해 주세요.`
      );
    }
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function getEnvValue(text, key) {
  const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match?.[1]?.trim() || "";
}

function setEnvValue(text, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const normalized = text.replace(/\r\n/g, "\n").trimEnd();
  return `${pattern.test(normalized)
    ? normalized.replace(pattern, line)
    : `${normalized}${normalized ? "\n" : ""}${line}`
  }\n`;
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "logs" ||
        entry.name === "data" ||
        entry.name.startsWith(".env")
      ) {
        return [];
      }

      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return walkFiles(fullPath);
      return /\.(mjs|js|jsx|json|css)$/.test(entry.name) ? [fullPath] : [];
    });
}

function buildSourceHash() {
  const files = [
    ...walkFiles(path.join(projectRoot, "llm-chat-back")),
    ...walkFiles(path.join(projectRoot, "llm-chat", "src")),
    ...walkFiles(path.join(projectRoot, "scripts")),
  ].sort();
  const hash = crypto.createHash("sha256");

  for (const filePath of files) {
    hash.update(path.relative(projectRoot, filePath));
    hash.update(fs.readFileSync(filePath));
  }

  return hash.digest("hex");
}

function incrementPatch(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(
      `DD_VERSION=${version} 형식이 올바르지 않습니다. 예: 0.2.5`
    );
  }

  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

const backendEnv = readText(backendEnvPath, { required: true });
const currentVersion = getEnvValue(backendEnv, "DD_VERSION");
const previousHash = getEnvValue(backendEnv, "DD_VERSION_SOURCE_HASH");
const sourceHash = buildSourceHash();
const nextVersion =
  previousHash === sourceHash ? currentVersion : incrementPatch(currentVersion);

let nextBackendEnv = setEnvValue(backendEnv, "DD_VERSION", nextVersion);
nextBackendEnv = setEnvValue(
  nextBackendEnv,
  "DD_VERSION_SOURCE_HASH",
  sourceHash
);

let frontendEnv = readText(frontendEnvPath);
frontendEnv = setEnvValue(frontendEnv, "VITE_DD_VERSION", nextVersion);

fs.writeFileSync(backendEnvPath, nextBackendEnv, "utf8");
fs.writeFileSync(frontendEnvPath, frontendEnv, "utf8");

const action = previousHash === sourceHash ? "유지" : "자동 증가";
console.log(`[DD_VERSION] ${nextVersion} (${action})`);
