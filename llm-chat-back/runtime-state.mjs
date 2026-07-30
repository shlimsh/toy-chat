export function createRuntimeState() {
  return {
    startedAt: new Date(),
    databaseReady: false,
    ragReady: false,
    shuttingDown: false,
    shutdownReason: null,
    get ready() {
      return this.databaseReady && this.ragReady && !this.shuttingDown;
    },
  };
}

