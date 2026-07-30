import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import ErrorBoundary from "./ErrorBoundary.jsx";

function BrokenPage() {
  throw new Error("private frontend stack detail");
}

describe("ErrorBoundary 사용자 화면", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  test("렌더링 오류 원문을 숨기고 복구 안내와 오류 ID를 표시한다", async () => {
    render(
      <ErrorBoundary>
        <BrokenPage />
      </ErrorBoundary>
    );

    expect(screen.getByText("화면을 표시하지 못했습니다.")).toBeTruthy();
    expect(screen.getByText(/페이지를 새로고침해 주세요/)).toBeTruthy();
    expect(screen.getByText(/오류 ID:/)).toBeTruthy();
    expect(screen.queryByText(/private frontend stack detail/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "페이지 새로고침" })
    ).toBeTruthy();
  });
});
