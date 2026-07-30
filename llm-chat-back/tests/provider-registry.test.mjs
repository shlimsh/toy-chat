import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProviderRegistry,
  createProviderJobs,
  runProviderJobs,
} from "../provider-registry.mjs";

function config(overrides = {}) {
  return {
    openaiEnabled: false,
    openaiModel: "gpt-5-mini",
    azureEnabled: false,
    azureModel: "grok-4.3",
    ...overrides,
  };
}

test("OpenAI-only 구성은 OpenAI 작업만 만든다", () => {
  const client = { name: "openai-client" };
  const providers = buildProviderRegistry({
    config: config({ openaiEnabled: true }),
    clients: { openai: client },
  });

  assert.equal(providers.length, 1);
  assert.equal(providers[0].id, "openai");
  assert.equal(providers[0].client, client);
});

test("Azure-only 구성은 Azure 작업만 만든다", () => {
  const client = { name: "azure-client" };
  const providers = buildProviderRegistry({
    config: config({ azureEnabled: true }),
    clients: { azure: client },
  });

  assert.equal(providers.length, 1);
  assert.equal(providers[0].id, "azure");
  assert.equal(providers[0].client, client);
});

test("활성 Provider만 실행하고 결과를 독립적으로 정산한다", async () => {
  const providers = buildProviderRegistry({
    config: config({ openaiEnabled: true, azureEnabled: true }),
  });
  const calls = [];
  const jobs = createProviderJobs({
    providers,
    runners: {
      openai: () => async () => {
        calls.push("openai");
        return { provider: "OpenAI", status: "success" };
      },
      azure: () => async () => {
        calls.push("azure");
        throw new Error("Azure unavailable");
      },
    },
  });

  const settled = await runProviderJobs(jobs);

  assert.deepEqual(calls.sort(), ["azure", "openai"]);
  assert.equal(settled[0].status, "fulfilled");
  assert.equal(settled[1].status, "rejected");
});
