// W75 日历视图点验：类型切换改名、顶部年月/今天、星期表头一~日、日期格、今天红标、跨月灰显、翻月、事件落格、点事件开详情
// 用法: npm run calendar-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W75/calendar-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};

mkdirSync("../docs/验收证据/重做批/W75", { recursive: true });

await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);
await page.locator("button", { hasText: "新建记录" }).first().click();
await page.waitForTimeout(700);
await page.locator(".sidebar__list .tree-item").first().click();
await page.waitForTimeout(900);

// 加「日期」列
let hs = (await page.locator(".grid__th-name").allInnerTexts()).map((t) => t.trim());
console.log("列 =", JSON.stringify(hs));
if (!hs.includes("日期")) {
  await page.locator(".grid__add .icon-btn").first().click();
  await page.waitForTimeout(400);
  const typeBtn = page.locator(".popover .menu-item", { hasText: "日期" }).first();
  if (await typeBtn.count()) {
    await typeBtn.click();
    await page.waitForTimeout(800);
  } else {
    await fail("没找到「日期」类型菜单项");
  }
}
hs = (await page.locator(".grid__th-name").allInnerTexts()).map((t) => t.trim());
const dateIdx = hs.indexOf("日期");
const titleIdx = hs.indexOf("标题");
console.log("加日期列后 =", JSON.stringify(hs), "| 日期列 =", dateIdx);
if (dateIdx < 0) await fail("没拿到日期列");

// 填标题
const cell = page.locator(".grid tbody tr").first().locator("td.grid__cell").nth(titleIdx);
await cell.dblclick();
await page.waitForTimeout(400);
const input = page.locator(".grid__cell--editing input.cell-input").first();
await input.fill("日历事件甲");
await page.locator(".collection__name").click();
await page.waitForTimeout(600);

// 日期填今天
const dateCell = page.locator(".grid tbody tr").first().locator("td.grid__cell").nth(dateIdx);
await dateCell.dblclick();
await page.waitForTimeout(500);
const cal = page.locator(".cell-cal").first();
if (!(await cal.count())) await fail("日期编辑器（月历）没出现");
const n = new Date();
await cal.locator(".cell-cal__cell", { hasText: new RegExp(`^${n.getDate()}$`) }).first().click();
await page.waitForTimeout(700);
await page.locator(".collection__name").click();
await page.waitForTimeout(600);
console.log("日期单元格 =", (await dateCell.innerText()).trim());

// 切到日历视图
await page.locator(".viewtab__menu").first().click();
await page.waitForTimeout(250);
await page.locator(".viewtab__pop .menu-item", { hasText: "视图设置" }).click();
await page.waitForTimeout(400);
await page.locator(".viewsettings .vs-row", { hasText: "视图类型" }).locator("select").selectOption("calendar");
await page.waitForTimeout(700);
await page.locator(".viewsettings__close").click();
await page.waitForTimeout(800);

// 1) 渲染 + 视图名跟随类型
const tabName = (await page.locator(".viewtab__name").first().innerText()).trim();
console.log("标签名 =", tabName);
if (tabName !== "日历") await fail("切类型后视图名未跟随（应为「日历」）");

// 2) 顶部：年月 + 今天
const ym = (await page.locator(".cal__ym").innerText()).trim();
const nowTxt = (await page.locator(".cal__now").innerText()).trim();
console.log("顶部 =", JSON.stringify({ ym, nowTxt }));
if (!/^\d{4}年\d{1,2}月$/.test(ym)) await fail(`顶部年月格式不对：${ym}`);
if (nowTxt !== "今天") await fail(`中间按钮不是「今天」：${nowTxt}`);

// 3) 星期表头 一~日
const wds = (await page.locator(".cal__wd").allInnerTexts()).map((t) => t.trim());
console.log("星期表头 =", JSON.stringify(wds));
if (wds.join("") !== "一二三四五六日") await fail(`星期表头应为「一二三四五六日」，实际 ${wds.join("")}`);
const lineCount = await page.locator(".cal__line").count();
if (lineCount !== 1) await fail(`表头下分隔线应为 1，实际 ${lineCount}`);

