/**
 * W84 快捷键清单点验（手册 §12 · 浏览器侧实测）
 * 用法: npm run shortcuts-check   （先 npm run dev，SHORTCUTS_BASE 可覆盖端口）
 * 证据: docs/验收证据/重做批/W84/*.png
 *
 * 覆盖：Ctrl+P 全局搜索 / Ctrl+\ 侧栏折叠 / Ctrl+T 新建页签 / Escape 关浮层
 *      / 文本编辑中不抢键（shortcuts.ts isEditingText 守卫）
 * 块级三键（Ctrl+J / Ctrl+D / Ctrl+Shift+P）随 search 后续走查另行点验；
 * Tauri 桌面双验待打包批次（⌘T 标注沿用 shortcuts.ts 内的诚实记录）。
 */
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) {
  console.error("未找到 Chrome");
  process.exit(2);
}

const BASE = process.env.SHORTCUTS_BASE ?? "http://localhost:5174/";
const OUT = "../docs/验收证据/重做批";
mkdirSync(`${OUT}/W84`, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await browser.close();
  process.exit(1);
};

const page = await browser.newPage({ viewport: { width: 1200, height: 762 }, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

// 1) Ctrl+P · 全局搜索浮层
await page.keyboard.press("Control+p");
await page.waitForTimeout(400);
let overlay = await page.locator(".searchpanel").count();
console.log("Ctrl+P 开浮层 =", overlay);
if (!overlay) await fail("Ctrl+P 未打开搜索浮层");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
if (await page.locator(".searchpanel").count()) await fail("Escape 未关闭浮层");
console.log("Escape 关浮层 ✓");

// 2) Ctrl+\ · 侧栏折叠/展开（两次往返）
const sidebarOn = () => page.evaluate(() => document.querySelector(".shell__sidebar")?.className.includes("shell__sidebar--collapsed") ?? false);
const before = await sidebarOn();
await page.keyboard.press("Control+\\");
await page.waitForTimeout(400);
const after1 = await sidebarOn();
await page.keyboard.press("Control+\\");
await page.waitForTimeout(400);
const after2 = await sidebarOn();
console.log("Ctrl+\\ 折叠态", before, "→", after1, "→", after2);
if (after1 === before) await fail("Ctrl+\\ 未切换侧栏折叠");
if (after2 !== before) await fail("Ctrl+\\ 第二次未还原");
await page.screenshot({ path: `${OUT}/W84/侧栏折叠往返.png` });

// 3) Ctrl+T · 新建页签
const tabsBefore = await page.evaluate(() => document.querySelectorAll(".tab").length);
await page.keyboard.press("Control+t");
await page.waitForTimeout(700);
const tabsAfter = await page.evaluate(() => document.querySelectorAll(".tab").length);
console.log("Ctrl+T 页签数", tabsBefore, "→", tabsAfter);
if (tabsAfter <= tabsBefore) await fail("Ctrl+T 未新建页签");
await page.screenshot({ path: `${OUT}/W84/新建页签.png` });

// 3.5) 空行按空格 → 「问 AI」小框（编辑器自带行为，验证 W84 重构没有把它挤掉）
await page.locator(".ProseMirror").first().click();
await page.keyboard.type(" ");
await page.waitForTimeout(400);
const aiask = await page.locator(".aiask").count();
console.log("空行按空格 → AI 小框 =", aiask);
if (!aiask) await fail("空行按空格未唤起「问 AI」小框（W84 重构回归）");
await page.locator(".aiask__input").click();
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
if (await page.locator(".aiask").count()) await fail("AI 小框 Escape 未关闭");

// 4) 文本编辑中不抢键：聚焦标题输入框按 Ctrl+P，浮层不应打开
await page.locator(".page__title").click();
await page.keyboard.press("Control+p");
await page.waitForTimeout(400);
const overlayWhileEditing = await page.locator(".searchpanel").count();
console.log("编辑中 Ctrl+P 开浮层 =", overlayWhileEditing);
if (overlayWhileEditing) await fail("文本编辑中 Ctrl+P 不应抢键开浮层");
console.log("编辑中不抢键 ✓");

// 5) 复原：把焦点移回编辑器正文（失焦标题输入框）后 Ctrl+P 应恢复可用
await page.keyboard.press("Escape");
await page.locator(".ProseMirror").first().click();
await page.keyboard.press("Control+p");
await page.waitForTimeout(400);
overlay = await page.locator(".searchpanel").count();
if (!overlay) await fail("焦点离开输入框后 Ctrl+P 应恢复可用");
await page.screenshot({ path: `${OUT}/W84/搜索浮层.png` });

await browser.close();
console.log("PASS: W84 浏览器侧快捷键实测 ✓（Ctrl+P / Ctrl+\\ / Ctrl+T / Escape / 编辑中不抢键）");
