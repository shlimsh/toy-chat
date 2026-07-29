import test from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeTelemetry,
  serializeTelemetry,
} from "../telemetry-sanitizer.mjs";
import { buildProviderHistory } from "../conversation-history.mjs";

test("telemetry sanitizer redacts credentials while preserving safe fields", () => {
  const sanitized = sanitizeTelemetry({
    email: "user@example.com",
    password: "plain-password",
    nested: {
      token: "signed-token",
      message: "safe message",
    },
  });

  assert.equal(sanitized.email, "user@example.com");
  assert.equal(sanitized.password, "[REDACTED]");
  assert.equal(sanitized.nested.token, "[REDACTED]");
  assert.equal(sanitized.nested.message, "safe message");
});

test("telemetry serializer redacts bearer tokens and JWT-shaped values", () => {
  const serialized = serializeTelemetry({
    header: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjEyM30.signaturevalue",
  });

  assert.doesNotMatch(serialized, /eyJhbGci/);
  assert.match(serialized, /\[REDACTED\]/);
});

test("provider history includes users and only the matching assistant", () => {
  const messages = [
    { role: "user", content: "첫 질문" },
    {
      role: "assistant",
      content: "OpenAI 첫 답변",
      metadata: { provider: "OpenAI" },
    },
    {
      role: "assistant",
      content: "Azure 첫 답변",
      metadata: { provider: "Azure AI" },
    },
    { role: "user", content: "다음 질문" },
  ];

  assert.deepEqual(buildProviderHistory(messages, "OpenAI"), [
    { role: "user", content: "첫 질문" },
    { role: "assistant", content: "OpenAI 첫 답변" },
    { role: "user", content: "다음 질문" },
  ]);

  assert.deepEqual(buildProviderHistory(messages, "Azure AI"), [
    { role: "user", content: "첫 질문" },
    { role: "assistant", content: "Azure 첫 답변" },
    { role: "user", content: "다음 질문" },
  ]);
});

