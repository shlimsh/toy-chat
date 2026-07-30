import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";

await pipeline(
  createReadStream(
    new URL("./node_modules/@sparticuz/chromium/bin/chromium.br", import.meta.url)
  ),
  createBrotliDecompress(),
  createWriteStream(new URL("../tmp/chromium", import.meta.url), {
    mode: 0o700,
  })
);
