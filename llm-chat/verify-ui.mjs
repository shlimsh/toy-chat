import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.resolve(here, "../screenshots");
const chromiumPath = path.resolve(here, "../tmp/chromium");

const browser = await puppeteer.launch({
  args: chromium.args,
  defaultViewport: {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
  },
  executablePath: chromiumPath,
  headless: "shell",
});

const page = await browser.newPage();
const consoleErrors = [];
const pageErrors = [];

page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});
page.on("pageerror", (error) => {
  pageErrors.push(error.message);
});

await page.setRequestInterception(true);
page.on("request", async (request) => {
  const url = request.url();

  if (
    url.startsWith("http://127.0.0.1:5173") ||
    url.startsWith("http://127.0.0.1:3001")
  ) {
    await request.continue();
    return;
  }

  if (url.includes("/data/2.5/weather")) {
    await request.respond({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        weather: [{ main: "Clear", description: "맑음" }],
        main: { temp: 29.2 },
      }),
    });
    return;
  }

  if (url.includes("/data/2.5/forecast")) {
    const now = Math.floor(Date.now() / 1000);
    const list = Array.from({ length: 4 }, (_, index) => {
      const date = new Date((now + (index + 1) * 86400) * 1000);
      const yyyyMmDd = date.toISOString().slice(0, 10);

      return {
        dt: Math.floor(date.getTime() / 1000),
        dt_txt: `${yyyyMmDd} 12:00:00`,
        main: { temp: 28 - index },
        weather: [{ main: index === 1 ? "Clouds" : "Clear", description: "맑음" }],
      };
    });

    await request.respond({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ list }),
    });
    return;
  }

  await request.respond({
    status: 200,
    contentType: "application/json",
    body: "{}",
  });
});

const bodyText = () => page.locator("body").innerText();

const waitForText = async (text) => {
  await page.waitForFunction(
    (expected) => document.body?.innerText.includes(expected),
    { timeout: 10000 },
    text
  );
};

const clickButton = async (label) => {
  const clicked = await page.evaluate((text) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const target = buttons.find((button) => button.innerText.trim() === text);
    if (!target) return false;
    target.click();
    return true;
  }, label);

  assert.equal(clicked, true, `버튼을 찾을 수 없음: ${label}`);
};

const getConversationStyle = async (label) =>
  page.evaluate((text) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const target = buttons.find((button) => button.innerText.trim() === text);
    if (!target) return null;

    const style = getComputedStyle(target);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
    };
  }, label);

const getViewportState = async () =>
  page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    rootScrollWidth: document.documentElement.scrollWidth,
  }));

try {
  await page.goto("http://127.0.0.1:5173/", {
    waitUntil: "networkidle0",
    timeout: 15000,
  });

  let text = await bodyText();
  assert.match(text, /계정 정보를 입력하여 서비스를 시작하세요/);

  await page.type('input[placeholder="이메일"]', "ui-test@example.com");
  await page.type('input[placeholder="비밀번호"]', "safe-test-password");
  await page.click('button[type="submit"]');
  await waitForText("UI 검증 사용자");
  await waitForText("Trace 복원 검증");

  await page.screenshot({
    path: path.join(screenshotDir, "01-login-success.png"),
    fullPage: true,
  });

  await clickButton("Trace 복원 검증");
  await waitForText("저장된 Trace 정보가 복원되었습니다.");
  await waitForText("$0.000559");

  text = await bodyText();
  assert.match(text, /OpenAI 응답입니다/);
  assert.match(text, /Azure AI 응답입니다/);
  assert.match(text, /842 ms/);
  assert.match(text, /1134 ms/);
  assert.match(text, /400/);

  await page.screenshot({
    path: path.join(screenshotDir, "02-trace-restored.png"),
    fullPage: true,
  });

  await page.type('input[placeholder="질문을 입력하세요"]', "UI 전송 검증");
  await clickButton("");
  await waitForText('OpenAI가 "UI 전송 검증"에 답변했습니다.');
  await waitForText('Azure AI가 "UI 전송 검증"에 답변했습니다.');

  await clickButton("이전 대화");
  await waitForText("이전 OpenAI 답변");
  await waitForText("$0.000466");

  await page.reload({ waitUntil: "networkidle0" });
  await waitForText("이전 OpenAI 답변");

  const persistedConversationStyle = await getConversationStyle("이전 대화");
  const desktopViewport = await getViewportState();

  await page.screenshot({
    path: path.join(screenshotDir, "03-reload-history.png"),
    fullPage: true,
  });

  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
  });
  await page.reload({ waitUntil: "networkidle0" });
  await waitForText("이전 OpenAI 답변");

  const mobileViewport = await getViewportState();

  await page.screenshot({
    path: path.join(screenshotDir, "04-mobile.png"),
    fullPage: true,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        desktopViewport,
        mobileViewport,
        persistedConversationStyle,
        consoleErrors,
        pageErrors,
      },
      null,
      2
    )}\n`
  );
} finally {
  await browser.close();
}
