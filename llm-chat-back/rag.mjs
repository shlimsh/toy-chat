import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_PATH = path.join(DATA_DIR, "rag-cache.json");
const SUPPORTED_EXTENSIONS = new Set([".txt", ".md"]);
const SEARCH_STOP_WORDS = new Set([
  "그리고",
  "그러면",
  "대한",
  "대해서",
  "어떻게",
  "무엇",
  "무슨",
  "있는",
  "있어",
  "알려줘",
  "설명",
  "the",
  "and",
  "for",
  "with",
  "what",
  "how",
]);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function walkDocumentFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) return walkDocumentFiles(fullPath);
      if (!entry.isFile()) return [];
      return SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
        ? [fullPath]
        : [];
    });
}

function extractTitle(text, fallback) {
  const heading = String(text).match(/^\s*#\s+(.+)$/m)?.[1]?.trim();
  return heading || fallback.replace(/\.(txt|md)$/i, "");
}

function extractSources(text) {
  return [
    ...new Set(
      String(text).match(/https:\/\/[^\s)>]+/g)?.map((url) => url.trim()) || []
    ),
  ];
}

export async function loadDocuments() {
  const docsDir = path.join(process.cwd(), "docs");
  ensureDir(docsDir);

  return walkDocumentFiles(docsDir).map((fullPath) => {
    const stat = fs.statSync(fullPath);
    const text = fs.readFileSync(fullPath, "utf-8").replace(/\r\n/g, "\n");
    const relativePath = path.relative(docsDir, fullPath).replace(/\\/g, "/");

    return {
      id: relativePath,
      name: path.basename(relativePath),
      title: extractTitle(text, path.basename(relativePath)),
      text,
      path: fullPath,
      relativePath,
      sources: extractSources(text),
      updatedAt: stat.mtime.toISOString(),
    };
  });
}

