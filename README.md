# toy-chat Phase 10 — Datadog Browser SDK v7 마이그레이션

Phase 9의 RUM Source Map 릴리스 흐름과 기존 관측성 기능을 유지하면서
Datadog Browser RUM, Browser Logs, React 통합 패키지를 v6에서 v7로
마이그레이션한 전체 적용본입니다.

## v7 마이그레이션 결과

세 Browser SDK 패키지를 호환되는 동일 버전으로 고정했습니다.

```text
@datadog/browser-rum        6.33.0 → 7.6.1
@datadog/browser-logs       6.33.0 → 7.6.1
@datadog/browser-rum-react  6.33.0 → 7.6.1
```

이 프로젝트는 npm 번들 방식을 사용하므로 CDN `<script>`의
`crossorigin="anonymous"` 변경은 대상이 아닙니다.

전체 소스를 검사한 결과 다음 v7 제거 항목은 기존 코드에서 사용하지
않고 있었습니다.

- `betaEncodeCookieOptions`
- `allowFallbackToLocalStorage`
- `trackBfcacheViews`
- `trackEarlyRequests`
- `betaTrackActionsInShadowDom`
- `usePciIntake`
- 반환값을 저장하는 구형 `startDurationVital` 호출
- v6 CDN URL

## 동작 호환성을 위해 명시한 설정

Browser SDK v7의 기본 동작 변경이 예기치 않은 장애로 이어지지 않도록
다음 정책을 코드에 명시했습니다.

```js
datadogRum.init({
  defaultPrivacyLevel: "mask-user-input",
  enablePrivacyForActionName: true,
  propagateTraceBaggage: false,
  // ...
});

datadogLogs.init({
  forwardErrorsToLogs: true,
  forwardConsoleLogs: ["warn", "error"],
  // ...
});
```

- `forwardErrorsToLogs`는 처리되지 않은 오류와 네트워크 오류 전달을
  유지합니다.
- v7에서 분리된 `console.error()` 수집은
  `forwardConsoleLogs: ["warn", "error"]`로 유지합니다.
- 개인정보 보호 수준과 Action 이름 보호 정책을 명시적으로 고정합니다.
- v7에서 기본 활성화된 Trace Baggage는 우선 `false`로 고정했습니다.
  현재 `allowedTracingUrls`에 로컬 백엔드뿐 아니라 외부 API Gateway도
  포함되어 있어, 모든 Gateway가 `baggage` 요청 헤더를 허용하기 전에
  활성화하면 CORS 오류가 발생할 수 있기 때문입니다.
- 백엔드 CORS는 이미 `baggage`를 허용하고 테스트까지 추가했으므로,
  외부 API Gateway의 `Access-Control-Allow-Headers`에도 `baggage`를
  추가한 뒤 `propagateTraceBaggage: true`로 전환할 수 있습니다.

RUM과 Browser Logs 이벤트에는 다음 확인 속성이 추가됩니다.

```text
release.browser_sdk_major:7
```

Datadog 검색 예:

```text
service:shlim-toy-chat-front @release.browser_sdk_major:7
```

## 자동 마이그레이션 검증

`npm run build` 전에 `npm run verify:rum-v7`이 자동 실행됩니다.
다음 상태가 발견되면 빌드를 중단합니다.

- RUM·Logs·React 통합 패키지의 major 또는 patch 버전 불일치
- v7에서 제거된 초기화 옵션
- v6 CDN URL
- `startDurationVital()` 반환값을 저장하는 구형 호출
- 개인정보 보호·Trace Baggage 정책 누락
- `forwardErrorsToLogs` 또는 `console.error()` 수집 설정 누락

수동으로 먼저 검사하려면 다음 명령을 실행합니다.

```powershell
cd C:\shlim\toy-chat-2\llm-chat
npm run verify:rum-v7
```

## 적용 전 확인할 Datadog 동작 변경

- 세션 쿠키 저장소가 `_dd_s`에서 `_dd_s_v2`로 자동 마이그레이션됩니다.
  쿠키 허용 목록을 운영한다면 `_dd_s_v2`를 추가해야 합니다.
- 세션 갱신 View는 `@view.loading_type:session_renewal`로 수집됩니다.
  `route_change`만 조회하는 대시보드·모니터가 있다면 조건을 보완합니다.
- FID는 더 이상 수집되지 않으므로 INP를 사용합니다.
- 취소된 fetch/XHR은 Browser Logs의 네트워크 오류로 남지 않습니다.
- document Resource의 `initiatorType`은 `initial_document` 대신
  `navigation`을 사용합니다.
