// W64 单元格语义点验：单击选中（蓝框）/ 双击编辑（行高60）/ ESC 取消不提交 / 单选单击即编辑 / 系统字段不可编辑
// 用法: npm run cell-semantics-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W64/cell-失败现场.png", fullPage: true });
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
await addField("单选");
await addField("创建时间");
// 一条记录
await page.locator("button", { hasText: "新建记录" }).first().click();
await page.waitForTimeout(700);
await page.locator(".sidebar__list .tree-item").first().click();
await page.waitForTimeout(1000);

// 标题输入一句正文
const titleCell = page.locator(".grid tbody tr").first().locator("td.grid__cell").first();
await titleCell.dblclick();
await page.waitForTimeout(300);
await titleCell.locator("input").fill("原文");
await page.keyboard.press("Tab");
await page.waitForTimeout(600);

// 1) 单击 → 选中蓝框，不出现输入框
await titleCell.click();
await page.waitForTimeout(300);
const sel = await titleCell.evaluate((el) => el.className.includes("grid__cell--selected"));
const inputs = await titleCell.locator("input").count();
console.log("单击后: 选中 =", sel, "输入框 =", inputs);
if (!sel) await fail("单击未出现选中态");
if (inputs !== 0) await fail("单击不应进入编辑");

// 2) 双击 → 编辑，单元格高 60
await titleCell.dblclick();
await page.waitForTimeout(400);
const editing = await titleCell.evaluate((el) => el.className.includes("grid__cell--editing"));
const h = await titleCell.evaluate((el) => Math.round(el.getBoundingClientRect().height));
console.log("双击后: 编辑类 =", editing, "高 =", h);
if (!editing) await fail("双击未进入编辑");
if (h !== 60) await fail("编辑态行高应 60（实测 " + h + "）");

// 3) ESC 取消：输入新值后 ESC，不提交
await titleCell.locator("input").fill("不应保存");
await page.keyboard.press("Escape");
await page.waitForTimeout(600);
const afterEsc = await titleCell.innerText();
console.log("ESC 后单元格 =", afterEsc.trim());
if (afterEsc.includes("不应保存")) await fail("ESC 未取消提交");

// 4) 单选：单击直接进入编辑（出现选项面板或提示）
const selectCell = page.locator(".grid tbody tr").first().locator("td.grid__cell").nth(1); // 状态列（默认单选）
await selectCell.click();
await page.waitForTimeout(400);
const selEditing = await selectCell.evaluate((el) => el.className.includes("grid__cell--editing"));
console.log("单选单击编辑 =", selEditing);
if (!selEditing) await fail("单选单击未进入编辑");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// 5) 系统字段（创建时间）单击不可编辑
const createdCell = page.locator(".grid tbody tr").first().locator("td.grid__cell").last();
await createdCell.click();
await page.waitForTimeout(300);
const createdEditing = await createdCell.evaluate((el) => el.className.includes("grid__cell--editing"));
console.log("创建时间单击编辑 =", createdEditing);
if (createdEditing) await fail("系统字段不应可编辑");

// 6) ESC 清选中
await titleCell.click();
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
const still = await page.locator(".grid__cell--selected").count();
console.log("ESC 后选中单元格数 =", still);
if (still !== 0) await fail("ESC 未清除选中");

// 7) 列尾 48px
const addW = await page.evaluate(() => Math.round(document.querySelector(".grid__add").getBoundingClientRect().width));
console.log("列尾宽度 =", addW);
if (addW < 47 || addW > 49) await fail("列尾应为 48px（含边框误差）");

await page.screenshot({ path: "../docs/验收证据/重做批/W64/单元格语义.png", fullPage: true });
await browser.close();
console.log("PASS: 单击选中/双击编辑(60)/ESC 取消/单选单击/系统字段只读/ESC 清选中/列尾48");