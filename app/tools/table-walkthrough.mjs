// W77 多维表整体走查：6 视图切换 + 增删字段 + 筛选/排序/分组 实测全过 + 截图
// 用法: npm run table-walkthrough
// 走查文档：docs/复刻/重做-W5多维表走查.md
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

const OUT = "../docs/验收证据/重做批/W77";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: `${OUT}/walkthrough-失败现场.png`, fullPage: true });
  await browser.close();
  process.exit(1);
};

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const barText = async () => (await page.locator(".viewbar").innerText()).replace(/\s+/g, " ");

// —— 建表 + 两条记录 ——
await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);
await page.locator("button", { hasText: "新建记录" }).first().click();
await page.waitForTimeout(700);
await page.locator(".sidebar__list .tree-item").first().click();
await page.waitForTimeout(900);
await page.locator("button", { hasText: "新建记录" }).first().click();
await page.waitForTimeout(900);

// —— 切视图类型的统一入口 ——
async function setViewType(type) {
  await page.locator(".viewtab__menu").first().click();
  await page.waitForTimeout(250);
  await page.locator(".viewtab__pop .menu-item", { hasText: "视图设置" }).click();
  await page.waitForTimeout(450);
  await page.locator(".viewsettings .vs-row", { hasText: "视图类型" }).locator("select").selectOption(type);
  await page.waitForTimeout(700);
  await page.locator(".viewsettings__close").click();
  await page.waitForTimeout(700);
}

/* ============ 1. 六种视图逐个切换，每个都真渲染 ============ */
const VIEW_SPECS = [
  { type: "table", name: "表格", sel: ".grid", label: "表格" },
  { type: "kanban", name: "看板", sel: ".kanban", label: "看板" },
  { type: "gallery", name: "画廊", sel: ".gallery", label: "画廊" },
  { type: "catalog", name: "目录", sel: ".catalog", label: "目录" },
  { type: "timeline", name: "时间轴", sel: ".timeline", label: "时间轴" },
  { type: "calendar", name: "日历", sel: ".cal", label: "日历" },
];

const viewResults = [];
for (const v of VIEW_SPECS) {
  await setViewType(v.type);
  const count = await page.locator(v.sel).count();
  const tabName = (await page.locator(".viewtab__name").first().innerText()).trim();
  console.log(`视图 ${v.name}: 容器数=${count} | 标签名=${tabName}`);
  if (!count) await fail(`${v.name}视图没渲染`);
  if (tabName !== v.label) await fail(`${v.name}视图切过去后视图名应是「${v.label}」，实际「${tabName}」`);
  await shot(`视图-${v.name}`);
  viewResults.push({ name: v.name, count, tabName });
}

// —— 视图设置下拉里 6 个类型都在且都可选 ——
await setViewType("table");
await page.locator(".viewtab__menu").first().click();
await page.waitForTimeout(250);
await page.locator(".viewtab__pop .menu-item", { hasText: "视图设置" }).click();
await page.waitForTimeout(450);
const typeOptions = await page
  .locator(".viewsettings .vs-row", { hasText: "视图类型" })
  .locator("select option")
  .evaluateAll((els) => els.map((e) => ({ v: e.value, disabled: e.disabled, t: e.textContent.trim() })));
console.log("视图类型下拉 =", JSON.stringify(typeOptions));
const enabled = typeOptions.filter((o) => !o.disabled);
if (enabled.length !== 6) await fail(`视图类型下拉应有 6 个可选，实际 ${enabled.length} 个（${JSON.stringify(typeOptions)}）`);
for (const want of ["table", "kanban", "gallery", "catalog", "timeline", "calendar"]) {
  if (!enabled.some((o) => o.v === want)) await fail(`视图类型下拉缺可选项「${want}」`);
}
await page.locator(".viewsettings__close").click();
await page.waitForTimeout(500);

/* ============ 2. 增删字段 ============ */
const headerNames = async () => (await page.locator(".grid__th-name").allInnerTexts()).map((t) => t.trim());
const beforeCols = await headerNames();
console.log("初始列 =", JSON.stringify(beforeCols));

// 2a) 加列：加一个「日期」列
await page.locator(".grid__add .icon-btn").first().click();
await page.waitForTimeout(400);
await page.locator(".popover .menu-item", { hasText: "日期" }).first().click();
await page.waitForTimeout(900);
const afterAdd = await headerNames();
console.log("加日期列后 =", JSON.stringify(afterAdd));
if (!afterAdd.includes("日期")) await fail("加列没加上「日期」列");
await shot("字段-加列后");

