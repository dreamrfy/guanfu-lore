// W74 时间轴视图点验：类型切换改名、顶部(年月/月单位/今天)、日期刻度+今天红线、左侧记录面板折叠、‹›翻页、记录块定位
// 用法: npm run timeline-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W74/timeline-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};

mkdirSync("../docs/验收证据/重做批/W74", { recursive: true });

await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);
await page.locator("button", { hasText: "新建记录" }).first().click();
await page.waitForTimeout(700);
await page.locator(".sidebar__list .tree-item").first().click();
await page.waitForTimeout(900);

// 加一个「日期」列
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
async function setTitle(rowIdx, text) {
  const cell = page.locator(".grid tbody tr").nth(rowIdx).locator("td.grid__cell").nth(titleIdx);
  await cell.dblclick();
  await page.waitForTimeout(400);
  const input = page.locator(".grid__cell--editing input.cell-input").first();
  await input.fill(text);
  await page.locator(".collection__name").click();
  await page.waitForTimeout(500);
}
await setTitle(0, "时间轴记录一");

// 给今天填日期：双击日期格 → 月历 → 点「今天」
const dateCell = page.locator(".grid tbody tr").first().locator("td.grid__cell").nth(dateIdx);
await dateCell.dblclick();
await page.waitForTimeout(500);
const cal = page.locator(".cell-cal").first();
if (!(await cal.count())) await fail("日期编辑器（月历）没出现");
console.log("月历标题 =", (await cal.locator(".cell-cal__title").innerText()).trim());
const todayBtn = cal.locator(".cell-cal__cell", { hasText: /^今天$/ }).first();
const todayCount = await todayBtn.count();
console.log("月历里「今天」按钮数 =", todayCount);
if (todayCount > 0) {
  await todayBtn.click();
} else {
  // 没有「今天」按钮就点当月的今天号
  const n = new Date();
  const label = String(n.getDate());
  await cal.locator(".cell-cal__cell", { hasText: new RegExp(`^${label}$`) }).first().click();
}
await page.waitForTimeout(700);
await page.locator(".collection__name").click();
await page.waitForTimeout(600);
const cellText = (await dateCell.innerText()).trim();
console.log("日期单元格 =", cellText);
if (!cellText) await fail("日期没写进去");

// 切到时间轴视图
await page.locator(".viewtab__menu").first().click();
await page.waitForTimeout(250);
await page.locator(".viewtab__pop .menu-item", { hasText: "视图设置" }).click();
await page.waitForTimeout(400);
await page.locator(".viewsettings .vs-row", { hasText: "视图类型" }).locator("select").selectOption("timeline");
await page.waitForTimeout(700);
await page.locator(".viewsettings__close").click();
await page.waitForTimeout(800);

// 1) 渲染 + 视图名跟随类型
const tabName = (await page.locator(".viewtab__name").first().innerText()).trim();
console.log("标签名 =", tabName);
if (tabName !== "时间轴") await fail("切类型后视图名未跟随（应为「时间轴」）");

// 2) 顶部：年月 + 单位 + 今天
const period = (await page.locator(".timeline__date").innerText()).trim();
const unitTxt = (await page.locator(".timeline__unit").innerText()).trim();
const nowTxt = (await page.locator(".timeline__now").innerText()).trim();
console.log("顶部 =", JSON.stringify({ period, unitTxt, nowTxt }));
if (!/^\d{4}年\d{1,2}月$/.test(period)) await fail(`顶部年月格式不对：${period}`);
if (!unitTxt.includes("月")) await fail(`单位不是「月」：${unitTxt}`);
if (nowTxt !== "今天") await fail(`中间按钮不是「今天」：${nowTxt}`);

// 3) 日期刻度条 + 今天红标
const tickCount = await page.locator(".timeline__tick").count();
const todayTicks = await page.locator(".timeline__tick--today").count();
console.log("刻度数 =", tickCount, "| 今天刻度 =", todayTicks);
if (tickCount < 28 || tickCount > 31) await fail(`刻度数异常（应为一月天数）：${tickCount}`);
if (todayTicks !== 1) await fail(`今天刻度应为 1，实际 ${todayTicks}`);

// 今天标记的底色应为红
const todayBg = await page.locator(".timeline__tick--today .timeline__tick-label").evaluate((e) => getComputedStyle(e).backgroundColor);
console.log("今天标记底色 =", todayBg);
if (!/rgb\(2[0-9]{2}, \d{1,3}, \d{1,3}\)/.test(todayBg)) await fail(`今天标记不是红色：${todayBg}`);

// 4) 今天红线
const lineCount = await page.locator(".timeline__now-line").count();
console.log("今天红线数 =", lineCount);
if (lineCount !== 1) await fail(`今天红线应为 1，实际 ${lineCount}`);

