# toy-chat Phase 12 — API 보안 및 모니터링 복원력 강화

Phase 11의 Provider Resilience와 Hybrid RAG, Datadog Browser SDK v7,
RUM Source Map 릴리스 흐름을 유지하면서 인증 경계, SMS 호출 경로,
Span 개인정보 보호, 모니터링 부분 성공 처리를 보강한 전체 적용본입니다.

## 핵심 결과

- `/api/monitoring/summary`는 JWT 인증을 통과한 사용자만 조회합니다.
- 브라우저에서 외부 SMS API 주소를 제거하고 인증된 백엔드 프록시로 전환했습니다.
- SMS는 사용자별 기본 1분 3회로 제한하며 사용자 입력을 외부 발송 서비스에 전달하지 않습니다.
- RUM Trace Header는 동일 Origin 또는 명시한 API Origin에만 전파합니다.
- 요청·응답 원문은 기본적으로 Span에 저장하지 않습니다.
- Span에는 Body 크기, 질문 길이·SHA-256, Provider 수, 모델 같은 메타데이터만 기록합니다.
- CPU·Memory·Latency·Visitors 중 일부 쿼리가 실패해도 조회 가능한 카드를 유지합니다.
- APM과 RUM Monitoring 쿼리의 `service`, `env`, RUM Metric을 환경설정으로 관리합니다.
- 중복 `/monitoring/test` 공개 엔드포인트를 제거했습니다.
- OpenAI-only, Azure-only, OpenAI+Azure 구성을 모두 지원합니다.
- 환경설정이 있는 Provider만 호출합니다.
- 한 Provider만 성공해도 정상 답변을 반환합니다.
- 실패한 Provider 메시지는 다음 LLM Prompt 이력에서 제외합니다.
- RAG 초기화 또는 Embedding 장애가 서버 시작을 막지 않습니다.
- Embedding을 사용할 수 없으면 Keyword 검색으로 전환합니다.
- AI Runtime 패널에 RAG 모드, 전략, 결과 문서와 점수를 표시합니다.
- 기존 3개 약 700바이트 문서를 10개 약 22KB 문서로 확장했습니다.
- 제목과 Section 경계를 보존해 약 45개 Chunk를 생성합니다.
- 문서 Embedding을 최대 32개씩 Batch 처리하고 변경되지 않은 Chunk는 Cache를 재사용합니다.
- Semantic과 Keyword 점수를 결합한 Hybrid 검색, 최소 점수와 문서별 최대 결과 수를 적용합니다.
- GitHub Actions Quality Gate에서 백엔드와 프런트 테스트, Lint, Browser SDK v7, Build, Source Map을 검사합니다.

## 12차 환경설정

기존 `llm-chat-back\.env`에 다음 값을 추가합니다.

```dotenv
MONITORING_RUM_SERVICE=shlim-toy-chat-front
MONITORING_RUM_METRIC=rum.measure.session

SMS_API_URL=<기존 SMS API Gateway URL>
SMS_REQUEST_TIMEOUT_MS=15000
SMS_RATE_LIMIT_WINDOW_MS=60000
SMS_RATE_LIMIT_MAX=3

SPAN_BODY_CAPTURE_MODE=metadata
SPAN_BODY_TAG_MAX=8192
```

`SMS_API_URL`이 없으면 서버는 정상 기동하지만 SMS 버튼은 안전한
`sms_not_configured` 오류를 반환합니다. 외부 주소는 프런트 `.env`나
브라우저 Bundle에 넣지 않습니다.

`SPAN_BODY_CAPTURE_MODE`은 다음 중 하나입니다.

| 값 | 동작 |
| --- | --- |
| `off` | 요청·응답 Body 관련 Span 태그를 만들지 않음 |
| `metadata` | 기본값. 크기·길이·해시·Provider·모델 정보만 기록 |
| `full` | 개발 환경에서만 Sanitizing된 원문을 제한 길이로 기록 |

운영 환경의 `full` 설정은 서버 시작 전에 거부됩니다.

## 보호된 API

