// W62 高级字段型点验：公式（{字段}表达式真算）、关联（选记录）、汇总（计数）
// 用法: npm run advfields-check
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W62/adv-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};
const addField = async (label) => {
  await page.locator('.grid__add button[title="添加列"]').click();
  await page.waitForTimeout(250);
  await page.locator(".popover .menu-item", { hasText: label }).first().click();
  await page.waitForTimeout(600);
};
const addRecord = async (title) => {
  await page.locator("button", { hasText: "新建记录" }).first().click();
  await page.waitForTimeout(700);
  if (title) {
    await page.locator(".grid tbody tr").last().locator("td").nth(1).dblclick();
    await page.waitForTimeout(250);
    const inp = page.locator(".grid tbody tr").last().locator("td").nth(1).locator("input.cell-input");
    await inp.fill(title);
    await inp.press("Tab");
    await page.waitForTimeout(500);
  }
};
const tdAt = (row, fieldIdx) => page.locator(".grid tbody tr").nth(row).locator("td").nth(fieldIdx + 1);

// 1) 表 A：数量 + 公式
await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);
await addRecord("甲");
await addField("数字");
// 数量列（字段2）填 3
await tdAt(0, 2).dblclick();
await page.waitForTimeout(250);
await tdAt(0, 2).locator('input[type="number"]').fill("3");
await page.keyboard.press("Tab");
await page.waitForTimeout(500);
console.log("填数后主区 =", (await page.locator(".shell__main").innerText()).replace(/s+/g," ").slice(0,120));
await addField("公式");
// 配置公式：{数量} * 2
const fIdx = (await page.locator(".grid__th-name").allInnerTexts()).findIndex((t) => t.trim() === "公式");
await page.locator(".grid__th-btn").nth(fIdx).click();
await page.waitForTimeout(300);
console.log("headers =", JSON.stringify(await page.locator(".grid__th-name").allInnerTexts()), "thbtns =", await page.locator(".grid__th-btn").count(), "fIdx =", fIdx);
console.log("列菜单打开 =", await page.locator(".col-menu").count(), "| 类型 =", await page.locator(".col-menu select.cell-input").first().inputValue().catch(()=>"?"));
const formulaInput = page.locator(".col-menu input.cell-input").last();
await formulaInput.fill("{数字} * 2");
await page.keyboard.press("Tab");
await page.waitForTimeout(300);
await page.mouse.click(1200, 700);
await page.waitForTimeout(700);
const formulaText = await tdAt(0, fIdx).innerText();
console.log("公式单元格 =", formulaText.trim());
if (formulaText.trim() !== "6") await fail("公式未正确计算（期望 6）");

// 2) 表 B：一条记录
await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);
await addRecord("乙记录");
// 回表 A（侧栏表格行第一个）
await page.locator(".sidebar__list .tree-item").filter({ hasText: "表格" }).first().click().catch(async () => {
  await page.locator(".sidebar__list .tree-item").first().click();
});
await page.waitForTimeout(1200);

// 3) 关联字段 → 选 B
await addField("关联");
const rIdx = (await page.locator(".grid__th-name").allInnerTexts()).findIndex((t) => t.trim() === "关联");
await page.locator(".grid__th-btn").nth(rIdx).click();
await page.waitForTimeout(300);
const relSelects = page.locator(".col-menu select.cell-input");
await relSelects.last().selectOption({ index: 1 });
await page.waitForTimeout(400);
await page.mouse.click(1200, 700);
await page.waitForTimeout(600);
await tdAt(0, rIdx).dblclick();
await page.waitForTimeout(500);
const relBox = tdAt(0, rIdx).locator(".cell-relation__item");
const relCount = await relBox.count();
console.log("关联可选记录数 =", relCount);
if (relCount === 0) await fail("关联编辑器没有可选记录");
await relBox.first().click();
await page.waitForTimeout(600);
const relText = await tdAt(0, rIdx).innerText();
console.log("关联单元格 =", relText.replace(/\s+/g, " "));
if (!relText.includes("乙记录")) await fail("关联值未保存");
await page.mouse.click(1200, 700);
await page.waitForTimeout(400);

// 4) 汇总：来源=关联字段，计数
await addField("汇总");
const sIdx = (await page.locator(".grid__th-name").allInnerTexts()).findIndex((t) => t.trim() === "汇总");
await page.locator(".grid__th-btn").nth(sIdx).click();
await page.waitForTimeout(300);
const rollSelects = page.locator(".col-menu select.cell-input");
// 来源下拉：找到首个 option 文案含「来源关联字段」的那个 select
const srcSel = page.locator('.col-menu select.cell-input').filter({ has: page.locator('option', { hasText: '来源关联字段' }) });
await srcSel.selectOption({ index: 1 });
await page.waitForTimeout(400);
await page.mouse.click(1200, 700);
await page.waitForTimeout(700);
const sumText = await tdAt(0, sIdx).innerText();
console.log("汇总单元格 =", sumText.trim());
if (sumText.trim() !== "1") await fail("汇总计数未正确（期望 1）");

await page.screenshot({ path: "../docs/验收证据/重做批/W62/高级字段型.png", fullPage: true });
await browser.close();
console.log("PASS: 公式真算、关联可选可存、汇总计数正确");