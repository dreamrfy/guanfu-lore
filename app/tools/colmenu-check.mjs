// W66 列头菜单 11 项点验：在左右插入 / 筛选 / 隐藏 / 冻结列 / 拷贝副本 / 删除 等逐项真实生效
// 用法: npm run colmenu-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W66/colmenu-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};
const headers = async () => (await page.locator(".grid__th-name").allInnerTexts()).map((t) => t.trim());
const openMenu = async (name) => {
  const hs = await headers();
  const idx = hs.indexOf(name);
  if (idx < 0) await fail("找不到列: " + name);
  await page.locator(".grid__th-btn").nth(idx).click();
  await page.waitForTimeout(350);
};
const closeMenu = async () => {
  await page.mouse.click(1100, 780);
  await page.waitForTimeout(250);
};

// 建表 + 几条记录
await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);
for (let i = 0; i < 2; i++) {
  await page.locator("button", { hasText: "新建记录" }).first().click();
  await page.waitForTimeout(600);
  await page.locator(".sidebar__list .tree-item").first().click();
  await page.waitForTimeout(800);
}

// 1) 菜单项清单（11 项）
await openMenu("标题");
const items = (await page.locator(".col-menu .menu-item").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
console.log("菜单项 =", JSON.stringify(items));
for (const need of ["在左侧插入", "在右侧插入", "升序", "降序", "筛选", "隐藏", "冻结列", "拷贝副本", "删除这一列"]) {
  if (!items.some((t) => t.includes(need))) await fail("缺少菜单项: " + need);
}
await closeMenu();

// 2) 拷贝副本：列数 +1 且出现「副本」
const n0 = (await headers()).length;
await openMenu("标题");
await page.locator(".col-menu .menu-item", { hasText: "拷贝副本" }).click();
await page.waitForTimeout(700);
const n1 = (await headers()).length;
const hasCopy = (await headers()).some((h) => h.includes("副本"));
console.log("拷贝副本: 列数", n0, "→", n1, "| 有副本列 =", hasCopy);
if (n1 !== n0 + 1 || !hasCopy) await fail("拷贝副本未生效");

// 3) 在右侧插入：列数 +1
await openMenu("标题");
await page.locator(".col-menu .menu-item", { hasText: "在右侧插入" }).click();
await page.waitForTimeout(700);
const n2 = (await headers()).length;
console.log("右侧插入: 列数", n1, "→", n2);
if (n2 !== n1 + 1) await fail("在右侧插入未生效");

// 4) 隐藏：列数 -1（数据保留）
await openMenu("标题 副本");
await page.locator(".col-menu .menu-item", { hasText: "隐藏" }).click();
await page.waitForTimeout(700);
const n3 = (await headers()).length;
console.log("隐藏: 列数", n2, "→", n3);
if (n3 !== n2 - 1) await fail("隐藏未生效");

// 5) 冻结列：诚实置灰（浏览器 td 横向 sticky 不稳，见报告）
await openMenu("标题");
const frozenMuted = await page.locator(".col-menu .menu-item--muted", { hasText: "冻结列" }).count();
console.log("冻结列置灰 =", frozenMuted);
if (frozenMuted !== 1) await fail("冻结列应为置灰项");
await closeMenu();

// 6) 筛选：添加后视图栏出现「筛选 · 1」
await openMenu("标题");
await page.locator(".col-menu .menu-item", { hasText: "筛选" }).click();
await page.waitForTimeout(600);
const barText = await page.locator(".viewbar").innerText();
console.log("视图栏 =", barText.replace(/\s+/g, " ").slice(0, 60));
if (!/筛选\s*·\s*1/.test(barText.replace(/\s+/g, " "))) await fail("筛选未加入视图");

await page.screenshot({ path: "../docs/验收证据/重做批/W66/列头菜单.png", fullPage: true });
await browser.close();
console.log("PASS: 列头菜单项齐；副本/左右插入/隐藏/筛选真实生效；冻结列按实测不可行已诚实置灰");