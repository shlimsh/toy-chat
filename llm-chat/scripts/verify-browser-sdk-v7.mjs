import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const currentFile = fileURLToPath(import.meta.url);

const REMOVED_OPTIONS = [
  "betaEncodeCookieOptions",
  "allowFallbackToLocalStorage",
  "trackBfcacheViews",
  "trackEarlyRequests",
  "betaTrackActionsInShadowDom",
  "usePciIntake",
];

const SOURCE_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
  ".vue",
  ".svelte",
]);

async function collectSourceFiles(directory) {
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["dist", "node_modules"].includes(entry.name)) continue;

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
    } else if (entryPath === currentFile) {
      continue;
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

async function main() {
  const packageJson = JSON.parse(
    await readFile(path.join(projectRoot, "package.json"), "utf8")
  );
  const datadogPackages = [
    "@datadog/browser-rum",
    "@datadog/browser-logs",
    "@datadog/browser-rum-react",
  ];
  const versions = datadogPackages.map(
    (name) => packageJson.dependencies?.[name]
  );

  for (const [index, version] of versions.entries()) {
    assert.match(
      String(version || ""),
      /^7\.\d+\.\d+$/,
      `${datadogPackages[index]}은(는) 정확한 v7 버전으로 고정해야 합니다.`
    );
  }

  assert.equal(
    new Set(versions).size,
    1,
    "RUM, Logs, React 통합 패키지 버전은 서로 같아야 합니다."
  );

  const sourceFiles = await collectSourceFiles(projectRoot);
  const violations = [];
  const capturedDurationVitals = [];

  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    const relative = path.relative(projectRoot, file);

    for (const option of REMOVED_OPTIONS) {
      if (source.includes(option)) violations.push(`${relative}: ${option}`);
    }

    if (/datadoghq-browser-agent\.com.*\/v6\//.test(source)) {
      violations.push(`${relative}: Browser SDK v6 CDN URL`);
    }

    if (
      /\b(?:const|let|var)\s+\w+\s*=\s*[^;\n]*startDurationVital\s*\(/.test(
        source
      )
    ) {
      capturedDurationVitals.push(relative);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `v7에서 제거된 설정 또는 v6 CDN 참조가 남아 있습니다:\n${violations.join(
      "\n"
    )}`
  );
  assert.deepEqual(
    capturedDurationVitals,
    [],
    `v7에서 void를 반환하는 startDurationVital 결과를 저장하고 있습니다:\n${capturedDurationVitals.join(
      "\n"
    )}`
  );

  const observability = await readFile(
    path.join(projectRoot, "src/lib/observability.js"),
    "utf8"
  );

  assert.match(
    observability,
    /defaultPrivacyLevel:\s*"mask-user-input"/,
    "v7 개인정보 보호 수준을 명시적으로 고정해야 합니다."
  );
  assert.match(
    observability,
    /enablePrivacyForActionName:\s*true/,
    "v7 Action 이름 개인정보 보호 정책을 명시해야 합니다."
  );
  assert.match(
    observability,
    /propagateTraceBaggage:\s*false/,
    "외부 API CORS 검증 전까지 v6와 같은 baggage 전파 정책을 유지해야 합니다."
  );
  assert.match(
    observability,
    /forwardErrorsToLogs:\s*true/,
    "처리되지 않은 오류와 네트워크 오류 전달을 유지해야 합니다."
  );
  assert.match(
    observability,
    /forwardConsoleLogs:\s*\[[^\]]*"error"/s,
    "v6에서 수집되던 console.error를 v7에서도 명시적으로 유지해야 합니다."
  );

  console.log(
    `Browser SDK v7 migration verified (${versions[0]}, ${sourceFiles.length} source files).`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
