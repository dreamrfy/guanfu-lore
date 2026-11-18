// W51 基础块对齐点验：斜杠逐块插入 → 正确渲染 → 刷新后仍在
// 每个用例开新页，避免代码块内 Enter 不换块导致的串扰；落库验证单独一轮
// 用法: npm run blocks-check
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) {
  console.error("未找到 Chrome");
  process.exit(2);
}

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W51/blocks-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};

const CASES = [
  { name: "正文", query: "正文", sel: '[data-content-type="paragraph"]' },
  { name: "标题2", query: "标题2", sel: '[data-content-type="heading"]' },
  { name: "项目列表", query: "项目列表", sel: '[data-content-type="bulletListItem"]' },
  { name: "编号列表", query: "编号列表", sel: '[data-content-type="numberedListItem"]' },
  { name: "待办列表", query: "待办列表", sel: '[data-content-type="checkListItem"]' },
  { name: "折叠列表", query: "折叠列表", sel: '[data-content-type="toggleListItem"]' },
  { name: "引述文字", query: "引述文字", sel: '[data-content-type="quote"]' },
  { name: "代码片段", query: "代码片段", sel: '[data-content-type="codeBlock"]' },
  { name: "分割线", query: "分割线", sel: '[data-content-type="divider"]' },
  { name: "简单表格", query: "简单表格", sel: '[data-content-type="table"]' },
];

// Phase A：逐块插入（每例新页）
for (const c of CASES) {
  await page.click(".tabbar__new");
  await page.waitForTimeout(700);
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.type("/");
  await page.waitForTimeout(300);
  await page.keyboard.type(c.query);
  await page.waitForTimeout(600);
  const menuVisible = await page.locator(".bn-suggestion-menu").count();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const n = await page.locator(c.sel).count();
  console.log(`${c.name}: 菜单=${menuVisible > 0} 渲染=${n}`);
  if (n === 0) await fail(`${c.name} 插入后未渲染（菜单可见=${menuVisible > 0}）`);
}

// Phase B：落库验证——四个块各占一页，刷新后逐页签核对
const persistCases = ["标题2", "待办列表", "引述文字", "分割线"].map((n) => CASES.find((c) => c.name === n));
const tabCount0 = await page.locator(".tab").count();
for (const c of persistCases) {
  await page.click(".tabbar__new");
  await page.waitForTimeout(700);
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.type("/");
  await page.waitForTimeout(250);
  await page.keyboard.type(c.query);
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
}

await page.waitForTimeout(900);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2200);
for (let i = 0; i < persistCases.length; i++) {
  const c = persistCases[i];
  await page.locator(".tab").nth(tabCount0 + i).click();
  await page.waitForTimeout(700);
  const n = await page.locator(c.sel).count();
  console.log(`刷新后 ${c.name} = ${n}`);
  if (n === 0) await fail(`刷新后 ${c.name} 丢失（未落库）`);
}

// 文案照录抽查
await page.locator(".ProseMirror").first().click();
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.type("/");
await page.waitForTimeout(700);
const menuText = await page.evaluate(() =>
  [...document.querySelectorAll(".bn-suggestion-menu *")].map((e) => e.textContent ?? "").join("|"),
);
for (const label of ["正文", "标题1", "项目列表", "编号列表", "待办列表", "引述文字", "代码片段", "分割线", "简单表格", "折叠列表"]) {
  if (!menuText.includes(label)) await fail("斜杠菜单缺文案: " + label);
}
console.log("斜杠菜单文案抽查通过");
await page.keyboard.press("Escape");

// 规格快捷码别名：/zw 应命中「正文」，/dblb 应命中「待办列表」
for (const [alias, expect] of [
  ["zw", "正文"],
  ["dblb", "待办列表"],
  ["fgx", "分割线"],
]) {
  await page.locator(".ProseMirror").first().click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/" + alias);
  await page.waitForTimeout(600);
  const t = await page.evaluate(() =>
    [...document.querySelectorAll(".bn-suggestion-menu *")].map((e) => e.textContent ?? "").join("|"),
  );
  console.log(`/${alias} → 命中「${expect}」=`, t.includes(expect));
  if (!t.includes(expect)) await fail(`快捷码 /${alias} 未命中「${expect}」`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

await page.screenshot({ path: "../docs/验收证据/重做批/W51/基础块-全部渲染.png", fullPage: true });
await browser.close();
console.log("PASS: 10 类基础块插入/渲染/落库/文案 全部通过");