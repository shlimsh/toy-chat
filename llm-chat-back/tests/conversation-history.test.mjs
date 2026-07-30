import assert from "node:assert/strict";
import test from "node:test";

import { buildProviderHistory } from "../conversation-history.mjs";

const messages = [
  { role: "user", content: "첫 질문" },
  {
    role: "assistant",
    content: "OpenAI 성공",
    metadata: { provider: "OpenAI", status: "success" },
  },
  {
    role: "assistant",
    content: "Azure 실패 메시지",
    metadata: { provider: "Azure AI", status: "failed" },
  },
  { role: "user", content: "두 번째 질문" },
  {
    role: "assistant",
    content: "Azure 성공",
    metadata: { provider: "Azure AI", status: "success" },
  },
];

test("실패한 Provider 답변은 다음 Prompt 대화 이력에서 제외한다", () => {
  const history = buildProviderHistory(messages, "Azure AI");

  assert.deepEqual(history, [
    { role: "user", content: "첫 질문" },
    { role: "user", content: "두 번째 질문" },
    { role: "assistant", content: "Azure 성공" },
  ]);
  assert.equal(
    history.some((message) => message.content.includes("실패")),
    false
  );
});

test("Provider별 성공 답변만 자신의 이력에 포함한다", () => {
  const history = buildProviderHistory(messages, "OpenAI");

  assert.ok(history.some((message) => message.content === "OpenAI 성공"));
  assert.equal(
    history.some((message) => message.content === "Azure 성공"),
    false
  );
});
