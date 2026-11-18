// W65 单元格编辑器点验：单选/多选 chips 面板（含创建选项）、日期月历（年月/星期一~日/点选提交）
// 用法: npm run cell-editor-check
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
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W65/editor-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};
const addField = async (label) => {
  await page.locator('.grid__add button[title="添加列"]').click();
  await page.waitForTimeout(220);
  await page.locator(".popover .menu-item", { hasText: label }).first().click();
  await page.waitForTimeout(450);
};

await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);
await addField("日期");
await page.locator("button", { hasText: "新建记录" }).first().click();
await page.waitForTimeout(700);
await page.locator(".sidebar__list .tree-item").first().click();
await page.waitForTimeout(1000);

// 1) 单选（状态列，第 2 个字段）单击 → chips 面板
const selCell = page.locator(".grid tbody tr").first().locator("td.grid__cell").nth(1);
await selCell.click();
await page.waitForTimeout(400);
const panel = page.locator(".cell-select");
if ((await panel.count()) === 0) await fail("单选单击未出现 chips 面板");
const ph = await panel.locator(".cell-select__input").getAttribute("placeholder");
console.log("单选面板 placeholder =", ph);
if (ph !== "选择或创建一个选项") await fail("面板缺「选择或创建一个选项」输入");
// 创建选项
await panel.locator(".cell-select__input").fill("进行中");
await panel.locator(".cell-select__input").press("Enter");
await page.waitForTimeout(700);
const chips = await panel.locator(".cell-select__chip").count().catch(() => 0);
const cellText = await selCell.innerText();
console.log("创建后 chips =", chips, "| 单元格 =", cellText.trim());
if (!cellText.includes("进行中")) await fail("创建选项后未选中");

// 2) 多选类似：再建一个多选列
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await addField("多选");
const cells = page.locator(".grid tbody tr").first().locator("td.grid__cell");
const n = await cells.count();
await cells.nth(n - 1).click();
await page.waitForTimeout(400);
const p2 = page.locator(".cell-select");
if ((await p2.count()) === 0) await fail("多选单击未出现面板");
await p2.locator(".cell-select__input").fill("标签A");
await p2.locator(".cell-select__input").press("Enter");
await page.waitForTimeout(500);
await p2.locator(".cell-select__input").fill("标签B");
await p2.locator(".cell-select__input").press("Enter");
await page.waitForTimeout(600);
const multiText = await cells.nth(n - 1).innerText();
console.log("多选单元格 =", multiText.replace(/\s+/g, " "));
if (!multiText.includes("标签A") || !multiText.includes("标签B")) await fail("多选未保存多个值");

// 3) 日期月历
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
const dateIdx = (await page.locator(".grid__th-name").allInnerTexts()).findIndex((t) => t.trim() === "日期");
await cells.nth(dateIdx).click();
await page.waitForTimeout(400);
const cal = page.locator(".cell-cal");
if ((await cal.count()) === 0) await fail("日期未出现月历");
const headTitle = await cal.locator(".cell-cal__title").innerText();
const weeks = (await cal.locator(".cell-cal__wd").allInnerTexts()).map((t) => t.trim());
console.log("月历 =", headTitle, "| 星期 =", JSON.stringify(weeks));
if (!/年\d+月/.test(headTitle)) await fail("月历缺年月标题");
if (weeks.join("") !== "一二三四五六日") await fail("星期表头应为一~日");
const calW = await cal.evaluate((el) => Math.round(el.getBoundingClientRect().width));
console.log("月历宽 =", calW);
if (calW !== 282) await fail("月历宽应 282");
await cal.locator(".cell-cal__cell").nth(10).click();
await page.waitForTimeout(600);
const dateText = await cells.nth(dateIdx).innerText();
console.log("选日期后 =", dateText.trim());
if (!/\d{4}\//.test(dateText)) await fail("点日期未提交");

await page.screenshot({ path: "../docs/验收证据/重做批/W65/编辑器面板.png", fullPage: true });
await browser.close();
console.log("PASS: 单选/多选 chips 面板可创建选项、月历 282/一~日/点选提交");