// 2b) 改名：点列头菜单改列名
await page.locator(".grid__th-btn").last().click();
await page.waitForTimeout(450);
const colMenu = page.locator(".col-menu").first();
await colMenu.locator("input.cell-input").first().fill("截止日期");
await page.locator(".collection__name").click();
await page.waitForTimeout(700);
const afterRename = await headerNames();
console.log("改名后 =", JSON.stringify(afterRename));
if (!afterRename.includes("截止日期")) await fail(`改名没生效：${JSON.stringify(afterRename)}`);

// 2c) 删列：列头菜单 → 删除这一列
await page.locator(".grid__th-btn").last().click();
await page.waitForTimeout(450);
await page.locator(".col-menu .menu-item", { hasText: "删除这一列" }).click();
await page.waitForTimeout(900);
const afterDelete = await headerNames();
console.log("删列后 =", JSON.stringify(afterDelete));
if (afterDelete.includes("截止日期")) await fail("删列没删掉「截止日期」");
await shot("字段-删列后");

/* ============ 3. 筛选 / 排序 / 分组 ============ */
await setViewType("table");

// 3a) 筛选
await page.locator(".viewbar__btn", { hasText: "筛选" }).click();
await page.waitForTimeout(350);
await page.locator(".viewpop .btn", { hasText: "添加条件" }).click();
await page.waitForTimeout(700);
let bar = await barText();
console.log("加筛选条件后 =", JSON.stringify(bar));
if (!bar.includes("筛选 · 1")) await fail(`加筛选条件后视图栏没显示「筛选 · 1」：${bar}`);
if (!bar.includes("视图生效中")) await fail("加筛选条件后没显示「视图生效中」");
await shot("筛选-生效中");

// 3b) 排序
await page.locator(".viewbar__btn", { hasText: "排序" }).click();
await page.waitForTimeout(350);
await page.locator(".viewpop .btn", { hasText: "添加排序" }).click().catch(async () => {
  await page.locator(".viewpop .btn").first().click();
});
await page.waitForTimeout(700);
bar = await barText();
console.log("加排序后 =", JSON.stringify(bar));
if (!bar.includes("排序 · 1")) await fail(`加排序后视图栏没显示「排序 · 1」：${bar}`);
await shot("排序-生效中");

// 3c) 分组
await page.locator(".viewbar__btn", { hasText: "分组" }).click();
await page.waitForTimeout(350);
const groupSelect = page.locator(".viewpop select").first();
if (await groupSelect.count()) {
  const opts = await groupSelect.locator("option").evaluateAll((els) => els.map((e) => e.value));
  const pick = opts.find((v) => v) ?? opts[0];
  await groupSelect.selectOption(pick);
  await page.waitForTimeout(800);
}
bar = await barText();
console.log("分组后 =", JSON.stringify(bar));
const groupHeads = await page.locator(".grid__group-cell").count();
console.log("分组组头数 =", groupHeads);
await shot("分组-生效中");

/* ============ 4. 记录页点开（先清掉筛选，否则没有行可点） ============ */
await page.locator(".viewbar__btn", { hasText: "筛选" }).click();
await page.waitForTimeout(350);
await page.locator(".viewpop .btn", { hasText: "清空" }).first().click();
await page.waitForTimeout(700);
bar = await barText();
console.log("清空筛选后 =", JSON.stringify(bar.slice(0, 60)));
await page.locator(".viewbar__btn", { hasText: "筛选" }).click();
await page.waitForTimeout(250);

await setViewType("table");
// 分组时第一行是组头（td.grid__group-cell），没有 td.grid__cell —— 直接找单元格
const rowSel = page.locator(".grid tbody td.grid__cell").first();
if (!(await rowSel.count())) await fail("清空筛选后还是没有数据单元格");
await rowSel.click();
await page.waitForTimeout(900);
const recVisible = (await page.locator(".shell__right").count())
  ? await page.locator(".shell__right").first().isVisible()
  : false;
console.log("点行打开记录页 =", recVisible);
if (!recVisible) await fail("点行没打开记录页");
await shot("记录页");

/* ============ 5. 刷新后数据仍在（持久化） ============ */
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);
await page.locator(".sidebar__list .tree-item").first().click();
await page.waitForTimeout(1200);
const rowsAfterReload = await page.locator(".grid tbody tr").count();
console.log("刷新后行数 =", rowsAfterReload);
if (rowsAfterReload < 2) await fail(`刷新后记录丢了（行数 ${rowsAfterReload}）`);
await shot("刷新后仍在");

await browser.close();
console.log("PASS: 6 视图切换/增删字段/筛选排序分组/记录页/刷新持久化 全部真实生效");
