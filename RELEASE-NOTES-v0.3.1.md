# toy-chat v0.3.1



릴리즈 날짜: 2026-07-31



## 주요 변경 사항



### 대화 및 메시지 조회 개선



\- 대화 목록과 메시지 목록에 Cursor 기반 페이지네이션을 적용했습니다.

\- 잘못되었거나 허용 범위를 벗어난 Cursor 요청을 DB 조회 전에 차단합니다.

\- 대화 및 메시지 조회 성능을 위한 데이터베이스 인덱스를 자동으로 확인하고 생성합니다.

\- 동시에 애플리케이션이 기동되어도 인덱스 생성 충돌을 안전하게 처리합니다.



### OpenAI 및 Azure AI 응답 처리 개선



\- OpenAI와 Azure AI 응답을 Provider별로 독립적으로 처리합니다.

\- 하나의 Provider만 성공해도 정상 응답을 제공하도록 개선했습니다.

\- 실패한 Provider의 답변은 이후 대화 이력에서 제외합니다.

\- 화면에서 Provider별 응답과 부분 성공 상태를 구분해 표시합니다.



### 오류 처리 및 Datadog 관측성 개선



\- API 오류 응답 형식을 표준화하고 요청 ID를 함께 반환합니다.

\- 내부 오류 내용이나 민감한 정보가 사용자에게 노출되지 않도록 개선했습니다.

\- Datadog APM Error Tracking에 표준 오류 필드를 기록합니다.

\- 요청·응답 본문은 기본적으로 원문 대신 크기와 해시 메타데이터만 Span에 기록합니다.

\- 인증 토큰, JWT 및 자격 증명을 Telemetry 데이터에서 마스킹합니다.



### HTTP 및 보안 설정 개선



\- Datadog 분산 추적 헤더를 CORS 허용 목록에 추가했습니다.

\- Resource Timing을 위한 `Timing-Allow-Origin` 응답 헤더를 적용했습니다.

\- 백엔드 처리 시간을 `Server-Timing` 헤더로 제공합니다.

\- 운영 환경에서 wildcard CORS와 전체 요청·응답 본문 수집을 제한합니다.



### 화면 및 테스트 개선



\- 대화 화면과 응답 표시 UI를 개선했습니다.

\- 대화 API 및 Cursor 페이지네이션 통합 테스트를 추가했습니다.

\- 데이터베이스 인덱스 생성 테스트를 추가했습니다.

\- 백엔드 자동 테스트 74건을 모두 통과했습니다.



## 검증 결과

- Backend tests: 74 passed, 0 failed
- Frontend tests: 33 passed, 0 failed
- Production build: passed
- Datadog Browser SDK v7 verification: passed (7.6.1)
- Source Maps verification: passed (service `shlim-toy-chat-front`, version `0.3.1`)
- Git whitespace check: passed
