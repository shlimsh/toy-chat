# v0.2.4 — Provider 복원력, API 보안 및 대화 확장성

이번 릴리즈는 AI Provider 장애 대응, Hybrid RAG, API 보안, Datadog 모니터링 복원력과 장기 대화 데이터의 확장성을 함께 개선합니다. 기존 개발 방식은 유지되며 백엔드와 프런트엔드를 각각 `npm run dev`로 실행할 수 있습니다.

## 주요 변경 사항

### Provider 및 RAG 복원력

- OpenAI-only, Azure-only 및 두 Provider 동시 구성 지원
- 활성화된 Provider만 호출하고 결과를 독립적으로 처리
- 일부 Provider만 성공하면 `partial_success`로 정상 응답 유지
- 실패한 Provider 답변이 다음 Prompt 이력에 포함되지 않도록 차단
- RAG 문서를 Datadog RUM, APM, Logs, LLM Observability, DBM, Kubernetes, Synthetics와 toy-chat 운영 문서로 확장
- Semantic + Keyword Hybrid 검색 적용
- Embedding을 사용할 수 없거나 실패하면 Keyword Degraded Mode로 전환
- 최소 검색 점수, 문서별 최대 Chunk 수와 Embedding Cache 재사용 적용
- AI Runtime 패널에 RAG 모드, 검색 전략, 참고 문서와 점수 표시

### API 보안 및 모니터링

- Monitoring API에 JWT 인증 적용
- SMS 요청을 인증된 백엔드 프록시로 전환
- SMS 사용자별 Rate Limit 적용
- 외부 SMS API 주소를 프런트 Bundle에서 제거
- 외부 Origin으로 불필요한 RUM Trace Header 전파 차단
- Span의 질문·답변 원문 대신 길이, 해시, Provider와 모델 메타데이터 기록
- Datadog 지표 일부 조회 실패 시 정상 지표를 유지하는 Partial 응답 지원
- Monitoring의 `env`, `service`, RUM Metric 환경설정화

### 대화 데이터 확장성

- 대화 목록에 `(updated_at, id)` 기반 Cursor Pagination 적용
- 최신 메시지를 먼저 조회하고 `이전 메시지 불러오기`로 과거 구간 추가 조회
- 대화 기록 패널에 `이전 대화 더 보기` 추가
- LLM Prompt 이력을 최근 성공 메시지 최대 80건으로 제한
- Repository와 Service의 중복 SQL 제거
- 기존 MySQL에 필요한 복합 인덱스를 서버 시작 시 자동 보강
- 잘못된 Cursor와 과도하게 긴 대화 ID를 DB 조회 전에 HTTP 400으로 차단
- 메시지 상태 병합 시 동일 ID의 답변이 중복 추가되지 않도록 처리

### MySQL LIMIT 호환성 수정

- 일부 MySQL/MariaDB 환경에서 Prepared Statement의 `LIMIT ?`가 실패해 `대화 목록 조회 실패`가 발생하던 문제 수정
- 대화 목록, 메시지 목록과 LLM 최근 이력 조회에 동일한 호환 방식 적용
- 페이지 크기를 허용 범위의 정수로 검증한 후 SQL `LIMIT`에 사용
- Cursor와 페이지 크기 외의 사용자 입력은 기존과 동일하게 Parameter Binding 유지

## 환경변수

기존 백엔드 `.env`는 유지합니다. 다음 값은 선택 사항이며, 없으면 기본값으로 동작합니다.

```dotenv
CONVERSATION_PAGE_SIZE=20
MESSAGE_PAGE_SIZE=50
LLM_HISTORY_MESSAGE_LIMIT=80

SMS_RATE_LIMIT_WINDOW_MS=60000
SMS_RATE_LIMIT_MAX=3
SPAN_BODY_CAPTURE_MODE=metadata
```

SMS 기능을 사용하는 경우 기존 API Gateway 주소를 백엔드 `.env`에 설정합니다.

```dotenv
SMS_API_URL=https://zxezp1ixj5.execute-api.us-east-1.amazonaws.com/shlim/send
```

## 데이터베이스

기존 DB를 초기화하거나 SQL을 직접 실행할 필요가 없습니다. 서버 시작 시 다음 인덱스가 없을 때만 자동 생성됩니다.

```text
idx_conversations_user_updated_id
idx_messages_conversation_id
```

## 실행 방법

```powershell
# 백엔드
cd C:\shlim\toy-chat-2\llm-chat-back
npm install
npm run dev
```

```powershell
# 프런트엔드
cd C:\shlim\toy-chat-2\llm-chat
npm install
npm run dev
```

## 검증 결과

- 백엔드 테스트 70건 통과
- 프런트엔드 테스트 33건 통과
- 백엔드 문법 검사 통과
- ESLint 오류 및 경고 없음
- 프로덕션 빌드 성공
- Datadog Browser SDK v7 검증 통과
- JavaScript Bundle과 Source Map 각각 20개 대응 확인
- 백엔드 운영 의존성 취약점 0건
- 실제 `.env`, API Key, DB, RAG Cache, 로그, `node_modules`, `dist` 제외 확인

## 권장 커밋 메시지

```text
fix(db): improve pagination limit compatibility
```
