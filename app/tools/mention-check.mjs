// W45 @ 提及菜单点验：触发、列表、搜索过滤、插入、可点跳页、刷新后仍在
// 用法: npm run mention-check
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
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W45/mention-失败现场.png" });
  await browser.close();
  process.exit(1);
};

// 准备：把当前页命名「目标页甲」
await page.locator(".page__title").fill("目标页甲");
await page.waitForTimeout(600);

// 1) 正文输入 @ → 菜单弹出并列出页面
await page.locator(".ProseMirror").first().click();
await page.keyboard.type("@");
await page.waitForTimeout(900);
const menu = page.locator(".bn-suggestion-menu, .mantine-SuggestionMenu, [class*='suggestionMenu']");
const menuCount = await menu.count();
console.log("菜单节点 =", menuCount);
const texts = await page.evaluate(() =>
  [...document.querySelectorAll(".bn-suggestion-menu *, .mantine-SuggestionMenu *")]
    .map((e) => e.textContent ?? "")
    .join("|"),
);
console.log("菜单文本含目标页 =", texts.includes("目标页甲"));
if (menuCount === 0 && !texts.includes("目标页甲")) await fail("@ 未弹出提及菜单");
await page.screenshot({ path: "../docs/验收证据/重做批/W45/提及菜单.png" });

// 2) 继续输入「甲」→ 过滤后仍命中
await page.keyboard.type("甲");
await page.waitForTimeout(700);
const afterFilter = await page.evaluate(() =>
  [...document.querySelectorAll(".bn-suggestion-menu *")].map((e) => e.textContent ?? "").join("|"),
);
console.log("过滤后含目标页 =", afterFilter.includes("目标页甲"));
if (!afterFilter.includes("目标页甲")) await fail("输入过滤后未命中目标页");

// 3) 回车选中 → 插入提及节点（正文出现 @目标页甲）
await page.keyboard.press("Enter");
await page.waitForTimeout(800);
const mentionCount = await page.locator(".page-mention").count();
const bodyText = await page.locator(".ProseMirror").first().innerText();
console.log("提及节点数 =", mentionCount, "| 正文 =", bodyText.replace(/\s+/g, " ").slice(0, 60));
if (mentionCount === 0) await fail("回车未插入提及节点");
if (!bodyText.includes("@目标页甲") && !bodyText.includes("目标页甲")) await fail("提及节点文案不对");

// 4) 刷新后仍在（真落库）
await page.waitForTimeout(600);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);
const afterReload = await page.locator(".page-mention").count();
console.log("刷新后提及节点数 =", afterReload);
if (afterReload === 0) await fail("提及未落库");

// 5) 可点跳页：建第二页，在它里面 @ 目标页甲，点提及 → 跳到目标页
await page.click(".tabbar__new");
await page.waitForTimeout(800);
await page.locator(".page__title").fill("第二页乙");
await page.waitForTimeout(600);
await page.locator(".ProseMirror").first().click();
await page.keyboard.type("@目标页甲");
await page.waitForTimeout(900);
await page.keyboard.press("Enter");
await page.waitForTimeout(800);
const mention2 = page.locator(".page-mention").first();
if ((await mention2.count()) === 0) await fail("第二页未插入提及");
await mention2.click();
await page.waitForTimeout(800);
const nowTitle = await page.locator(".page__title").inputValue();
console.log("点提及后标题 =", nowTitle);
if (nowTitle !== "目标页甲") await fail("点提及未跳转到目标页");

await page.screenshot({ path: "../docs/验收证据/重做批/W45/提及跳页后.png" });
await browser.close();
console.log("PASS: @ 触发/过滤/插入/落库/点击跳页 全部真实生效");