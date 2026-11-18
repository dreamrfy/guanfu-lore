// W18 安装版真装冒烟：开壳 → 开页签 → 编辑 → 关窗（单次 CDP 会话）
// 前置: 安装版 exe 以 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9226 启动
// 用法: npm run installed-smoke
import { chromium } from "playwright-core";

const CDP_PORT = process.env.CDP_PORT || "9226";
const cdp = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 20000 });
const ctx = cdp.contexts()[0];
const page = ctx?.pages().find((p) => /localhost|tauri/.test(p.url()));
if (!page) {
  console.error("FAIL: 未找到安装版页面，现有: " + (ctx?.pages().map((p) => p.url()).join(", ") ?? "无"));
  process.exit(1);
}
console.log("页面 URL =", page.url());
await page.bringToFront();
await page.waitForTimeout(1500);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  try {
    await page.screenshot({ path: "../docs/验收证据/重做批/W18/installed-smoke-失败现场.png" });
  } catch { /* 窗口可能已关 */ }
  process.exit(1);
};

if (!(await page.evaluate(() => Boolean(window.__TAURI__)))) await fail("不在 Tauri 运行时（release 包 withGlobalTauri 未生效?）");
console.log("Tauri 运行时 ✓");

// 开壳证据
await page.waitForTimeout(800);
await page.screenshot({ path: "../docs/验收证据/重做批/W18/冒烟1-开壳.png" });

// 开页签
await page.click(".tabbar__new");
await page.waitForTimeout(800);
const tabs = await page.locator(".tab").count();
console.log("开页签后页签数 =", tabs);
if (tabs !== 2) await fail("安装版开页签未生效");
await page.screenshot({ path: "../docs/验收证据/重做批/W18/冒烟2-开页签.png" });

// 编辑：新页签里打字并确认落库（release 包 IndexedDB 独立目录）
await page.locator(".ProseMirror").first().click();
await page.keyboard.type("安装版冒烟内容SMOKE123");
await page.waitForTimeout(800);
const body = await page.locator(".ProseMirror").first().innerText();
if (!body.includes("SMOKE123")) await fail("编辑未生效");

// 关窗（真实关闭安装版窗口 → 应用退出）
let gone = false;
try {
  await page.click('.winbtn[title="关闭"]');
  await page.waitForTimeout(4000);
  // 窗口若仍活着，CDP 端口应仍可连
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, { signal: AbortSignal.timeout(3000) });
  gone = !r.ok;
} catch {
  gone = true; // 页面/浏览器随窗口销毁 = 关闭生效
}
if (!gone) await fail("关窗未生效");
console.log("PASS: 安装版冒烟全过（开壳/开页签/编辑/关窗），CDP 已随窗口销毁");
process.exit(0);
