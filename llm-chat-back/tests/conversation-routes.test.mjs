import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import express from "express";

Object.assign(process.env, {
  DD_VERSION: "0.2.4",
  JWT_SECRET: "test-secret-that-is-long-enough",
  MYSQL_DATABASE: "toy_chat",
  MYSQL_HOST: "127.0.0.1",
  MYSQL_USER: "toy_chat_user",
  OPENAI_API_KEY: "test-openai-key",
});

const { signToken } = await import("../auth.mjs");
const { createConversationRouter } = await import(
  "../routes/conversation-routes.mjs"
);

async function withServer(router, run) {
  const app = express();
  app.use("/conversations", router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("conversation routes require auth and return cursor page metadata", async () => {
  const calls = [];
  const router = createConversationRouter({
    async getConversationPage(input) {
      calls.push(input);
      return {
        conversations: [{ id: "conv_1", title: "최근 대화" }],
        pageInfo: { hasMore: true, nextCursor: "next-page" },
      };
    },
    async getConversationByIdForUser() {
      return { id: "conv_1" };
    },
    async getMessagePage() {
      return {
        messages: [{ id: 2, role: "user", content: "질문" }],
        pageInfo: { hasMore: true, nextCursor: "2" },
      };
    },
  });
  const token = signToken({
    id: "user-1",
    email: "user@example.com",
    name: "Tester",
  });

  await withServer(router, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/conversations`);
    assert.equal(unauthorized.status, 401);

    const listResponse = await fetch(`${baseUrl}/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listBody = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(listBody.pageInfo.hasMore, true);
    assert.equal(calls[0].limit, 20);

    const messageResponse = await fetch(
      `${baseUrl}/conversations/conv_1/messages?before=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const messageBody = await messageResponse.json();
    assert.equal(messageResponse.status, 200);
    assert.equal(messageBody.pageInfo.nextCursor, "2");
  });
});

test("invalid cursors are rejected before repository access", async () => {
  let repositoryCalls = 0;
  const router = createConversationRouter({
    async getConversationPage() {
      repositoryCalls += 1;
      return { conversations: [], pageInfo: {} };
    },
    async getConversationByIdForUser() {
      repositoryCalls += 1;
      return { id: "conv_1" };
    },
    async getMessagePage() {
      repositoryCalls += 1;
      return { messages: [], pageInfo: {} };
    },
  });
  const token = signToken({
    id: "user-1",
    email: "user@example.com",
    name: "Tester",
  });
  const headers = { Authorization: `Bearer ${token}` };

  await withServer(router, async (baseUrl) => {
    const listResponse = await fetch(
      `${baseUrl}/conversations?cursor=broken`,
      { headers }
    );
    assert.equal(listResponse.status, 400);

    const messageResponse = await fetch(
      `${baseUrl}/conversations/conv_1/messages?before=invalid`,
      { headers }
    );
    assert.equal(messageResponse.status, 400);

    const longIdResponse = await fetch(
      `${baseUrl}/conversations/conv_${"a".repeat(80)}/messages`,
      { headers }
    );
    assert.equal(longIdResponse.status, 400);
    assert.equal(repositoryCalls, 0);
  });
});