- Action 이름은 CSS가 적용된 `innerText`가 아니라 `textContent` 기준입니다.
  이 프로젝트에는 `text-transform` 기반 버튼 이름이 없어 추가 변경하지
  않았습니다.
- v7의 결정적 Trace 샘플링으로 RUM 연계 APM Cross-Product Retention
  Filter의 인덱싱 Span이 증가할 수 있습니다. 적용 후 필터의 예상 볼륨과
  비용을 확인해야 합니다.
- 최소 지원 브라우저는 Chrome 80+, Firefox 78+, Safari 14+입니다.

Vite 프로덕션 빌드에서 v7 비동기 청크는 다음처럼 생성됩니다.

```text
assets/datadogRecorder-*.js
assets/datadogProfiler-*.js
```

현재처럼 CSP에서 자체 정적 파일을 `script-src 'self'`로 허용하면 추가
변경이 필요하지 않습니다. 파일명 기반 허용 목록을 사용한다면
`datadog*-*.js` 패턴을 반영합니다.

## Phase 9 Source Map 기능 유지

## 이번 오류의 정확한 원인

백엔드 콘솔의 다음 옵션은 Node.js 런타임 Stack을 원본 파일 위치로
복원하는 옵션입니다.

```text
node --enable-source-maps --env-file=.env --import dd-trace/initialize.mjs index.mjs
```

이 옵션은 React/Vite 브라우저 번들의 Source Map을 Datadog RUM에
업로드하지 않습니다.

기존 프런트 설정은 `build.sourcemap: "hidden"`이라 `.map` 파일은
생성했지만, Datadog 업로드 명령이 빌드 과정에 연결되어 있지 않았습니다.
따라서 Datadog Debug Symbols에는 해당 `service + version + minified URL`의
Source Map이 존재하지 않았습니다.

캡처의 `src/App.jsx at line 767:30`은 `npm run dev`로 실행한 Vite 개발
서버의 비압축 소스입니다. 이미 원본 파일과 줄 번호가 표시되므로
`Unminification failed` 안내를 무시해도 됩니다. 실제 Source Map 동작은
프로덕션 번들인 `/assets/index-*.js`에서 확인해야 합니다.

## 적용 방법

압축 안의 두 폴더를 기존 프로젝트 루트
`C:\shlim\toy-chat-2`에 폴더 단위로 덮어씁니다.

```text
toy-chat-phase10-browser-sdk-v7/
├─ llm-chat-back/
└─ llm-chat/
```

실제 `.env`, API Key, DB 비밀번호, `node_modules`, `dist`, 실행 로그는
포함하지 않았습니다. 기존 `llm-chat-back\.env`는 그대로 유지됩니다.

```powershell
cd C:\shlim\toy-chat-2\llm-chat-back
npm install

cd C:\shlim\toy-chat-2\llm-chat
npm install
```

기본 로컬 데모 주소는 `http://localhost:5173`이며 별도 설정이 없어도
다음 기본값을 사용합니다.

```dotenv
VITE_DD_MINIFIED_PATH_PREFIX=http://localhost:5173/assets
VITE_DD_PROJECT_PATH=llm-chat
```

다른 도메인이나 하위 경로에 배포하면 `llm-chat\.env.local`에 실제
JavaScript 번들이 노출되는 절대 URL을 설정합니다.

```dotenv
VITE_DD_MINIFIED_PATH_PREFIX=https://example.com/assets
```

## Source Map 릴리스

프런트 폴더에서 다음 명령을 실행합니다.

```powershell
cd C:\shlim\toy-chat-2\llm-chat
npm run release:rum
```

한 명령에서 다음 순서가 실행됩니다.

1. 백엔드 `DD_VERSION`과 프런트 `VITE_DD_VERSION`을 같은 patch 버전으로
   동기화합니다.
2. Vite 프로덕션 번들과 hidden Source Map을 생성합니다.
3. 모든 JavaScript 번들에 대응하는 `.map`이 있는지 검증합니다.
4. `App.jsx`, `main.jsx`, `ErrorBoundary.jsx`와 `sourcesContent` 포함 여부를
   검증합니다.
5. RUM과 동일한 `service`, `version`, `minified path prefix`로 Datadog에
   업로드합니다.
6. 업로드 성공 후 배포 폴더에서 `.map`만 제거해 원본 소스가 웹에
   노출되지 않도록 합니다.

업로드용 API Key와 Site는 기존 `llm-chat-back\.env`의 `DD_API_KEY`,
`DD_SITE`를 사용하며 콘솔에 Key를 출력하지 않습니다. 업로드가 실패하면
명령이 즉시 중단되고 `.map`은 남아 있으므로 원인을 수정한 뒤 다시
실행할 수 있습니다.

