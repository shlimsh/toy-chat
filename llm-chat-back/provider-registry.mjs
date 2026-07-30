export function buildProviderRegistry({ config, clients = {} }) {
  const providers = [];

  if (config.openaiEnabled) {
    providers.push({
      id: "openai",
      provider: "OpenAI",
      model: config.openaiModel,
      client: clients.openai || null,
      supportsTools: true,
    });
  }

  if (config.azureEnabled) {
    providers.push({
      id: "azure",
      provider: "Azure AI",
      model: config.azureModel,
      client: clients.azure || null,
      supportsTools: false,
    });
  }

  return providers;
}

export function createProviderJobs({ providers, runners }) {
  return providers.map((provider) => {
    const createRunner = runners?.[provider.id];
    if (typeof createRunner !== "function") {
      throw new Error(`Provider runner is missing: ${provider.id}`);
    }

    return {
      ...provider,
      runner: createRunner(provider),
    };
  });
}

export function runProviderJobs(jobs) {
  return Promise.allSettled(jobs.map((job) => job.runner()));
}
