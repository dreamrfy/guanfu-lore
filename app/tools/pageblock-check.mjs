// W53 特殊块点验：页面块（新建子页并成卡片）、引用页面块（选页成卡片）、卡片可点跳页、落库
// 用法: npm run pageblock-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W53/pageblock-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};
const slash = async (q) => {
  await page.keyboard.type("/" + q);
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
};

// 准备：当前页命名「宿主页」
await page.locator(".page__title").fill("宿主页");
await page.waitForTimeout(500);
await page.locator(".ProseMirror").first().click();

// 1) 页面块：/ym → 出现「新建子页面」按钮 → 点后生成卡片
await slash("ym");
const btn = page.locator(".pageblock__btn");
if ((await btn.count()) === 0) await fail("页面块未出现「新建子页面」按钮");
page.on("console", (m) => { const t=m.text(); if (t.includes("error")||t.includes("Error")) console.log("[console]", t.slice(0,160)); });
await btn.click();
await page.waitForTimeout(2500);
const card = page.locator('.pageblock:not(.pageblock--empty)');
const cardCount = await card.count();
const cardText = await card.first().innerText().catch(() => "");
console.log("页面块卡片 =", cardCount, "|", cardText.replace(/\s+/g, " ").slice(0, 30));
if (cardCount === 0) await fail("页面块未生成卡片");

// 侧栏应多出一个子页
const rows = await page.locator(".sidebar__list .tree-item:not(.tree-item--starred)").count();
console.log("侧栏行数 =", rows);
if (rows < 2) await fail("页面块未真实建出子页面");

// 2) 引用页面块：换个新页插入 /yyym（避免在不可编辑卡片后找光标）→ 选「宿主页」→ 成卡片
await page.click(".tabbar__new");
await page.waitForTimeout(800);
await page.locator(".page__title").fill("引用页");
await page.waitForTimeout(400);
await page.locator(".ProseMirror").first().click();
await slash("yyym");
const sel = page.locator(".pageblock__select");
if ((await sel.count()) === 0) await fail("引用页面块未出现选择框");
await sel.selectOption({ label: "宿主页" });
await page.waitForTimeout(900);
const cards2 = await page.locator('.pageblock:not(.pageblock--empty)').count();
console.log("引用后卡片数 =", cards2);
if (cards2 < 1) await fail("引用页面块未生成卡片");

// 3) 点引用卡片 → 跳到「宿主页」
await page.locator(".pageblock:not(.pageblock--empty)").first().click();
await page.waitForTimeout(900);
const nowTitle = await page.locator(".page__title").inputValue();
console.log("点引用卡片后标题 =", nowTitle);
if (nowTitle !== "宿主页") await fail("点引用卡片未跳转到宿主页");

// 4) 落库：刷新后两页的块都在（分别核对）
const beforeA = await page.locator('[data-content-type="pageBlock"]').count();
await page.locator(".tab", { hasText: "引用页" }).first().click();
await page.waitForTimeout(700);
const beforeB = await page.locator('[data-content-type="pageBlock"]').count();
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2200);
await page.locator(".tab", { hasText: "引用页" }).first().click();
await page.waitForTimeout(900);
const afterB = await page.locator('[data-content-type="pageBlock"]').count();
await page.locator(".tab", { hasText: "宿主页" }).first().click();
await page.waitForTimeout(900);
const afterA = await page.locator('[data-content-type="pageBlock"]').count();
console.log("刷新前 宿主/引用 =", beforeA, "/", beforeB, " 刷新后 =", afterA, "/", afterB);
if (afterA === 0 || afterB === 0) await fail("页面块/引用块未落库");

await page.screenshot({ path: "../docs/验收证据/重做批/W53/页面块与引用块.png", fullPage: true });
await browser.close();
console.log("PASS: 页面块新建子页、引用页面块选页、卡片可点跳页、刷新后仍在");