// 4b) 打开时「今天」应自动滚到视野内（FlowUs 默认停在今天）
const todayVisible = await page.locator(".timeline__tick--today").isVisible();
const tickBox = await page.locator(".timeline__tick--today").boundingBox();
const wrapBox = await page.locator(".timeline__lane-wrap").boundingBox();
console.log("今天刻度可见 =", todayVisible, "| 刻度 x =", Math.round(tickBox?.x ?? -1), "| 容器 x =", Math.round(wrapBox?.x ?? -1), "w =", Math.round(wrapBox?.width ?? -1));
if (!todayVisible) await fail("今天刻度不在视野内（未自动滚动到今天）");
if (tickBox && wrapBox && (tickBox.x < wrapBox.x - 1 || tickBox.x > wrapBox.x + wrapBox.width)) {
  await fail("今天刻度滚出了容器可视区");
}

// 5) 记录块落在今天的刻度上
const blockCount = await page.locator(".timeline__block").count();
const blockTitle = blockCount ? (await page.locator(".timeline__block-title").first().innerText()).trim() : "";
console.log("记录块数 =", blockCount, "| 首个 =", blockTitle);
if (blockCount < 1) await fail("记录没落到时间轴上");
if (!blockTitle.includes("时间轴记录一")) await fail(`记录块标题不对：${blockTitle}`);
const blockVisible = await page.locator(".timeline__block").first().isVisible();
console.log("记录块可见 =", blockVisible);
if (!blockVisible) await fail("记录块不在视野内（未自动滚动到今天）");

// 6) 左侧记录列表面板 + 折叠
const panelRows = await page.locator(".timeline__panel-row").count();
console.log("左侧面板行数 =", panelRows);
if (panelRows < 1) await fail("左侧记录面板没渲染");
const collapseTxt = (await page.locator(".timeline__collapse").innerText()).trim();
console.log("折叠钮 =", collapseTxt);
if (collapseTxt !== "≪") await fail(`折叠钮应是「≪」，实际「${collapseTxt}」`);
// 折叠 → 面板收起 → 再展开
const closedWidth = await page.locator(".timeline__panel").evaluate((e) => e.getBoundingClientRect().width);
await page.locator(".timeline__collapse").click();
await page.waitForTimeout(500);
const closedWidth2 = await page.locator(".timeline__panel").evaluate((e) => e.getBoundingClientRect().width);
const rowsAfter = await page.locator(".timeline__panel-row").count();
console.log("折叠前宽 =", Math.round(closedWidth), "→ 折叠后宽 =", Math.round(closedWidth2), "| 行数 =", rowsAfter);
if (closedWidth2 >= closedWidth) await fail("折叠后面板没收起");
if (rowsAfter !== 0) await fail("折叠后记录行仍在");
await page.locator(".timeline__collapse").click();
await page.waitForTimeout(400);

await page.screenshot({ path: "../docs/验收证据/重做批/W74/时间轴视图.png" });

// 7) ‹ › 翻页（上一月 → 月份减一）
const periodBefore = (await page.locator(".timeline__date").innerText()).trim();
await page.locator(".timeline__nav").first().click();
await page.waitForTimeout(500);
const periodAfter = (await page.locator(".timeline__date").innerText()).trim();
console.log("翻页 =", periodBefore, "→", periodAfter);
if (periodBefore === periodAfter) await fail("‹ 翻页没生效");
// 「今天」回到当月
await page.locator(".timeline__now").click();
await page.waitForTimeout(500);
const periodBack = (await page.locator(".timeline__date").innerText()).trim();
console.log("点今天后 =", periodBack);
if (periodBack !== periodBefore) await fail("「今天」没回到当月");

// 8) 单位下拉可切「日」
await page.locator(".timeline__unit").click();
await page.waitForTimeout(400);
const unitItems = (await page.locator(".timeline__unit-pop .menu-item").allInnerTexts()).map((t) => t.trim());
console.log("单位下拉项 =", JSON.stringify(unitItems));
if (!unitItems.includes("日")) await fail("单位下拉缺「日」");
await page.locator(".timeline__unit-pop .menu-item", { hasText: "日" }).click();
await page.waitForTimeout(600);
const tickAfterUnit = await page.locator(".timeline__tick").count();
console.log("切「日」后刻度数 =", tickAfterUnit);
if (tickAfterUnit !== 1) await fail(`切「日」后刻度应为 1，实际 ${tickAfterUnit}`);

await page.screenshot({ path: "../docs/验收证据/重做批/W74/时间轴-切单位日.png" });

// 9) 点记录块打开详情
await page.locator(".timeline__unit").click();
await page.waitForTimeout(300);
await page.locator(".timeline__unit-pop .menu-item", { hasText: "月" }).click();
await page.waitForTimeout(600);
await page.locator(".timeline__block").first().click();
await page.waitForTimeout(800);
const rightVisible = (await page.locator(".shell__right").count())
  ? await page.locator(".shell__right").first().isVisible()
  : false;
console.log("点记录块后右侧详情可见 =", rightVisible);
if (!rightVisible) await fail("点记录块未打开记录详情");
await page.screenshot({ path: "../docs/验收证据/重做批/W74/时间轴-点块开详情.png" });

await browser.close();
console.log("PASS: 时间轴顶部/刻度/今天红线/记录定位/面板折叠/翻页/单位切换/点块开详情 全部真实生效");
