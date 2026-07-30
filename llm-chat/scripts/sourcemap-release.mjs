import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const defaultProjectRoot = path.dirname(scriptDir);

function parseEnv(content) {
  const values = {};

  for (const rawLine of String(content || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    values[name] = value;
  }

  return values;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return parseEnv(fs.readFileSync(filePath, "utf8"));
}

function loadFrontendEnv(projectRoot) {
  const files = [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
  ];
  const values = {};

  for (const file of files) {
    Object.assign(values, readEnvFile(path.join(projectRoot, file)));
  }

  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith("VITE_") && value !== undefined) {
      values[name] = value;
    }
  }

  return values;
}

function required(name, value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${name} 설정이 없습니다.`);
  }
  return normalized;
}

export function normalizeMinifiedPathPrefix(value) {
  const normalized = required("VITE_DD_MINIFIED_PATH_PREFIX", value).replace(
    /\/+$/,
    ""
  );
  let url;

  try {
    url = new URL(normalized);
  } catch {
    throw new Error(
      `VITE_DD_MINIFIED_PATH_PREFIX는 http(s) URL이어야 합니다: ${normalized}`
    );
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(
      `VITE_DD_MINIFIED_PATH_PREFIX는 http(s) URL이어야 합니다: ${normalized}`
    );
  }
  if (url.search || url.hash) {
    throw new Error(
      "VITE_DD_MINIFIED_PATH_PREFIX에는 query string이나 hash를 넣을 수 없습니다."
    );
  }

  return normalized;
}

export function loadReleaseConfig(projectRoot = defaultProjectRoot) {
  const frontendEnv = loadFrontendEnv(projectRoot);
  const backendEnv = readEnvFile(
    path.resolve(projectRoot, "..", "llm-chat-back", ".env")
  );
  const service = String(
    frontendEnv.VITE_DD_SERVICE || "shlim-toy-chat-front"
  ).trim();
  const version = required("VITE_DD_VERSION", frontendEnv.VITE_DD_VERSION);

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `VITE_DD_VERSION은 major.minor.patch 형식이어야 합니다: ${version}`
    );
  }

  return Object.freeze({
    projectRoot,
    assetsDirectory: path.join(projectRoot, "dist", "assets"),
    indexPath: path.join(projectRoot, "dist", "index.html"),
    service,
    version,
    site: String(
      process.env.DATADOG_SITE ||
        process.env.DD_SITE ||
        frontendEnv.VITE_DD_SITE ||
        backendEnv.DD_SITE ||
        "datadoghq.com"
    ).trim(),
    minifiedPathPrefix: normalizeMinifiedPathPrefix(
      frontendEnv.VITE_DD_MINIFIED_PATH_PREFIX ||
        "http://localhost:5173/assets"
    ),
    projectPath: String(
      frontendEnv.VITE_DD_PROJECT_PATH || "llm-chat"
    ).trim(),
    apiKey: String(
      process.env.DATADOG_API_KEY ||
        process.env.DD_API_KEY ||
        backendEnv.DD_API_KEY ||
        ""
    ).trim(),
  });
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function relativeUnix(from, target) {
  return path.relative(from, target).replaceAll("\\", "/");
}

export function verifySourceMaps(config) {
  if (!fs.existsSync(config.indexPath)) {
    throw new Error("dist/index.html이 없습니다. 먼저 npm run build를 실행하세요.");
  }
  if (!fs.existsSync(config.assetsDirectory)) {
    throw new Error("dist/assets가 없습니다. 먼저 npm run build를 실행하세요.");
  }

  const files = walkFiles(config.assetsDirectory);
  const javascriptFiles = files.filter(
    (file) => file.endsWith(".js") && !file.endsWith(".js.map")
  );
  const sourceMapFiles = files.filter((file) => file.endsWith(".js.map"));

  if (javascriptFiles.length === 0) {
    throw new Error("업로드할 JavaScript 번들이 없습니다.");
  }

  const sourceMapsByBundle = new Map(
    sourceMapFiles.map((file) => [file.slice(0, -4), file])
  );
  const firstPartySources = new Set();

  for (const javascriptPath of javascriptFiles) {
    const sourceMapPath = sourceMapsByBundle.get(javascriptPath);
    const bundleName = relativeUnix(config.assetsDirectory, javascriptPath);

    if (!sourceMapPath) {
      throw new Error(`${bundleName}에 대응하는 .map 파일이 없습니다.`);
    }

    const javascript = fs.readFileSync(javascriptPath, "utf8");
    if (/\/\/[#@]\s*sourceMappingURL=/.test(javascript)) {
      throw new Error(
        `${bundleName}에 sourceMappingURL이 노출되어 있습니다. hidden source map이어야 합니다.`
      );
    }

    let sourceMap;
    try {
      sourceMap = JSON.parse(fs.readFileSync(sourceMapPath, "utf8"));
    } catch {
      throw new Error(`${bundleName}.map이 올바른 JSON이 아닙니다.`);
    }

    if (sourceMap.version !== 3) {
      throw new Error(`${bundleName}.map의 Source Map 버전이 3이 아닙니다.`);
    }
    if (sourceMap.file !== path.basename(javascriptPath)) {
      throw new Error(
        `${bundleName}.map의 file 값(${sourceMap.file || "없음"})이 번들과 일치하지 않습니다.`
      );
    }
    if (
      !Array.isArray(sourceMap.sources) ||
      !Array.isArray(sourceMap.sourcesContent) ||
      sourceMap.sources.length !== sourceMap.sourcesContent.length
    ) {
      throw new Error(
        `${bundleName}.map에 sources와 sourcesContent가 완전하게 포함되지 않았습니다.`
      );
    }

    for (const source of sourceMap.sources) {
      const normalizedSource = String(source).replaceAll("\\", "/");
      if (normalizedSource.includes("/src/")) {
        firstPartySources.add(normalizedSource);
      }
    }
  }

  const indexHtml = fs.readFileSync(config.indexPath, "utf8");
  const entryScripts = [
    ...indexHtml.matchAll(
      /<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*>/gi
    ),
  ].map((match) => match[1]);

  if (entryScripts.length === 0) {
    throw new Error("dist/index.html에서 JavaScript 진입 파일을 찾지 못했습니다.");
  }

  for (const entryScript of entryScripts) {
    const assetName = entryScript.split("/assets/").at(-1);
    if (
      !assetName ||
      !fs.existsSync(path.join(config.assetsDirectory, assetName))
    ) {
      throw new Error(
        `index.html의 진입 파일이 dist/assets에 없습니다: ${entryScript}`
      );
    }
  }

  if (
    ![...firstPartySources].some((source) =>
      /\/src\/(App|main|ErrorBoundary)\.(jsx|js)$/.test(source)
    )
  ) {
    throw new Error(
      "App.jsx, main.jsx 또는 ErrorBoundary.jsx가 Source Map에 포함되지 않았습니다."
    );
  }

  return Object.freeze({
    bundleCount: javascriptFiles.length,
    sourceMapCount: sourceMapFiles.length,
    firstPartySourceCount: firstPartySources.size,
    entryScripts,
  });
}

export function createUploadArguments(config, options = {}) {
  const args = [
    "sourcemaps",
    "upload",
    "./dist/assets",
    "--service",
    config.service,
    "--release-version",
    config.version,
    "--minified-path-prefix",
    config.minifiedPathPrefix,
  ];

  if (config.projectPath) {
    args.push("--project-path", config.projectPath);
  }
  if (options.dryRun) {
    args.push("--dry-run");
  }

  return args;
}

export function uploadSourceMaps(config, options = {}) {
  const verification = verifySourceMaps(config);
  if (!config.apiKey) {
    throw new Error(
      "DD_API_KEY가 없습니다. llm-chat-back/.env 또는 현재 터미널 환경변수를 확인하세요."
    );
  }

  const cliPath = path.join(
    config.projectRoot,
    "node_modules",
    "@datadog",
    "datadog-ci",
    "dist",
    "bundle.js"
  );
  if (!fs.existsSync(cliPath)) {
    throw new Error(
      "@datadog/datadog-ci가 없습니다. llm-chat에서 npm install을 실행하세요."
    );
  }

  const result = spawnSync(
    process.execPath,
    [cliPath, ...createUploadArguments(config, options)],
    {
      cwd: config.projectRoot,
      env: {
        ...process.env,
        DATADOG_API_KEY: config.apiKey,
        DD_API_KEY: config.apiKey,
        DATADOG_SITE: config.site,
        DD_SITE: config.site,
      },
      encoding: "utf8",
      stdio: "inherit",
    }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Datadog Source Map 업로드가 실패했습니다. exit=${result.status}`);
  }

  return verification;
}