// 4) 日期格：整周、7 列
const cellCount = await page.locator(".cal__cell").count();
console.log("格子数 =", cellCount);
if (cellCount < 28 || cellCount % 7 !== 0) await fail(`格子数异常（应 7 的倍数且 ≥28）：${cellCount}`);
const colCount = await page.locator(".cal__cell").evaluateAll((els) => {
  const tops = new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)));
  const first = els.filter((e) => Math.round(e.getBoundingClientRect().top) === [...tops][0]);
  return first.length;
});
console.log("首行列数 =", colCount);
if (colCount !== 7) await fail(`首行应有 7 列，实际 ${colCount}`);

// 5) 今天红底圆标
const todayCount = await page.locator(".cal__day--today").count();
console.log("今天标记数 =", todayCount);
if (todayCount !== 1) await fail(`今天标记应为 1，实际 ${todayCount}`);
const todayBg = await page.locator(".cal__day--today").evaluate((e) => getComputedStyle(e).backgroundColor);
const todayRadius = await page.locator(".cal__day--today").evaluate((e) => getComputedStyle(e).borderRadius);
console.log("今天底色 =", todayBg, "| 圆角 =", todayRadius);
if (!/rgb\(2[0-9]{2}, \d{1,3}, \d{1,3}\)/.test(todayBg)) await fail(`今天不是红底：${todayBg}`);
if (!/50%/.test(todayRadius)) await fail(`今天不是圆形：${todayRadius}`);

// 6) 跨月日期灰显
const outCount = await page.locator(".cal__cell--out").count();
console.log("跨月格子数 =", outCount);
if (outCount === 0) await fail("没有跨月灰显格子");

// 7) 事件落在今天的格子里
const evCount = await page.locator(".cal__event").count();
const evTitle = evCount ? (await page.locator(".cal__event").first().innerText()).trim() : "";
console.log("事件数 =", evCount, "| 首个 =", evTitle);
if (evCount < 1) await fail("记录没落进日历格");
if (!evTitle.includes("日历事件甲")) await fail(`事件标题不对：${evTitle}`);
const evCellHasToday = await page.locator(".cal__day--today").evaluate((e) => e.closest(".cal__cell").querySelectorAll(".cal__event").length);
console.log("今天格里的事件数 =", evCellHasToday);
if (evCellHasToday < 1) await fail("事件没落在今天的格子里");

await page.screenshot({ path: "../docs/验收证据/重做批/W75/日历视图.png" });

// 8) 翻月：‹ → 上个月，› → 回来；「今天」回当月
const ymBefore = ym;
await page.locator(".cal__nav-btn").first().click();
await page.waitForTimeout(500);
const ymPrev = (await page.locator(".cal__ym").innerText()).trim();
console.log("‹ 翻月 =", ymBefore, "→", ymPrev);
if (ymPrev === ymBefore) await fail("‹ 翻月没生效");
await page.locator(".cal__now").click();
await page.waitForTimeout(500);
const ymBack = (await page.locator(".cal__ym").innerText()).trim();
console.log("点今天后 =", ymBack);
if (ymBack !== ymBefore) await fail("「今天」没回到当月");

// 9) 点事件打开详情
await page.locator(".cal__event").first().click();
await page.waitForTimeout(800);
const rightVisible = (await page.locator(".shell__right").count())
  ? await page.locator(".shell__right").first().isVisible()
  : false;
console.log("点事件后右侧详情可见 =", rightVisible);
if (!rightVisible) await fail("点事件未打开记录详情");
await page.screenshot({ path: "../docs/验收证据/重做批/W75/日历-点事件开详情.png" });

await browser.close();
console.log("PASS: 日历年月/今天/星期表头/日期格/今天红标/跨月灰显/事件落格/翻月/点事件开详情 全部真实生效");
