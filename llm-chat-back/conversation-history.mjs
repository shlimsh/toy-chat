function normalizeProvider(provider) {
  return String(provider || "").trim().toLowerCase();
}

export function buildProviderHistory(messages, provider, options = {}) {
  const limit = Number(options.limit || 8);
  const targetProvider = normalizeProvider(provider);

  return (Array.isArray(messages) ? messages : [])
    .filter((message) => {
      if (message?.role === "user") return true;
      if (message?.role !== "assistant") return false;

      return normalizeProvider(message.metadata?.provider) === targetProvider;
    })
    .slice(-Math.max(1, limit))
    .map((message) => ({
      role: message.role,
      content: String(message.content ?? ""),
    }));
}

