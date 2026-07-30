export function createRuntimeState() {
  return {
    startedAt: new Date(),
    databaseReady: false,
    ragReady: false,
    ragStatus: "initializing",
    ragMode: "unavailable",
    ragDocumentCount: 0,
    ragChunkCount: 0,
    ragErrorCode: null,
    shuttingDown: false,
    shutdownReason: null,
    get ready() {
      // RAG는 보강 기능이다. Keyword/빈 Context의 Degraded Mode에서도
      // 데이터베이스와 Provider가 정상이면 핵심 채팅 요청을 받을 수 있다.
      return this.databaseReady && !this.shuttingDown;
    },
  };
}
