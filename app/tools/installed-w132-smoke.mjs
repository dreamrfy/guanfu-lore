// W132 终版真装冒烟：外壳 → 开页签 → 编辑器 → 多维表（建表/建记录）→ 关窗。
// 前置: 安装版 exe 以 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9226 启动
// 用法: npm run installed-w132-smoke
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const CDP_PORT = process.env.CDP_PORT || "9226";
const OUT = "../docs/验收证据/重做批/W132";
mkdirSync(OUT, { recursive: true });

let cdp;
for (let i = 0; i < 20; i++) {
  try {
    cdp = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 3000 });
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
if (!cdp) {
  console.error("FAIL: 连不上安装版 CDP 9226");
  process.exit(1);
}
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
    await page.screenshot({ path: OUT + "/冒烟-失败现场.png" });
  } catch { /* 窗口可能已关 */ }
  process.exit(1);
};

if (!(await page.evaluate(() => Boolean(window.__TAURI__)))) {
  await fail("不在 Tauri 运行时（release 包 withGlobalTauri 未生效?）");
}
console.log("Tauri 运行时 ✓（安装版 0.1.0 终版）");

// 1) 外壳
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + "/冒烟1-外壳.png" });

// 2) 开页签
await page.click(".tabbar__new");
await page.waitForTimeout(800);
const tabs = await page.locator(".tab").count();
console.log("开页签后页签数 =", tabs);
if (tabs < 2) await fail("安装版开页签未生效");
await page.screenshot({ path: OUT + "/冒烟2-开页签.png" });

// 3) 编辑器：在新页签里真敲字
const editor = page.locator(".bn-editor [contenteditable=true], .ProseMirror").first();
await editor.click();
await page.keyboard.type("W132 安装版编辑器冒烟：这块文字要能保存。");
await page.waitForTimeout(600);
const editorText = await page.evaluate(() => document.body.innerText);
if (!editorText.includes("W132 安装版编辑器冒烟")) await fail("编辑器输入未生效");
await page.screenshot({ path: OUT + "/冒烟3-编辑器.png" });

// 4) 多维表：新建表格 → 新建记录
await page.locator('.groupbtn[title="新建表格"]').click();
await page.locator(".collection").waitFor({ timeout: 8000 });
await page.locator('.collection__head button:has-text("新建记录")').click();
await page.waitForTimeout(800);
const rows = await page
  .locator(".collection__scroll tbody tr")
  .evaluateAll((tr) => tr.filter((r) => r.querySelector(".grid__idx")).length);
console.log("多维表记录行数 =", rows);
if (rows < 1) await fail("多维表新建记录未生效");
await page.screenshot({ path: OUT + "/冒烟4-多维表.png" });

// 关窗（真实关闭安装版窗口 → 应用退出）
let gone = false;
try {
  await page.click('.winbtn[title="关闭"]');
  await page.waitForTimeout(4000);
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, { signal: AbortSignal.timeout(3000) });
  gone = !r.ok;
} catch {
  gone = true; // 页面/浏览器随窗口销毁 = 关闭生效
}
if (!gone) await fail("关窗未生效");
console.log("PASS: W132 安装版冒烟全过（外壳/页签/编辑器/多维表/关窗），CDP 已随窗口销毁");
process.exit(0);