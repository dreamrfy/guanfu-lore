// W27 工作区行点验：211×38 @(8,8)、头像 26×26 圆角 4、⌄ 空间切换菜单真实可用
// 用法: npm run wsrow-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W27/wsrow-失败现场.png" });
  await browser.close();
  process.exit(1);
};

// 1) 几何：行 211×38，相对侧栏 (8,8)，圆角 6；头像 26×26 圆角 4
const geo = await page.evaluate(() => {
  const sb = document.querySelector(".shell__sidebar").getBoundingClientRect();
  const el = document.querySelector(".wsrow");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const av = document.querySelector(".wsrow__avatar").getBoundingClientRect();
  return {
    w: Math.round(r.width),
    h: Math.round(r.height),
    dx: Math.round(r.x - sb.x),
    dy: Math.round(r.y - sb.y),
    radius: getComputedStyle(el).borderRadius,
    avW: Math.round(av.width),
    avH: Math.round(av.height),
    avRadius: getComputedStyle(document.querySelector(".wsrow__avatar")).borderRadius,
  };
});
console.log("工作区行 =", JSON.stringify(geo));
if (!geo) await fail("工作区行不存在");
if (geo.w !== 211 || geo.h !== 38) await fail("工作区行应 211×38");
if (geo.dx !== 8 || geo.dy !== 8) await fail("工作区行应位于 (8,8)");
if (geo.radius !== "6px") await fail("工作区行圆角应 6");
if (geo.avW !== 26 || geo.avH !== 26 || geo.avRadius !== "4px") await fail("头像应 26×26 圆角 4");

// 2) ⌄ 打开空间切换菜单
await page.click(".wsrow");
await page.waitForTimeout(350);
const items = (await page.locator(".tabctx--ws .tabctx__item").allInnerTexts()).map((t) => t.trim());
console.log("空间菜单 =", JSON.stringify(items));
if (items.length === 0) await fail("⌄ 未打开菜单");
if (!items.some((t) => t.includes("本地空间"))) await fail("菜单缺「本地空间」");
await page.screenshot({ path: "../docs/验收证据/重做批/W27/工作区行与空间菜单.png" });

// 3) 未实现的项不许装可用（含「待」字样者应置灰）
const offCount = await page.locator(".tabctx--ws .tabctx__item--off").count();
console.log("置灰项 =", offCount);
if (offCount < 2) await fail("未实现的空间管理项应置灰");

// 4) 收起侧栏真实生效
await page.locator(".tabctx--ws .tabctx__item", { hasText: "收起侧栏" }).click();
await page.waitForTimeout(700);
const collapsed = await page.evaluate(() => {
  const sb = document.querySelector(".shell__sidebar");
  return Math.round(sb.getBoundingClientRect().width);
});
console.log("收起后侧栏宽 =", collapsed);
if (collapsed !== 0) await fail("收起侧栏未生效");
// 展开回来
await page.locator('.shell__main .icon-btn[title="展开侧栏"], .icon-btn[title="切换侧栏"]').first().click().catch(() => {});
await page.waitForTimeout(500);
const back = await page.evaluate(() => Math.round(document.querySelector(".shell__sidebar").getBoundingClientRect().width));
if (back !== 228) {
  // 顶部工具条也有入口；直接用 store 展开以便继续验证截图
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.title && b.title.includes("侧栏"));
    btn?.click();
  });
  await page.waitForTimeout(500);
}
const back2 = await page.evaluate(() => Math.round(document.querySelector(".shell__sidebar").getBoundingClientRect().width));
console.log("再展开后侧栏宽 =", back2);

await page.screenshot({ path: "../docs/验收证据/重做批/W27/工作区行-最终.png" });
await browser.close();
console.log("PASS: 工作区行几何达标、⌄ 菜单可用、收起侧栏生效");