```text
GET  /api/monitoring/summary
POST /api/notifications/sms
```

두 API 모두 `Authorization: Bearer <JWT>`가 필요합니다. SMS 요청 한도를
넘으면 HTTP `429`, `Retry-After`, `RateLimit-*` Header를 반환합니다.
현재 Rate Limit 저장소는 단일 데모 서버용 메모리 방식이므로 서버 재시작
또는 다중 Replica 간에는 공유되지 않습니다.

## Provider 구성

둘 중 하나 이상의 Provider 설정이 있어야 합니다.

### OpenAI-only

```dotenv
OPENAI_API_KEY=<key>
OPENAI_MODEL=gpt-5-mini

AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
```

### Azure-only

```dotenv
OPENAI_API_KEY=

AZURE_OPENAI_API_KEY=<key>
AZURE_OPENAI_ENDPOINT=<endpoint>
AZURE_OPENAI_MODEL=grok-4.3
```

Azure-only에서는 OpenAI 요청과 실패 카드를 만들지 않습니다. Query Embedding을 사용할 수 없으므로 RAG는 `degraded + keyword` 모드로 동작하지만 문서 Context는 계속 검색합니다.

### OpenAI + Azure

두 Provider 설정을 모두 입력합니다. 둘 다 성공하면 `success`, 하나만 성공하면 HTTP 200 `partial_success`, 활성 Provider가 모두 실패하면 HTTP 503 `failed`입니다.

## RAG 문서

`llm-chat-back/docs`에 다음 지식을 포함합니다.

```text
datadog-apm.txt
datadog-dbm.txt
datadog-kubernetes-agent.txt
datadog-llm.txt
datadog-logs.txt
datadog-rum.txt
datadog-synthetics.txt
rag-retrieval-guide.txt
toy-chat-architecture.txt
toy-chat-operations.txt
```

Datadog 문서는 각 파일 마지막에 공식 문서 URL을 포함합니다. 새 문서는 첫 줄에 `# 문서 제목`, 내용에 `## Section 제목`을 사용해 `txt` 또는 `md`로 추가할 수 있습니다.

## RAG 설정

기존 `.env`에 아래 값이 없어도 기본값으로 동작합니다.

```dotenv
RAG_CHUNK_SIZE=1000
RAG_CHUNK_OVERLAP=150
RAG_TOP_K=3
RAG_MIN_SCORE=0.18
RAG_MAX_CHUNKS_PER_DOCUMENT=2
RAG_EMBEDDING_BATCH_SIZE=32
```

- `RAG_MIN_SCORE`: 관련성이 낮은 Context를 제외합니다.
- `RAG_MAX_CHUNKS_PER_DOCUMENT`: 한 문서가 검색 결과를 독점하지 않게 합니다.
- `RAG_EMBEDDING_BATCH_SIZE`: 첫 색인 또는 변경된 Chunk의 Embedding API 호출 수를 줄입니다.
- `data/rag-cache.json`: 문서 내용과 모델이 같은 Embedding을 재사용하는 생성 파일입니다.

검색 모드는 다음과 같습니다.

| 상태 | 의미 |
| --- | --- |
| `hybrid` | 모든 Chunk의 Embedding과 Keyword 점수를 결합 |
| `hybrid_partial` | Cache 또는 생성된 일부 Embedding과 Keyword를 결합 |
| `keyword` | Embedding 없이 문서 Keyword로 검색 |
| `unavailable` | 문서 로딩 실패로 빈 Context 사용 |

RAG는 선택적 보강 기능입니다. RAG가 Degraded여도 MySQL과 활성 Provider가 정상이면 채팅 서버는 Ready 상태를 유지합니다.

## 적용

압축 안의 전체 프로젝트를 `C:\shlim\toy-chat-2`에 덮어씁니다. 실제 `.env`, Key, DB 파일, RAG Cache, `node_modules`, `dist`, 로그는 포함하지 않았습니다.

```powershell
cd C:\shlim\toy-chat-2\llm-chat-back
npm install

cd C:\shlim\toy-chat-2\llm-chat
npm install
```

