/**
 * W90 AI 侧边面板形态点验（10 号 §1）
 * 用法: npm run ai-panel-check   （先 npm run dev，AI_BASE 可覆盖端口）
 * 证据: docs/验收证据/重做批/W90/*.png
 *
 * 规格要点：380px 右滑「挤压式」（主区变窄，非覆盖）；右下角 36×36 浮钮文档页内出现；
 * 侧栏 AI 行与浮钮都能开；面板开着时浮钮隐藏。
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

const BASE = process.env.AI_BASE ?? "http://localhost:5174/";
const OUT = "../docs/验收证据/重做批";
mkdirSync(`${OUT}/W90`, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await browser.close();
  process.exit(1);
};

const page = await browser.newPage({ viewport: { width: 1200, height: 762 }, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

// 0) 造一个文档页（浮钮只在文档页内出现）
await page.click(".tabbar__new");
await page.waitForTimeout(700);

// 1) 浮钮形态：36×36 圆形，fixed 右下
const fabBox = await page.locator(".ai-fab").boundingBox();
console.log("浮钮 =", fabBox ? `${Math.round(fabBox.width)}×${Math.round(fabBox.height)} @(${Math.round(fabBox.x)},${Math.round(fabBox.y)})` : "无");
if (!fabBox) await fail("文档页内未见右下角 AI 浮钮");
if (Math.round(fabBox.width) !== 36 || Math.round(fabBox.height) !== 36) await fail("浮钮不是 36×36");

// 2) 侧栏 AI 行点击 → 面板滑出（挤压式）
const mainBefore = await page.locator(".shell__main").boundingBox();
await page.locator('.sidebar__icon[title="AI"]').click();
await page.waitForTimeout(500);
const panel = await page.locator(".shell__ai").count();
const panelBox = panel ? await page.locator(".shell__ai").boundingBox() : null;
const mainAfter = await page.locator(".shell__main").boundingBox();
console.log("面板 =", panel, panelBox ? `宽 ${Math.round(panelBox.width)}` : "", "主区", Math.round(mainBefore.width), "→", Math.round(mainAfter.width));
if (!panel) await fail("侧栏 AI 行未打开挤压面板");
if (!panelBox || Math.round(panelBox.width) !== 380) await fail("面板宽度不是 380");
if (mainAfter.width >= mainBefore.width) await fail("主区没有被挤压（不是挤压式）");
const fabGone = (await page.locator(".ai-fab").count()) === 0;
console.log("面板开着时浮钮隐藏 =", fabGone);
if (!fabGone) await fail("面板开着时浮钮应隐藏");
await page.screenshot({ path: `${OUT}/W90/面板-挤压式.png` });

// 3) AiPanel 内容真渲染（输入框可用）
const input = await page.locator(".shell__ai textarea, .shell__ai input").count();
if (!input) await fail("面板内没有输入框");
await page.screenshot({ path: `${OUT}/W90/面板-内容.png` });

// 4) 再点侧栏 AI 行 → 关闭，主区还原
await page.locator('.sidebar__icon[title="AI"]').click();
await page.waitForTimeout(500);
if (await page.locator(".shell__ai").count()) await fail("再次点击未关闭面板");
const mainRestored = await page.locator(".shell__main").boundingBox();
console.log("关闭后主区还原 =", Math.round(mainRestored.width));
if (Math.round(mainRestored.width) !== Math.round(mainBefore.width)) await fail("关闭后面板主区宽度未还原");
await page.screenshot({ path: `${OUT}/W90/浮钮-文档页.png` });

// 5) 刷新后面板状态持久（prefers 落库）
await page.locator('.sidebar__icon[title="AI"]').click();
await page.waitForTimeout(400);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const panelAfterReload = await page.locator(".shell__ai").count();
console.log("刷新后面板仍开 =", panelAfterReload);
if (!panelAfterReload) await fail("面板开合状态刷新后丢失（未落 prefs）");

await browser.close();
console.log("PASS: W90 挤压式面板 380px ✓ 浮钮 36×36 ✓ 开关/还原/持久 ✓");
