import assert from "node:assert/strict";
import { signToken, verifyToken } from "../auth.mjs";

const API_BASE = "http://127.0.0.1:3001";

describe("auth.mjs", () => {
  it("creates and verifies JWT token", () => {
    const token = signToken({
      id: 1,
      email: "test@example.com",
      name: "홍길동",
    });

    const decoded = verifyToken(token);

    assert.equal(decoded.userId, 1);
    assert.equal(decoded.email, "test@example.com");
    assert.equal(decoded.name, "홍길동");
  });
});

describe("Monitoring API", () => {
  it("returns monitoring summary", async () => {
    const response = await fetch(`${API_BASE}/api/monitoring/summary`);

    assert.equal(response.status, 200);

    const data = await response.json();

    assert.ok(data.range);
    assert.ok(data.metrics);
    assert.ok(data.details);

    assert.ok("cpu" in data.metrics);
    assert.ok("memory" in data.metrics);
    assert.ok("latency" in data.metrics);
    assert.ok("visitors" in data.metrics);

    assert.equal(Array.isArray(data.details.cpuHosts), true);
    assert.equal(Array.isArray(data.details.memoryHosts), true);
    assert.equal(Array.isArray(data.details.latencyResources), true);
    assert.equal(Array.isArray(data.details.visitorsUsers), true);
  });
});