기존 `llm-chat-back\.env`는 유지합니다. 첫 실행 시 소스 변경을 감지해 `DD_VERSION` patch를 한 번만 올리고 프런트의 `VITE_DD_VERSION`과 동기화합니다.

```powershell
cd C:\shlim\toy-chat-2\llm-chat-back
npm run dev

cd C:\shlim\toy-chat-2\llm-chat
npm run dev
```

이전 중복 검증 파일은 실제 실행에 사용되지 않습니다. 로컬에 남아 있다면 선택적으로 아래 파일을 제거할 수 있습니다.

```text
llm-chat-back/cors-config.mjs
llm-chat-back/middleware/http-observability.mjs
llm-chat-back/tests/basic.test.js
llm-chat-back/tests/cors-config.test.mjs
llm-chat-back/tests/cors-http.test.mjs
llm-chat-back/tests/current-code.test.js
```

## 상태 확인

```text
http://localhost:3001/health
http://localhost:3001/health/live
http://localhost:3001/health/ready
```

`/health` 응답에서 활성 Provider와 RAG 문서 수, Chunk 수, 상태와 모드를 확인할 수 있습니다. `/health/ready`는 MySQL을 필수 의존성으로 검사하고 RAG 상태는 `optionalDependencies.rag`에 표시합니다.

## Datadog 확인

APM 검색:

```text
service:shlim-toy-chat-api resource_name:"POST /chat"
```

Provider 오류 자식 Span:

```text
service:shlim-toy-chat-api operation_name:llm.provider.request @error:true
```

RAG 관련 Span 속성:

```text
@app.rag.status:degraded
@app.rag.mode:keyword
@app.retrieval.strategy:keyword
```

백엔드 로그 이벤트:

```text
service:shlim-toy-chat-api @event:rag_initialized
service:shlim-toy-chat-api @event:chat_retrieval_completed
service:shlim-toy-chat-api @event:chat_request_partial_success
```

`rag_initialized`에는 문서 수, Chunk 수, Cache 재사용 수, 새 Embedding 수와 모드가 기록됩니다. `chat_retrieval_completed`에는 전략, 문서 Chunk ID, 점수와 Degraded 원인이 기록됩니다.

## 테스트 및 빌드

```powershell
cd C:\shlim\toy-chat-2\llm-chat-back
npm test
npm run check

cd C:\shlim\toy-chat-2\llm-chat
npm test
npm run lint
npm run build
```

`npm run build`는 Browser SDK v7 검사와 JavaScript Bundle/Source Map 1:1 검증을 함께 실행합니다.

백엔드는 인증된 Monitoring/SMS 실제 HTTP 경로, 사용자별 Rate Limit,
Datadog 쿼리 부분 성공, Span 원문 비노출을 회귀 테스트합니다.
프런트는 외부 Origin으로 Trace Header가 전파되지 않는 조건을 검사합니다.

검증 결과:

- 백엔드 테스트 58건 통과
- 프런트 테스트 32건 통과
- ESLint 오류·경고 0건
- 백엔드 문법 검사 통과
- Browser SDK v7 검사 통과
- 프로덕션 JavaScript Bundle 20개와 Source Map 20개 대응
- 백엔드 운영 의존성 `npm audit` 0건

프런트 `npm audit`에는 `react-router 7.12.0~8.2.0`의 RSC 전용
권고가 표시됩니다. toy-chat은 Vite Client SPA이며 권고문이 명시한
unstable RSC API를 사용하지 않습니다. 안전한 상위 패치 버전이
배포되면 별도 회귀 테스트 후 올립니다.

## RUM Source Map

Phase 9와 10의 릴리스 흐름을 그대로 유지합니다.

```powershell
cd C:\shlim\toy-chat-2\llm-chat
npm run release:rum
npm run preview:rum
```

`node --enable-source-maps`는 백엔드 Node.js Stack용입니다. 브라우저 Source Map은 `release:rum`으로 업로드해야 하며 RUM의 `service`, `version`, JavaScript URL Prefix와 업로드 값이 모두 일치해야 합니다.
