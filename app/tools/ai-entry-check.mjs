/**
 * W93 ⚡ 入口语义点验（10 号规格 · 重要语义修正 + §3）
 * 用法: npm run ai-entry-check   （先 npm run dev，AI_BASE 可覆盖端口）
 * 证据: docs/验收证据/重做批/W93/*.png
 *
 * 规格：
 *  1) 顶栏第 3 图标 ⚡ = 「添加到快速访问」，不是 AI；点击对当前页收藏/取消，
 *     顶栏不再有 AI 弹窗（桌面 AI 入口 = 右下浮钮 + 侧栏 FlowUs AI 行）。
 *  2) 选中文字弹层（SelectionAi）可「在 AI 面板继续问」——与「问问 AI」同一机制
 *     （aiCommand 进 AI 面板，选中原文带进输入框）。
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
mkdirSync(`${OUT}/W93`, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await browser.close();
  process.exit(1);
};

const page = await browser.newPage({ viewport: { width: 1200, height: 762 }, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);
await page.click(".tabbar__new");
await page.waitForTimeout(700);
await page.locator(".ProseMirror").first().click();
await page.keyboard.type("入口语义测试闪电");
await page.waitForTimeout(500);

/* ---------- 1) 顶栏 ⚡ = 添加到快速访问 ---------- */
const boltBtn = page.locator('.toolbar button.icon-btn[title="添加到快速访问"], .toolbar .icon-btn[title="添加到快速访问"]').first();
if (!(await boltBtn.count())) await fail("顶栏没有「添加到快速访问」⚡ 图标");
const oldAiTitle = await page.locator('.toolbar .icon-btn[title="⚡ AI"]').count();
if (oldAiTitle) await fail("顶栏还残留「⚡ AI」入口");

// 点击 → 收藏生效：侧栏出现「快速访问」分组 + flash 提示 + ⚡ 变色变题
await boltBtn.click();
await page.waitForTimeout(500);
const starredGroup = await page.locator('.sidebar__group-label', { hasText: "快速访问" }).count();
if (!starredGroup) await fail("收藏后侧栏没有出现「快速访问」分组");
const flashText = await page.locator("body").innerText();
if (!flashText.includes("已加入快速访问")) await fail("收藏后没有 flash 提示");
const unstarBtn = page.locator('.toolbar .icon-btn[title="从快速访问移除"]').first();
if (!(await unstarBtn.count())) await fail("收藏后 ⚡ title 没变成「从快速访问移除」");
await page.screenshot({ path: `${OUT}/W93/⚡-收藏生效.png` });
console.log("顶栏 ⚡ = 添加到快速访问，收藏真生效（侧栏分组+flash+title 切换） ✓");

// 再点 → 取消收藏
await unstarBtn.click();
await page.waitForTimeout(500);
if (!(await page.locator('.toolbar .icon-btn[title="添加到快速访问"]').count()))
  await fail("取消收藏后 ⚡ title 没还原");
console.log("再点 ⚡ → 从快速访问移除，title 还原 ✓");

// 顶栏无 AI 模态（旧模态已删）：⚡ 点后不应出现「AI 对话」弹窗
await page.locator('.toolbar .icon-btn[title="添加到快速访问"]').first().click();
await page.waitForTimeout(400);
if (await page.locator(".chatmodal").count()) await fail("顶栏 ⚡ 仍打开旧 AI 模态");
console.log("顶栏 ⚡ 不再打开 AI 模态（旧模态已移除） ✓");

/* ---------- 2) 选中文字弹层 → 在 AI 面板继续问 ---------- */
await page.locator(".ProseMirror").first().click(); // ⚡ 点击后焦点在顶栏，先回编辑器再选
await page.keyboard.press("Control+a"); // 全选正文（三击在无头下不触发工具条，键盘选择稳定）
await page.waitForTimeout(800);
const aiBtn = page.locator('.bn-toolbar button', { hasText: "AI" }).first();
if (!(await aiBtn.count())) await fail("选中文字后格式工具条没有出现 AI 按钮");
await aiBtn.click();
await page.waitForTimeout(400);
const dialog = page.locator(".selai");
if (!(await dialog.count())) await fail("点 AI 后没有弹出选中处理弹层");
const contBtn = dialog.locator("button", { hasText: "在 AI 面板继续问" });
if (!(await contBtn.count())) await fail("弹层缺「在 AI 面板继续问」按钮（语义未对齐）");
await page.screenshot({ path: `${OUT}/W93/选区弹层-面板入口.png` });

// 点击 → 右侧面板打开（同一机制）。未配置供应商时先落在配置表单——先配 mock 再验输入框
await contBtn.click();
await page.waitForTimeout(600);
const saveBtn = page.locator(".ai button", { hasText: "保存" });
if (await saveBtn.count()) {
  const cfgInputs = page.locator(".ai input");
  await cfgInputs.nth(0).fill("http://127.0.0.1:8788/v1");
  await cfgInputs.nth(1).fill("mock-key");
  await cfgInputs.nth(2).fill("mock-model");
  await saveBtn.first().click();
  await page.waitForTimeout(500);
  console.log("AI 供应商（mock）已在面板内配置 ✓");
}
const chatInput = page.locator(".ai .ai__row input.clip-input").first();
if (!(await chatInput.count())) await fail("配置后 AI 面板没有出现对话输入框");
const val = await chatInput.inputValue();
if (!val.includes("入口语义测试闪电")) await fail(`输入框没带选中原文：${val}`);
await page.screenshot({ path: `${OUT}/W93/选区转面板-带原文.png` });
console.log("选中文字弹层「在 AI 面板继续问」→ 面板打开、原文入输入框 ✓");

await browser.close();
console.log("W93 ⚡ 入口语义点验全过 PASS");
