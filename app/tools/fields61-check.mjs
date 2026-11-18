// W61 新字段型点验：人员/文件媒体/创建时间/创建人 渲染与编辑、日期格式切换、字段排序入口
// 用法: npm run fields61-check
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
const TXT = Buffer.from("附件内容\n", "utf8");

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W61/fields-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};

// 1) 建表
await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);
if (!(await page.locator(".grid").count())) await fail("未进入多维表视图");
// 先建一条记录（否则表格为空，派生列无从回填）
await page.locator("button", { hasText: "新建记录" }).first().click();
await page.waitForTimeout(900);

// 2) 逐型加列
const addField = async (label) => {
  await page.locator('.grid__add button[title="添加列"]').click();
  await page.waitForTimeout(250);
  await page.locator(".popover .menu-item", { hasText: label }).first().click();
  await page.waitForTimeout(600);
};
for (const label of ["人员", "文件媒体", "创建时间", "创建人", "日期"]) {
  await addField(label);
}
const headers = await page.locator(".grid__th-name").allInnerTexts();
console.log("列 =", JSON.stringify(headers.map((h) => h.trim())));
for (const need of ["人员", "文件媒体", "创建时间", "创建人", "日期"]) {
  if (!headers.some((h) => h.trim() === need)) await fail("缺列: " + need);
}

// 3) 派生列：创建时间 / 创建人 直接有值
const rowText = await page.locator(".grid tbody tr").first().innerText();
console.log("行文本 =", rowText.replace(/\s+/g, " ").slice(0, 120));
if (!rowText.includes("本地用户")) await fail("创建人未渲染");
if (!/\d{4}\//.test(rowText) && !/\d{4}-/.test(rowText)) await fail("创建时间未渲染日期");

// 4) 人员：双击单元格输入
const colIndex = async (name) => (await page.locator(".grid__th-name").allInnerTexts()).findIndex((t) => t.trim() === name);
const pIdx = await colIndex("人员");
console.log("td classes =", JSON.stringify(await page.locator(".grid tbody tr").first().locator("td").evaluateAll((els)=>els.map((e,i)=>i+":"+e.className))));
// td[0]=行号，td[1]=第一条字段 → 字段 i 对应 td[i+1]
const cellAt = (row, idx) => page.locator(".grid tbody tr").nth(row).locator("td").nth(idx + 1);
await cellAt(0, pIdx).dblclick();
await page.waitForTimeout(300);
const input = cellAt(0, pIdx).locator("input.cell-input");
if ((await input.count()) === 0) await fail("人员单元格未进入编辑");
await input.fill("张三");
await input.press("Tab");
await page.waitForTimeout(700);
const personText = await cellAt(0, pIdx).innerText();
console.log("人员单元格 =", personText.replace(/\s+/g, " "));
if (!personText.includes("张三")) await fail("人员值未保存");

// 5) 文件媒体：双击 → 上传
const fIdx = await colIndex("文件媒体");
await cellAt(0, fIdx).dblclick();
await page.waitForTimeout(400);
const fileInput = cellAt(0, fIdx).locator('input[type="file"]');
if ((await fileInput.count()) === 0) await fail("文件媒体未出现上传入口");
await fileInput.setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: TXT });
await page.waitForTimeout(1500);
const fileText = await cellAt(0, fIdx).innerText();
console.log("文件单元格 =", fileText.replace(/\s+/g, " "));
if (!fileText.includes("note.txt")) await fail("文件媒体未保存附件");

// 6) 日期格式：输入日期 → 列菜单切「日期+时间」→ 显示含时间
const dIdx = await colIndex("日期");
await cellAt(0, dIdx).dblclick();
await page.waitForTimeout(300);
await cellAt(0, dIdx).locator('input[type="date"]').fill("2026-11-18");
await page.keyboard.press("Tab");
await page.waitForTimeout(700);
const before = await cellAt(0, dIdx).innerText();
await page.locator(".grid__th-btn").nth(dIdx).click();
await page.waitForTimeout(300);
await page.locator(".col-menu select.cell-input").nth(1).selectOption("datetime").catch(async () => {
  await fail("列菜单里没有日期格式选项");
});
await page.waitForTimeout(700);
const after = await cellAt(0, dIdx).innerText();
console.log("日期（仅日期）=", before.trim(), "| 切格式后 =", after.trim());
if (!after.includes(":")) await fail("日期格式未切换到含时间");

// 7) 列菜单里有升序/降序
await page.locator(".grid__th-btn").nth(pIdx).click();
await page.waitForTimeout(300);
const sortBtns = await page.locator(".col-menu .menu-item", { hasText: /升序|降序/ }).count();
console.log("列菜单排序按钮 =", sortBtns);
if (sortBtns < 2) await fail("列菜单缺升序/降序");

await page.screenshot({ path: "../docs/验收证据/重做批/W61/新字段型.png", fullPage: true });
await browser.close();
console.log("PASS: 人员/文件媒体/创建时间/创建人/日期格式/排序入口 全部真实可用");