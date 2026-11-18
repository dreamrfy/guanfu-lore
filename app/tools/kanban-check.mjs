// W71 看板视图点验：类型切换改名、按单选分列、列头计数、创建记录、拖卡换列
// 用法: npm run kanban-check
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W71/kanban-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};

await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);
await page.locator("button", { hasText: "新建记录" }).first().click();
await page.waitForTimeout(700);
await page.locator(".sidebar__list .tree-item").first().click();
await page.waitForTimeout(900);

// 给状态单选加两个选项（通过单元格 chips 面板）
const hs = (await page.locator(".grid__th-name").allInnerTexts()).map((t) => t.trim());
const statusIdx = hs.indexOf("状态");
console.log("列 =", JSON.stringify(hs), "| 状态列 = ", statusIdx);
const statusCell = page.locator(".grid tbody tr").first().locator("td.grid__cell").nth(statusIdx);
await statusCell.click();
await page.waitForTimeout(500);
console.log("单元格类 =", await statusCell.getAttribute("class"), "| 面板数 =", await page.locator(".cell-select").count(), "| 输入数 =", await page.locator(".cell-select__input").count(), "| 记录详情 =", await page.locator(".shell__right").count());
const panel = page.locator(".grid__cell--editing .cell-select").first();
console.log("面板内输入数 =", await panel.locator(".cell-select__input").count());
await panel.locator(".cell-select__input").fill("进行中");
await panel.locator(".cell-select__input").press("Enter");
await page.waitForTimeout(600);
// 单选提交后编辑态关闭 → 建第二个选项要重新点开单元格
await statusCell.click();
await page.waitForTimeout(500);
const panel2 = page.locator(".grid__cell--editing .cell-select").first();
await panel2.locator(".cell-select__input").fill("已完成");
await panel2.locator(".cell-select__input").press("Enter");
await page.waitForTimeout(600);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// 切到看板
await page.locator(".viewtab__menu").first().click();
await page.waitForTimeout(250);
await page.locator(".viewtab__pop .menu-item", { hasText: "视图设置" }).click();
await page.waitForTimeout(400);
await page.locator(".viewsettings .vs-row", { hasText: "视图类型" }).locator("select").selectOption("kanban");
await page.waitForTimeout(600);
await page.locator(".viewsettings__close").click();
await page.waitForTimeout(600);

// 1) 看板渲染 + 改名跟随类型
const cols = (await page.locator(".kanban__name").allInnerTexts()).map((t) => t.trim());
const tabName = (await page.locator(".viewtab__name").first().innerText()).trim();
console.log("看板列 =", JSON.stringify(cols), "| 标签名 =", tabName);
if (!(await page.locator(".kanban").count())) await fail("未渲染看板");
if (!cols.includes("进行中") || !cols.includes("已完成")) await fail("列缺选项");
if (tabName !== "看板") await fail("切类型后视图名未跟随（应为「看板」）");

// 2) 列底创建记录 → 该列计数 +1
const col = (name) => page.locator(".kanban__col").filter({ has: page.locator(".kanban__name", { hasText: name }) });
const countOf = async (name) => Number((await col(name).locator(".kanban__count").innerText()).trim());
const before = await countOf("进行中");
await col("进行中").locator(".kanban__add").click();
await page.waitForTimeout(900);
const after = await countOf("进行中");
console.log("创建记录: 进行中", before, "→", after);
if (after !== before + 1) await fail("创建记录未进对应列");
await page.screenshot({ path: "../docs/验收证据/重做批/W71/看板视图.png" });

// 3) 拖卡换列（HTML5 DnD）：把进行中的卡拖到已完成
const card = col("进行中").locator(".kanban__card").first();
await card.dragTo(col("已完成"));
await page.waitForTimeout(900);
const doneCount = await countOf("已完成");
const doingCount = await countOf("进行中");
console.log("拖卡后: 已完成 =", doneCount, "| 进行中 =", doingCount);
if (doneCount < 1) await fail("拖卡未改列");
if (doingCount !== after - 1) await fail("源列计数未减少");

await page.screenshot({ path: "../docs/验收证据/重做批/W71/看板-拖卡后.png", fullPage: true });
await browser.close();
console.log("PASS: 看板分列/列头计数/创建记录/拖卡换列/类型改名 全部真实生效");