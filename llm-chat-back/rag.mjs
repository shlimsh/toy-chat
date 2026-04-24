import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_PATH = path.join(DATA_DIR, "rag-cache.json");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export async function loadDocuments() {
  const docsDir = path.join(process.cwd(), "docs");
  ensureDir(docsDir);

  const files = fs.readdirSync(docsDir);
  const documents = [];

  for (const file of files) {
    const fullPath = path.join(docsDir, file);
    const stat = fs.statSync(fullPath);

    if (!stat.isFile()) continue;
    if (!file.endsWith(".txt")) continue;

    const text = fs.readFileSync(fullPath, "utf-8");

    documents.push({
      id: file,
      text,
      path: fullPath,
      updatedAt: stat.mtime.toISOString()
    });
  }

  return documents;
}

export function splitChunks(text, chunkSize = 1000, overlap = 150) {
  if (!text || !text.trim()) return [];

  const normalized = text.replace(/\r\n/g, "\n").trim();
  const chunks = [];

  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const chunk = normalized.slice(start, end).trim();

    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;

    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function buildChunkId(docId, index) {
  return `${docId}::chunk_${index + 1}`;
}

export function buildChunkHash(docId, chunkText) {
  return sha256(`${docId}:::${chunkText}`);
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function loadEmbeddingCache() {
  ensureDir(DATA_DIR);

  if (!fs.existsSync(CACHE_PATH)) {
    return {
      version: 1,
      embeddingModel: null,
      updatedAt: null,
      chunks: {}
    };
  }

  try {
    const raw = fs.readFileSync(CACHE_PATH, "utf-8");
    const parsed = JSON.parse(raw);

    return {
      version: parsed.version ?? 1,
      embeddingModel: parsed.embeddingModel ?? null,
      updatedAt: parsed.updatedAt ?? null,
      chunks: parsed.chunks ?? {}
    };
  } catch {
    return {
      version: 1,
      embeddingModel: null,
      updatedAt: null,
      chunks: {}
    };
  }
}

export function saveEmbeddingCache(cache) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

export function buildChunkRecords(docs, chunkSize = 1000, overlap = 150) {
  const records = [];

  for (const doc of docs) {
    const chunks = splitChunks(doc.text, chunkSize, overlap);

    for (let i = 0; i < chunks.length; i += 1) {
      const text = chunks[i];
      const id = buildChunkId(doc.id, i);
      const hash = buildChunkHash(doc.id, text);

      records.push({
        id,
        docId: doc.id,
        name: doc.id,
        text,
        hash,
        chunkIndex: i,
        docUpdatedAt: doc.updatedAt
      });
    }
  }

  return records;
}