export function splitChunks(text, chunkSize = 1000, overlap = 150) {
  if (!text || !String(text).trim()) return [];

  const normalized = String(text).replace(/\r\n/g, "\n").trim();
  const chunks = [];

  let start = 0;
  while (start < normalized.length) {
    const hardEnd = Math.min(start + chunkSize, normalized.length);
    let end = hardEnd;

    if (hardEnd < normalized.length) {
      const candidate = normalized.slice(start, hardEnd);
      const paragraphBreak = candidate.lastIndexOf("\n\n");
      const sentenceBreak = Math.max(
        candidate.lastIndexOf(". "),
        candidate.lastIndexOf("다. "),
        candidate.lastIndexOf("요. ")
      );
      const preferredBreak = Math.max(paragraphBreak, sentenceBreak);

      if (preferredBreak >= Math.floor(chunkSize * 0.55)) {
        end = start + preferredBreak + (preferredBreak === paragraphBreak ? 2 : 1);
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;

    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

export function splitDocumentSections(text, fallbackTitle = "문서") {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const documentTitle = extractTitle(text, fallbackTitle);
  const sections = [];
  let currentHeading = documentTitle;
  let currentLines = [];

  const flush = () => {
    const content = currentLines.join("\n").trim();
    if (content) {
      sections.push({
        heading: currentHeading,
        text: content,
      });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const heading = line.match(/^\s*#{1,3}\s+(.+)$/);
    if (heading) {
      flush();
      currentHeading = heading[1].trim();
      continue;
    }
    currentLines.push(line);
  }
  flush();

  return sections.length > 0
    ? sections
    : [{ heading: documentTitle, text: String(text ?? "").trim() }];
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

export function tokenizeSearchText(value) {
  const rawTokens =
    String(value ?? "")
      .toLowerCase()
      .match(/[가-힣a-z0-9][가-힣a-z0-9._/-]*/g) || [];
  const expanded = rawTokens.flatMap((rawToken) => {
    const normalized = rawToken.replace(/^[./-]+|[./-]+$/g, "");
    const parts = normalized.split(/[._/-]+/).filter(Boolean);
    const candidates = [normalized, ...parts];

    return candidates.flatMap((token) => {
      const withoutParticle = token.replace(
        /(에서는|으로는|에게는|에서|으로|에는|에게|하고|이며|은|는|이|가|을|를|의|에|도|만)$/u,
        ""
      );
      return withoutParticle && withoutParticle !== token
        ? [token, withoutParticle]
        : [token];
    });
  });

  return [
    ...new Set(
      expanded
        .filter(
          (token) =>
            token.length >= 2 &&
            !SEARCH_STOP_WORDS.has(token)
        )
    ),
  ];
}

export function lexicalSimilarity(query, text) {
  const queryTokens = tokenizeSearchText(query);
  if (queryTokens.length === 0) return 0;

  const normalizedText = String(text ?? "").toLowerCase();
  const textTokens = new Set(tokenizeSearchText(normalizedText));
  let matched = 0;
  let occurrenceScore = 0;

  for (const token of queryTokens) {
    if (textTokens.has(token) || normalizedText.includes(token)) {
      matched += 1;
      const occurrences = normalizedText.split(token).length - 1;
      occurrenceScore += Math.min(occurrences, 3) / 3;
    }
  }

  const coverage = matched / queryTokens.length;
  const density = occurrenceScore / queryTokens.length;
  const normalizedQuery = queryTokens.join(" ");
  const phraseBonus =
    normalizedQuery.length >= 4 && normalizedText.includes(normalizedQuery)
      ? 0.15
      : 0;

  return Math.min(1, coverage * 0.75 + density * 0.1 + phraseBonus);
}

export function loadEmbeddingCache() {
  ensureDir(DATA_DIR);

  if (!fs.existsSync(CACHE_PATH)) {
    return {
      version: 2,
      embeddingModel: null,
      updatedAt: null,
      chunks: {},
    };
  }

  try {
    const raw = fs.readFileSync(CACHE_PATH, "utf-8");
    const parsed = JSON.parse(raw);

    return {
      version: parsed.version ?? 1,
      embeddingModel: parsed.embeddingModel ?? null,
      updatedAt: parsed.updatedAt ?? null,
      chunks: parsed.chunks ?? {},
    };
  } catch {
    return {
      version: 2,
      embeddingModel: null,
      updatedAt: null,
      chunks: {},
    };
  }
}

export function saveEmbeddingCache(cache) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

export function buildChunkRecords(docs, chunkSize = 1000, overlap = 150) {
  const records = [];
  const seenContent = new Set();

  for (const doc of docs) {
    const sections = splitDocumentSections(doc.text, doc.title || doc.id);
    let docChunkIndex = 0;

    for (const section of sections) {
      const sectionChunks = splitChunks(section.text, chunkSize, overlap);

      for (const sectionChunk of sectionChunks) {
        const text = `# ${doc.title || doc.id}\n## ${section.heading}\n${sectionChunk}`;
        const contentHash = sha256(text.replace(/\s+/g, " ").trim());
        if (seenContent.has(contentHash)) continue;
        seenContent.add(contentHash);

        const id = buildChunkId(doc.id, docChunkIndex);
        const hash = buildChunkHash(doc.id, text);

        records.push({
          id,
          docId: doc.id,
          name: doc.name || doc.id,
          title: doc.title || doc.id,
          section: section.heading,
          sources: Array.isArray(doc.sources) ? doc.sources : [],
          text,
          hash,
          contentHash,
          chunkIndex: docChunkIndex,
          docUpdatedAt: doc.updatedAt,
        });
        docChunkIndex += 1;
      }
    }
  }

  return records;
}

export function rankChunkRecords(
  records,
  {
    query,
    queryEmbedding = null,
    topK = 3,
    minScore = 0.18,
    maxChunksPerDocument = 2,
  } = {}
) {
  const hasQueryEmbedding =
    Array.isArray(queryEmbedding) && queryEmbedding.length > 0;

  const scored = (Array.isArray(records) ? records : []).map((item) => {
    const lexicalScore = lexicalSimilarity(
      query,
      `${item.title || ""}\n${item.section || ""}\n${item.text || ""}`
    );
    const semanticScore =
      hasQueryEmbedding && Array.isArray(item.embedding)
        ? Math.max(0, cosineSimilarity(queryEmbedding, item.embedding))
        : null;
    const strategy =
      semanticScore === null ? "keyword" : "hybrid";
    const score =
      semanticScore === null
        ? lexicalScore
        : semanticScore * 0.82 + lexicalScore * 0.18;

    return {
      ...item,
      score,
      semanticScore,
      lexicalScore,
      retrievalStrategy: strategy,
    };
  });

  const perDocument = new Map();

  return scored
    .filter((item) => Number.isFinite(item.score) && item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .filter((item) => {
      const count = perDocument.get(item.docId) || 0;
      if (count >= maxChunksPerDocument) return false;
      perDocument.set(item.docId, count + 1);
      return true;
    })
    .slice(0, Math.max(1, topK));
}
