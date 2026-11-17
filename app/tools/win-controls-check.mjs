// W11 窗口控制钮 Tauri 运行时真实验证：经 WebView2 CDP 连接，真实点击三钮并断言窗口状态
// 前置: WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 启动 tauri dev
// 用法: npm run win-controls-check
import { chromium } from "playwright-core";

const cdp = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 15000 });
const ctx = cdp.contexts()[0];
if (!ctx) {
  console.error("FAIL: CDP 无 context");
  process.exit(1);
}
let page = null;
for (const p of ctx.pages()) {
  if (p.url().includes("localhost:5173")) page = p;
}
if (!page) {
  console.error("FAIL: 未找到 app 页面，现有: " + ctx.pages().map((p) => p.url()).join(", "));
  process.exit(1);
}
await page.bringToFront();
await page.waitForTimeout(1000);

const hasTauri = await page.evaluate(() => Boolean((window as never as { __TAURI__?: unknown }).__TAURI__));
console.log("__TAURI__ 存在 =", hasTauri);
if (!hasTauri) {
  console.error("FAIL: 不在 Tauri 运行时里");
  process.exit(1);
}

const wstate = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const w = (
          window as unknown as {
            __TAURI__: { window: { getCurrentWindow: () => Record<string, () => Promise<boolean>> } };
          }
        ).__TAURI__.window.getCurrentWindow();
        Promise.all([w.isMinimized(), w.isMaximized()]).then(([m, x]) =>
          resolve({ minimized: m, maximized: x }),
        );
      }),
  ) as Promise<{ minimized: boolean; maximized: boolean }>;

const fail = async (msg: string) => {
  console.error("FAIL: " + msg);
  process.exit(1);
};

console.log("初始状态 =", JSON.stringify(await wstate()));

// 1) 最大化
await page.click('.winbtn[title="最大化"]');
await page.waitForTimeout(1200);
const s1 = await wstate();
console.log("点最大化后 =", JSON.stringify(s1));
if (!s1.maximized) await fail("最大化未生效");
await page.screenshot({ path: "../docs/验收证据/重做批/W11/窗口控制钮-最大化态.png" });

// 2) 最小化
await page.click('.winbtn[title="最小化"]');
await page.waitForTimeout(1200);
const s2 = await wstate();
console.log("点最小化后 =", JSON.stringify(s2));
if (!s2.minimized) await fail("最小化未生效");

// 3) 还原（再点最大化钮：最小化状态下 toggle 应还原）
await page.click('.winbtn[title="最大化"]');
await page.waitForTimeout(1200);
const s3 = await wstate();
console.log("再点最大化钮后 =", JSON.stringify(s3));
if (s3.minimized) await fail("窗口未能还原");

console.log("PASS-阶段1: 最小化/最大化真实生效（关闭钮单独验证）");
process.exit(0);
