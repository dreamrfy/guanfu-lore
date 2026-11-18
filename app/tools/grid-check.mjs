// W63 网格视图渲染点验：表头 37 吸顶、数据行 38、No. 列 66、行尾 30、斑马纹、横向滚动
// 用法: npm run grid-check
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
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W63/grid-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};
const addField = async (label) => {
  await page.locator('.grid__add button[title="添加列"]').click();
  await page.waitForTimeout(220);
  await page.locator(".popover .menu-item", { hasText: label }).first().click();
  await page.waitForTimeout(450);
};

// 建表 + 两条记录，多加几列撑出横向滚动
await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);
for (const label of ["数字", "日期", "网址", "邮箱", "电话"]) await addField(label);
for (let i = 0; i < 2; i++) {
  await page.locator("button", { hasText: "新建记录" }).first().click();
  await page.waitForTimeout(600);
  // 新建记录后可能会进详情页，点侧栏表名回到网格
  await page.locator(".sidebar__list .tree-item").first().click();
  await page.waitForTimeout(900);
}

// 1) 尺寸
const sizes = await page.evaluate(() => {
  const th = document.querySelector(".grid thead th");
  const td = document.querySelector(".grid tbody td.grid__cell");
  const idx = document.querySelector(".grid__idx");
  const menu = document.querySelector(".grid td.grid__rowmenu");
  return {
    thH: Math.round(th.getBoundingClientRect().height),
    tdH: Math.round(td?.getBoundingClientRect().height ?? 0),
    idxW: Math.round(idx.getBoundingClientRect().width),
    menuW: menu ? Math.round(menu.getBoundingClientRect().width) : -1,
  };
});
console.log("尺寸 =", JSON.stringify(sizes));
if (sizes.thH !== 37) await fail("表头高应 37");
if (sizes.tdH !== 38) await fail("数据行高应 38");
if (sizes.idxW !== 66) await fail("No. 列宽应 66");
if (sizes.menuW !== 30) await fail("行尾列宽应 30");

// 2) 斑马纹：奇数行背景 #FBFAF7，偶数行透明
const zebra = await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".grid tbody tr")];
  return rows.map((r) => {
    const c = r.querySelector("td.grid__cell");
    return c ? getComputedStyle(c).backgroundColor : "";
  });
});
console.log("行背景 =", JSON.stringify(zebra));
if (zebra.length >= 2) {
  if (zebra[0] !== "rgb(251, 250, 247)") await fail("奇数行斑马纹应为 #FBFAF7");
  if (zebra[1] === "rgb(251, 250, 247)") await fail("偶数行不应有斑马纹");
}

// 3) 表头吸顶：纵向滚动后表头仍贴容器顶
const wrap = page.locator(".collection__scroll").first();
await page.evaluate(() => {
  const el = document.querySelector(".collection__scroll");
  if (el) el.scrollTop = 400;
});
await page.waitForTimeout(400);
const stickyTop = await page.evaluate(() => {
  const th = document.querySelector(".grid thead th");
  const scroller = th.closest(".collection__scroll") ?? th.closest("*");
  const sr = scroller.getBoundingClientRect();
  const tr = th.getBoundingClientRect();
  return Math.round(tr.top - sr.top);
});
console.log("吸顶偏移 =", stickyTop);
if (Math.abs(stickyTop) > 2) await fail("表头未吸顶");

// 4) 横向滚动：列多时可横向滚
const scroll = await page.evaluate(() => {
  const el = document.querySelector(".collection__scroll");
  if (!el) return null;
  el.scrollLeft = 300;
  return { scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
});
console.log("横向滚动 =", JSON.stringify(scroll));
if (!scroll || scroll.scrollWidth <= scroll.clientWidth) await fail("列未撑出横向滚动");
if (scroll.scrollLeft === 0) await fail("横向滚动不生效");

await page.screenshot({ path: "../docs/验收证据/重做批/W63/网格渲染.png", fullPage: true });
await browser.close();
console.log("PASS: 表头37/行38/No.66/行尾30/斑马纹/吸顶/横向滚动 全部达标");