// W55 转换为面板点验：网格布局、目标齐、未实现项置灰、当前类型 ✓、点击真转换
// 用法: npm run convertpanel-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W55/convert-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};

await page.click(".tabbar__new");
await page.waitForTimeout(700);
await page.locator(".ProseMirror").first().click();
await page.keyboard.type("转换面板测试");
await page.waitForTimeout(500);

const openPanel = async () => {
  await page.locator(".bn-block[data-id]").first().click({ button: "right" });
  await page.waitForTimeout(350);
  await page.locator(".blockmenu .tabctx__item", { hasText: "转换为" }).click();
  await page.waitForTimeout(400);
  return page.locator(".convertpanel");
};

// 1) 面板形态
const panel = await openPanel();
if (!(await panel.count())) await fail("转换为未打开面板");
const layout = await page.evaluate(() => {
  const g = document.querySelector(".convertpanel__grid");
  const cs = getComputedStyle(g);
  return { cols: cs.gridTemplateColumns.split(" ").length, tiles: g.querySelectorAll(".convertpanel__tile").length };
});
console.log("网格 =", JSON.stringify(layout));
if (layout.cols !== 4) await fail("网格应 4 列");
// 07 §3 列出的 15+ 种：可转换 13 + 未实现 7 = 20 个格子
if (layout.tiles !== 20) await fail("目标应为 20 个（13 可转 + 7 置灰）");

const tiles = await page.locator(".convertpanel__tile").evaluateAll((els) =>
  els.map((e) => ({
    label: e.querySelector(".convertpanel__label")?.textContent?.trim(),
    off: e.className.includes("convertpanel__tile--off"),
    on: e.className.includes("convertpanel__tile--on"),
  })),
);
console.log("目标 =", JSON.stringify(tiles.map((t) => t.label)));
for (const need of ["正文", "待办列表", "页面", "标题1", "标题2", "标题3", "标题4", "项目列表", "编号列表", "折叠列表", "引述文字", "着重文字", "代码片段", "数学公式", "思维导图", "同步块"]) {
  if (!tiles.some((t) => t.label === need)) await fail("缺目标: " + need);
}
const offCount = tiles.filter((t) => t.off).length;
console.log("置灰 =", offCount, "| 当前类型 ✓ =", tiles.filter((t) => t.on).map((t) => t.label));
if (offCount !== 7) await fail("应有 7 项置灰（数学公式/思维导图/折叠标题1-4/同步块）");
if (!tiles.some((t) => t.on)) await fail("当前类型应带 ✓");
await page.screenshot({ path: "../docs/验收证据/重做批/W55/转换为面板.png" });

// 2) 点标题3 → 真转换
await page.locator(".convertpanel__tile", { has: page.locator(".convertpanel__label", { hasText: /^标题3$/ }) }).click();
await page.waitForTimeout(600);
const h3 = await page.locator('[data-content-type="heading"]').count();
const level = await page.evaluate(() => {
  const el = document.querySelector('[data-content-type="heading"]');
  return el?.querySelector("h1,h2,h3,h4,h5,h6")?.tagName;
});
console.log("转换后 heading 数 =", h3, "| 标签 =", level);
if (h3 === 0) await fail("转换为标题3 未生效");
if (level !== "H3") await fail("级别应为 H3（实测 " + level + "）");

// 3) 再次打开 → 标题3 带 ✓
const panel2 = await openPanel();
if (!(await panel2.count())) await fail("再次打开失败");
const onNow = await page.locator(".convertpanel__tile--on .convertpanel__label").allInnerTexts();
console.log("再次打开后的 ✓ =", JSON.stringify(onNow.map((t) => t.trim())));
if (!onNow.some((t) => t.includes("标题3"))) await fail("当前类型 ✓ 未跟上");

await page.screenshot({ path: "../docs/验收证据/重做批/W55/转换为面板-转换后.png" });
await browser.close();
console.log("PASS: 转换为面板 4 列/20 目标（13 可转 + 7 置灰）/✓ 跟随/点击真转换");