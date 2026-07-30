import assert from "node:assert/strict";
import test from "node:test";

import {
  createCorsOptions,
  createResourceTimingMiddleware,
  createServerTimingMiddleware,
  DATADOG_TRACE_HEADERS,
  parseOrigins,
} from "../cors-config.mjs";

test("CORS 기본값은 Vite 개발 주소를 허용한다", () => {
  assert.deepEqual(parseOrigins(""), [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
});

test("Datadog 분산 추적 헤더를 preflight 허용 목록에 포함한다", () => {
  const options = createCorsOptions(["http://localhost:5173"]);

  for (const header of DATADOG_TRACE_HEADERS) {
    assert.ok(options.allowedHeaders.includes(header));
  }

  assert.ok(options.allowedHeaders.includes("X-Request-ID"));
  assert.ok(options.exposedHeaders.includes("X-Request-ID"));
});

test("허용되지 않은 Origin은 표준 CORS 오류 코드로 거부한다", async () => {
  const options = createCorsOptions(["http://localhost:5173"]);

  await new Promise((resolve) => {
    options.origin("https://not-allowed.example", (error) => {
      assert.equal(error?.code, "CORS_NOT_ALLOWED");
      resolve();
    });
  });
});

test("Resource Timing 응답 헤더를 설정한다", () => {
  const headers = new Map();
  const middleware = createResourceTimingMiddleware("*");

  middleware(
    {},
    {
      setHeader(name, value) {
        headers.set(name, value);
      },
    },
    () => {}
  );

  assert.equal(headers.get("Timing-Allow-Origin"), "*");
});

test("Resource Timing은 허용된 요청 Origin만 응답한다", () => {
  const headers = new Map();
  const middleware = createResourceTimingMiddleware([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);

  middleware(
    { headers: { origin: "http://localhost:5173" } },
    {
      setHeader(name, value) {
        headers.set(name, value);
      },
    },
    () => {}
  );

  assert.equal(headers.get("Timing-Allow-Origin"), "http://localhost:5173");
});

test("백엔드 처리 시간을 Server-Timing으로 기록한다", () => {
  const headers = new Map();
  const response = {
    headersSent: false,
    setHeader(name, value) {
      headers.set(name, value);
    },
    end() {
      return "ended";
    },
  };
  const middleware = createServerTimingMiddleware();

  middleware({}, response, () => {});

  assert.equal(response.end(), "ended");
  assert.match(
    headers.get("Server-Timing"),
    /^app;dur=\d+\.\d{2};desc="toy-chat backend"$/
  );
});