export function cleanSourceMaps(config) {
  const sourceMapFiles = walkFiles(config.assetsDirectory).filter((file) =>
    file.endsWith(".js.map")
  );

  for (const file of sourceMapFiles) {
    fs.unlinkSync(file);
  }

  return sourceMapFiles.length;
}

function printPlan(config) {
  const command = createUploadArguments(config)
    .map((value) => (value.includes(" ") ? JSON.stringify(value) : value))
    .join(" ");

  console.log("[Source Maps] Release plan");
  console.log(`- service: ${config.service}`);
  console.log(`- version: ${config.version}`);
  console.log(`- site: ${config.site}`);
  console.log(`- minified path prefix: ${config.minifiedPathPrefix}`);
  console.log(`- command: datadog-ci ${command}`);
  console.log(`- API key: ${config.apiKey ? "configured" : "missing"}`);
}

async function main() {
  const command = process.argv[2] || "plan";
  const config = loadReleaseConfig();

  if (command === "plan") {
    printPlan(config);
    return;
  }

  if (command === "verify") {
    const result = verifySourceMaps(config);
    console.log(
      `[Source Maps] 검증 통과: bundle=${result.bundleCount}, map=${result.sourceMapCount}, first-party sources=${result.firstPartySourceCount}`
    );
    console.log(
      `[Source Maps] match: service=${config.service}, version=${config.version}, prefix=${config.minifiedPathPrefix}`
    );
    return;
  }

  if (command === "upload") {
    const result = uploadSourceMaps(config);
    console.log(
      `[Source Maps] 업로드 완료: service=${config.service}, version=${config.version}, files=${result.sourceMapCount}`
    );
    return;
  }

  if (command === "clean") {
    const count = cleanSourceMaps(config);
    console.log(`[Source Maps] 배포본에서 .map ${count}개 제거`);
    return;
  }

  throw new Error(`지원하지 않는 명령입니다: ${command}`);
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  main().catch((error) => {
    console.error(`[Source Maps] ${error.message}`);
    process.exitCode = 1;
  });
}

