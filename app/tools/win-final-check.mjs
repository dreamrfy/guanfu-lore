// W11 窗口控制三钮一次性完整验证（单次 CDP 会话，避免 WebView2 在 CDP 客户端断开后退出干扰）
// 流程: 连接 → __TAURI__ → 真点最大化/最小化/还原（断言状态）→ 截图 → 真点关闭 → 断言 CDP 不可再连
// 用法: npm run win-final-check （CDP_PORT 默认 9224）
import { chromium } from "playwright-core";

const CDP_PORT = process.env.CDP_PORT || "9224";
const cdp = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 15000 });
const page = cdp.contexts()[0]?.pages().find((p) => p.url().includes("localhost:5173"));
if (!page) {
  console.error("FAIL: 未找到 app 页面");
  process.exit(1);
}
await page.bringToFront();
await page.waitForTimeout(800);

if (!(await page.evaluate(() => Boolean(window.__TAURI__)))) {
  console.error("FAIL: 不在 Tauri 运行时里");
  process.exit(1);
}
const wstate = () =>
  page.evaluate(() => {
    const w = window.__TAURI__.window.getCurrentWindow();
    return Promise.all([w.isMinimized(), w.isMaximized()]).then(([m, x]) => ({ minimized: m, maximized: x }));
  });
console.log("初始状态 =", JSON.stringify(await wstate()));

await page.click('.winbtn[title="最大化"]');
await page.waitForTimeout(1200);
console.log("点最大化后 =", JSON.stringify(await wstate()));
if (!(await wstate()).maximized) {
  console.error("FAIL: 最大化未生效");
  process.exit(1);
}
await page.screenshot({ path: "../docs/验收证据/重做批/W11/窗口控制钮-最大化态.png" });

await page.click('.winbtn[title="最小化"]');
await page.waitForTimeout(1200);
if (!(await wstate()).minimized) {
  console.error("FAIL: 最小化未生效");
  process.exit(1);
}
console.log("点最小化后 = minimized:true");

await page.click('.winbtn[title="最大化"]');
await page.waitForTimeout(1200);
const s3 = await wstate();
console.log("再点最大化钮（还原）=", JSON.stringify(s3));
if (s3.minimized) {
  console.error("FAIL: 未能还原");
  process.exit(1);
}
console.log("PASS: 最小化/最大化/还原 真实生效");

// 关闭：点击后 WebView2 销毁（页面目标关闭 + CDP 端口不可再连）
let targetGone = false;
try {
  await page.click('.winbtn[title="关闭"]');
  await page.waitForTimeout(4000);
} catch {
  targetGone = true; // 页面随窗口销毁 = 关闭生效
}
if (!targetGone) {
  try {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, { signal: AbortSignal.timeout(3000) });
    targetGone = !r.ok;
  } catch {
    targetGone = true;
  }
}
if (!targetGone) {
  console.error("FAIL: 点关闭后 CDP 仍可连 = 窗口没关");
  process.exit(1);
}
console.log("PASS: 关闭钮真实关闭窗口（页面目标已销毁/CDP 不可连）");
process.exit(0);
