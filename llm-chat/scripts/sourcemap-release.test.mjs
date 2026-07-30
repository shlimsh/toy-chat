import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanSourceMaps,
  createUploadArguments,
  normalizeMinifiedPathPrefix,
  verifySourceMaps,
} from "./sourcemap-release.mjs";

const temporaryDirectories = [];

function createFixture({
  includeMap = true,
  exposeSourceMapUrl = false,
} = {}) {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".sourcemap-test-"));
  temporaryDirectories.push(root);
  const assetsDirectory = path.join(root, "dist", "assets");
  fs.mkdirSync(assetsDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(root, "dist", "index.html"),
    '<script type="module" src="/assets/app-123.js"></script>',
    "utf8"
  );
  fs.writeFileSync(
    path.join(assetsDirectory, "app-123.js"),
    `throw new Error("boom");${
      exposeSourceMapUrl ? "\n//# sourceMappingURL=app-123.js.map" : ""
    }`,
    "utf8"
  );

  if (includeMap) {
    fs.writeFileSync(
      path.join(assetsDirectory, "app-123.js.map"),
      JSON.stringify({
        version: 3,
        file: "app-123.js",
        names: [],
        mappings: "AAAA",
        sources: ["../../src/App.jsx"],
        sourcesContent: ['throw new Error("boom");'],
      }),
      "utf8"
    );
  }

  return {
    projectRoot: root,
    assetsDirectory,
    indexPath: path.join(root, "dist", "index.html"),
    service: "shlim-toy-chat-front",
    version: "0.2.7",
    minifiedPathPrefix: "http://localhost:5173/assets",
    projectPath: "llm-chat",
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Source Map release validation", () => {
  it("normalizes the minified asset URL", () => {
    expect(
      normalizeMinifiedPathPrefix("http://localhost:5173/assets///")
    ).toBe("http://localhost:5173/assets");
  });

  it("rejects non-http asset prefixes", () => {
    expect(() => normalizeMinifiedPathPrefix("file:///dist/assets")).toThrow(
      "http(s) URL"
    );
  });

  it("verifies a hidden source map containing App.jsx", () => {
    const result = verifySourceMaps(createFixture());
    expect(result.bundleCount).toBe(1);
    expect(result.sourceMapCount).toBe(1);
    expect(result.firstPartySourceCount).toBe(1);
  });

  it("fails when a JavaScript bundle has no map", () => {
    expect(() =>
      verifySourceMaps(createFixture({ includeMap: false }))
    ).toThrow("대응하는 .map 파일");
  });

  it("fails when a hidden source map is publicly referenced", () => {
    expect(() =>
      verifySourceMaps(createFixture({ exposeSourceMapUrl: true }))
    ).toThrow("sourceMappingURL이 노출");
  });

  it("creates an upload command from the RUM service and version", () => {
    const args = createUploadArguments(createFixture());
    expect(args).toEqual([
      "sourcemaps",
      "upload",
      "./dist/assets",
      "--service",
      "shlim-toy-chat-front",
      "--release-version",
      "0.2.7",
      "--minified-path-prefix",
      "http://localhost:5173/assets",
      "--project-path",
      "llm-chat",
    ]);
  });

  it("removes only map files after upload", () => {
    const config = createFixture();
    expect(cleanSourceMaps(config)).toBe(1);
    expect(fs.existsSync(path.join(config.assetsDirectory, "app-123.js"))).toBe(
      true
    );
    expect(
      fs.existsSync(path.join(config.assetsDirectory, "app-123.js.map"))
    ).toBe(false);
  });
});

