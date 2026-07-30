import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChunkRecords,
  lexicalSimilarity,
  rankChunkRecords,
  splitChunks,
  splitDocumentSections,
} from "../rag.mjs";

test("문단 경계를 우선해 Chunk를 나누고 overlap을 유지한다", () => {
  const text = [
    "첫 번째 문단입니다. RUM과 사용자 세션을 설명합니다.",
    "",
    "두 번째 문단입니다. APM Trace와 Span을 설명합니다.",
    "",
    "세 번째 문단입니다. Logs 상관관계를 설명합니다.",
  ].join("\n");
  const chunks = splitChunks(text, 70, 10);

  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 80));
});

test("제목과 Section을 보존한 Chunk Record를 만든다", () => {
  const text = [
    "# Datadog RUM",
    "",
    "## RUM과 APM 연결",
    "allowedTracingUrls와 CORS Header를 설정합니다.",
    "",
    "## Source Map",
    "service와 version을 업로드 값과 일치시킵니다.",
  ].join("\n");
  const sections = splitDocumentSections(text, "fallback");
  const records = buildChunkRecords(
    [
      {
        id: "rum.txt",
        name: "rum.txt",
        title: "Datadog RUM",
        text,
        sources: ["https://docs.datadoghq.com/real_user_monitoring/"],
        updatedAt: "2026-07-30T00:00:00.000Z",
      },
    ],
    500,
    50
  );

  assert.deepEqual(
    sections.map((section) => section.heading),
    ["RUM과 APM 연결", "Source Map"]
  );
  assert.equal(records.length, 2);
  assert.equal(records[0].section, "RUM과 APM 연결");
  assert.match(records[0].text, /# Datadog RUM/);
});

test("Embedding이 없으면 Keyword 검색으로 관련 문서를 찾는다", () => {
  const records = [
    {
      id: "rum::1",
      docId: "rum.txt",
      title: "Datadog RUM",
      section: "Source Map",
      text: "브라우저 Source Map은 service와 version이 일치해야 합니다.",
    },
    {
      id: "dbm::1",
      docId: "dbm.txt",
      title: "Datadog DBM",
      section: "Query",
      text: "Query Samples에서 데이터베이스 실행 정보를 확인합니다.",
    },
  ];
  const results = rankChunkRecords(records, {
    query: "RUM Source Map의 service와 version은?",
    topK: 3,
    minScore: 0.1,
  });

  assert.equal(results[0].docId, "rum.txt");
  assert.equal(results[0].retrievalStrategy, "keyword");
  assert.ok(results[0].lexicalScore >= 0.1);
});

test("하이픈과 한국어 조사가 달라도 Keyword를 연결한다", () => {
  const score = lexicalSimilarity(
    "Azure only에서 RAG 동작",
    "Azure-only 구성에서는 RAG가 Keyword 모드로 동작합니다."
  );

  assert.ok(score >= 0.5);
});

test("Hybrid 검색은 최소 점수와 문서별 최대 Chunk 수를 적용한다", () => {
  const records = [
    {
      id: "apm::1",
      docId: "apm.txt",
      title: "APM",
      section: "오류",
      text: "오류 Span에는 error.message와 error.stack을 기록합니다.",
      embedding: [1, 0],
    },
    {
      id: "apm::2",
      docId: "apm.txt",
      title: "APM",
      section: "Trace",
      text: "Trace는 여러 Span으로 구성됩니다.",
      embedding: [0.95, 0.05],
    },
    {
      id: "rum::1",
      docId: "rum.txt",
      title: "RUM",
      section: "Session",
      text: "RUM Session은 사용자 탐색을 연결합니다.",
      embedding: [0, 1],
    },
  ];
  const results = rankChunkRecords(records, {
    query: "APM 오류 Span stack",
    queryEmbedding: [1, 0],
    topK: 3,
    minScore: 0.2,
    maxChunksPerDocument: 1,
  });

  assert.equal(results[0].id, "apm::1");
  assert.equal(results[0].retrievalStrategy, "hybrid");
  assert.equal(results.filter((result) => result.docId === "apm.txt").length, 1);
  assert.ok(lexicalSimilarity("APM 오류", records[0].text) > 0);
});
