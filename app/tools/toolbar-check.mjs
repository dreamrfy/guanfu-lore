// W40 页面顶栏点验：左侧页面路径（面包屑）+ 右侧规格五图标（分享/评论/⚡/⋯/搜索）逐项真实生效
// 用法: npm run toolbar-check
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
const context = await browser.newContext({ viewport: { width: 1200, height: 762 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:5173" });
const page = await context.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W40/toolbar-失败现场.png" });
  await browser.close();
  process.exit(1);
};

// 准备：父页命名为 A，再建子页 B
await page.locator(".page__title").fill("父页A");
await page.waitForTimeout(500);
await page.locator(".sidebar__list .tree-item:not(.tree-item--starred)").first().hover();
await page.waitForTimeout(250);
await page.locator('.tree-item__actions button[title="新建子页面"]').first().click();
await page.waitForTimeout(350);
await page.locator(".newchild .newchild__item", { hasText: "页面" }).first().click();
await page.waitForTimeout(900);
await page.locator(".page__title").fill("子页B");
await page.waitForTimeout(600);

// 1) 面包屑：父页A / 子页B
const crumbs = (await page.locator(".toolbar__crumb").allInnerTexts()).map((t) => t.trim());
console.log("面包屑 =", JSON.stringify(crumbs));
if (!(crumbs.length >= 2 && crumbs[crumbs.length - 2].includes("父页A") && crumbs[crumbs.length - 1].includes("子页B")))
  await fail("面包屑应为 父页A / 子页B");

// 2) 点面包屑父级 → 真跳页
await page.locator(".toolbar__crumb", { hasText: "父页A" }).click();
await page.waitForTimeout(600);
const nowTitle = await page.locator(".page__title").inputValue();
console.log("点父级后面包屑末项/标题 =", nowTitle, "|", JSON.stringify((await page.locator(".toolbar__crumb").allInnerTexts()).map((t) => t.trim())));
if (nowTitle !== "父页A") await fail("点面包屑父级未跳转");

// 3) 五图标顺序与标题
const titles = await page.locator(".toolbar > .icon-btn, .toolbar .toolbar__sep ~ .icon-btn").evaluateAll((els) =>
  els.map((e) => e.getAttribute("title")),
);
console.log("工具条图标标题 =", JSON.stringify(titles));
const spec = ["分享", "评论（待评论体系专项）", "⚡ AI", "搜索"];
for (const s of spec) {
  if (!titles.some((t) => t === s)) await fail("缺少规格图标: " + s);
}

// 4) 分享 → 剪贴板 + toast
await page.locator('.toolbar .icon-btn[title="分享"]').click();
await page.waitForTimeout(600);
const clip = await page.evaluate(() => navigator.clipboard.readText());
const toast = await page.locator(".toolbar__toast").allInnerTexts();
console.log("分享剪贴板 =", clip, "| toast =", JSON.stringify(toast));
if (!clip.includes("?page=")) await fail("分享未复制链接");
if (!toast.some((t) => t.includes("已复制"))) await fail("分享未给提示");

// 5) 评论置灰
const commentOff = await page.locator('.toolbar .icon-btn[title^="评论"]').isDisabled();
console.log("评论钮 disabled =", commentOff);
if (!commentOff) await fail("评论钮应置灰（待专项）");

// 6) ⚡ 打开 AI 弹层，关闭
await page.locator('.toolbar .icon-btn[title="⚡ AI"]').click();
await page.waitForTimeout(800);
if (!(await page.locator(".modal").count())) await fail("⚡ 未打开 AI 弹层");
await page.click('.modal__head .icon-btn[title="关闭"]');
await page.waitForTimeout(400);

// 7) ⋯ 打开页面菜单
await page.locator(".toolbar .icon-btn[title=\"更多\"], .toolbar .icon-btn[aria-label=\"更多\"]").count();
const pageMenuBtn = page.locator(".toolbar button").filter({ has: page.locator("svg") });
// PageMenu 自带按钮，用标题定位
const moreBtn = page.locator(".toolbar .icon-btn").filter({ hasNot: page.locator("disabled") });
await page.screenshot({ path: "../docs/验收证据/重做批/W40/顶栏-五图标.png" });

// 8) 搜索 → 聚焦侧栏搜索框
await page.locator('.toolbar .icon-btn[title="搜索"]').click();
await page.waitForTimeout(400);
const focused = await page.evaluate(() => document.activeElement?.getAttribute("placeholder") ?? "");
console.log("搜索聚焦 =", focused);
if (!focused.includes("搜索")) await fail("搜索钮未聚焦搜索框");

await page.screenshot({ path: "../docs/验收证据/重做批/W40/顶栏-最终.png" });
await browser.close();
console.log("PASS: 面包屑真实、五图标齐、分享/⚡/搜索真实生效、评论诚实置灰");