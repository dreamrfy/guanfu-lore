// W73 目录视图点验：类型切换改名、纯标题列表、分隔线、无表头/卡片装饰、底部创建记录、点开记录
// 用法: npm run catalog-check
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

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W73/catalog-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};

mkdirSync("../docs/验收证据/重做批/W73", { recursive: true });

await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);

// 建两条记录并填标题
await page.locator("button", { hasText: "新建记录" }).first().click();
await page.waitForTimeout(700);
await page.locator("button", { hasText: "新建记录" }).first().click();
await page.waitForTimeout(700);
await page.locator(".sidebar__list .tree-item").first().click();
await page.waitForTimeout(900);

const hs = (await page.locator(".grid__th-name").allInnerTexts()).map((t) => t.trim());
const titleIdx = hs.indexOf("标题");
console.log("列 =", JSON.stringify(hs));

async function setTitle(rowIdx, text) {
  const cell = page.locator(".grid tbody tr").nth(rowIdx).locator("td.grid__cell").nth(titleIdx);
  await cell.dblclick();
  await page.waitForTimeout(400);
  const input = page.locator(".grid__cell--editing input.cell-input").first();
  await input.fill(text);
  await page.locator(".collection__name").click(); // onBlur 提交
  await page.waitForTimeout(600);
}
await setTitle(0, "目录条目甲");
await setTitle(1, "目录条目乙");

// 切到目录视图
await page.locator(".viewtab__menu").first().click();
await page.waitForTimeout(250);
await page.locator(".viewtab__pop .menu-item", { hasText: "视图设置" }).click();
await page.waitForTimeout(400);
await page.locator(".viewsettings .vs-row", { hasText: "视图类型" }).locator("select").selectOption("catalog");
await page.waitForTimeout(700);
await page.locator(".viewsettings__close").click();
await page.waitForTimeout(700);

// 1) 目录渲染 + 视图名跟随类型
const rows = await page.locator(".catalog__row").count();
const titles = (await page.locator(".catalog__title").allInnerTexts()).map((t) => t.trim());
const tabName = (await page.locator(".viewtab__name").first().innerText()).trim();
console.log("目录行数 =", rows, "| 标题 =", JSON.stringify(titles), "| 标签名 =", tabName);
if (!rows) await fail("未渲染目录列表");
if (tabName !== "目录") await fail("切类型后视图名未跟随（应为「目录」）");
if (!titles.includes("目录条目甲") || !titles.includes("目录条目乙")) await fail("目录标题缺失");

// 2) 纯标题列表：不得有表头 / 网格 / 卡片
const thCount = await page.locator(".catalog th, .catalog thead, .grid__th").count();
const cardCount = await page.locator(".catalog .gallery__card, .catalog .kanban__card").count();
console.log("目录内表头元素 =", thCount, "| 卡片元素 =", cardCount);
if (thCount > 0) await fail("目录里出现了表头（应为纯标题列表）");
if (cardCount > 0) await fail("目录里出现了卡片装饰");

// 3) 每行有分隔线（border-bottom）
const borders = await page.locator(".catalog__row").evaluateAll((els) =>
  els.map((e) => getComputedStyle(e).borderBottomWidth),
);
console.log("行分隔线 =", JSON.stringify(borders));
if (borders.some((b) => b === "0px" || b === "")) await fail("目录行缺少分隔线");

// 4) 每行有页面图标
const iconCount = await page.locator(".catalog__icon").count();
console.log("行图标数 =", iconCount);
if (iconCount !== rows) await fail("目录行缺少页面图标");

// 5) 底部「＋ 创建记录」→ 行数 +1
const before = rows;
await page.locator(".catalog__add").click();
await page.waitForTimeout(900);
const after = await page.locator(".catalog__row").count();
console.log("创建记录: 行数", before, "→", after);
if (after !== before + 1) await fail("创建记录未加到列表");

await page.screenshot({ path: "../docs/验收证据/重做批/W73/目录视图.png" });

// 6) 点行打开记录详情
await page.locator(".catalog__row").first().click();
await page.waitForTimeout(800);
const rightVisible = (await page.locator(".shell__right").count())
  ? await page.locator(".shell__right").first().isVisible()
  : false;
console.log("点行后右侧详情可见 =", rightVisible);
if (!rightVisible) await fail("点行未打开记录详情");
await page.screenshot({ path: "../docs/验收证据/重做批/W73/目录-点行开详情.png" });

await browser.close();
console.log("PASS: 目录纯标题列表/分隔线/页面图标/无表头卡片/底部创建记录/点开记录 全部真实生效");