릴리스 설정만 먼저 확인하려면 다음 명령을 사용합니다.

```powershell
npm run sourcemaps:plan
```

예상 출력:

```text
service: shlim-toy-chat-front
version: <현재 DD_VERSION과 동기화된 값>
minified path prefix: http://localhost:5173/assets
API key: configured
```

## 프로덕션 번들로 확인

`release:rum`이 성공한 뒤 개발 서버가 실행 중이면 먼저 종료하고 다음
명령을 실행합니다.

```powershell
npm run preview:rum
```

브라우저에서 `http://localhost:5173`을 열고 새로운 프런트 오류를
발생시킵니다. `npm run dev`가 아니라 `preview:rum`에서 만든 **새 오류**
여야 합니다.

확인 항목:

1. RUM 오류의 `service`가 `shlim-toy-chat-front`인지 확인합니다.
2. RUM 오류의 `version`이 `sourcemaps:plan`에 표시된 값과 같은지
   확인합니다.
3. 오류 Stack의 JavaScript URL이
   `http://localhost:5173/assets/*.js`인지 확인합니다.
4. RUM Debug Symbols에서 같은 서비스와 버전의 업로드 파일을
   확인합니다.
5. Stack Trace에 원본 `src/App.jsx`의 함수명·줄·열이 표시되는지
   확인합니다.

캡처에 있던 과거 `version:0.2.6` 개발 서버 오류는 새 프로덕션
Source Map의 대상이 아닙니다. 실제 적용 환경에서는 기존
`DD_VERSION`을 기준으로 다음 patch 값이 한 번 생성됩니다.

## 추가된 릴리스 보호 장치

- `emptyOutDir: true`로 과거 hash의 번들이 `dist`에 남는 문제 방지
- Vite 개발·Preview 서버의 `5173` 포트 고정
- 모든 `.js`와 `.js.map`의 1:1 대응 검증
- Source Map v3, `file`, `sources`, `sourcesContent` 검증
- hidden Source Map의 `sourceMappingURL` 노출 여부 검증
- `service`, `version`, 절대 URL prefix 불일치 시 업로드 전 실패
- `@datadog/datadog-ci`를 검증한 `5.21.2`로 고정
- RUM과 Browser Logs에 다음 릴리스 컨텍스트 추가

```text
release.build_mode
release.browser_sdk_major
release.source_maps_expected
release.minified_path_prefix
```

`npm run dev` 이벤트는 `build_mode:development`,
`source_maps_expected:false`이고, 프로덕션 빌드는
`build_mode:production`, `source_maps_expected:true`입니다.

## 기존 기능 유지

- OpenAI·Azure AI 중 하나만 성공해도 `200 partial_success` 반환
- 두 제공자가 모두 실패할 때만 `503`
- 제공자별 `llm.provider.request` 오류 Span
- 부모 `POST /chat`의 집계 오류 상세
- `/health/live`, `/health/ready`
- OpenAI·Azure·Embedding 요청 Timeout
- `SIGINT`, `SIGTERM` 안전 종료
- 브라우저 요청 취소와 Timeout 구분
- `Timing-Allow-Origin`, `Server-Timing`
- 로그인 실패 APM·Error Tracking·RUM 상세
- `request_id` 기반 RUM → APM → Logs 연결
- 소스 변경 시 Datadog 버전 patch 1회 증가

## 자동 검증 결과

- 백엔드 테스트 28건
- 프런트 단위·UI·Source Map·v7 설정 테스트 21건
- Browser SDK v7 정적 마이그레이션 검사 통과
- RUM·Logs·React 통합 패키지 7.6.1 정렬 확인
- Vite 프로덕션 빌드 성공
- JavaScript 번들 20개와 Source Map 20개의 1:1 대응 확인
- `App.jsx`와 `sourcesContent` 포함 확인
- hidden Source Map 확인
- `service:shlim-toy-chat-front`, 검증 빌드 `version:0.2.9`,
  `http://localhost:5173/assets` 업로드 계획 확인
- 실제 Datadog 업로드는 사용자의 기존 API Key로 `npm run release:rum`
  실행 시 수행

## 공식 문서

- https://docs.datadoghq.com/real_user_monitoring/guide/browser-sdk-upgrade/
- https://github.com/DataDog/browser-sdk/blob/main/CHANGELOG.md
- https://docs.datadoghq.com/real_user_monitoring/guide/upload-javascript-source-maps/
- https://docs.datadoghq.com/real_user_monitoring/error_tracking/browser/
