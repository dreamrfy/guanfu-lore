// W67 列头右键点验：右键列头打开同一套菜单（11 项），并能真实执行（隐藏）
// 用法: npm run colright-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W67/colright-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};
const headers = async () => (await page.locator(".grid__th-name").allInnerTexts()).map((t) => t.trim());

await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);
await page.locator('.grid__add button[title="添加列"]').click();
await page.waitForTimeout(250);
await page.locator(".popover .menu-item", { hasText: "数字" }).first().click();
await page.waitForTimeout(500);

// 右键「数字」列表头
const idx = (await headers()).indexOf("数字");
if (idx < 0) await fail("找不到数字列");
await page.locator(".grid__th-btn").nth(idx).click({ button: "right" });
await page.waitForTimeout(400);
const menu = page.locator(".col-menu");
if ((await menu.count()) === 0) await fail("右键列头未打开菜单");
const items = (await page.locator(".col-menu .menu-item").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
console.log("右键菜单项 =", JSON.stringify(items));
for (const need of ["升序", "降序", "在左侧插入", "在右侧插入", "筛选", "隐藏", "拷贝副本", "删除这一列"]) {
  if (!items.some((t) => t.includes(need))) await fail("右键菜单缺: " + need);
}
await page.screenshot({ path: "../docs/验收证据/重做批/W67/列头右键菜单.png" });

// 右键菜单里执行「隐藏」→ 列消失
const n0 = (await headers()).length;
await page.locator(".col-menu .menu-item", { hasText: "隐藏" }).click();
await page.waitForTimeout(700);
const n1 = (await headers()).length;
console.log("右键隐藏: 列数", n0, "→", n1);
if (n1 !== n0 - 1) await fail("右键菜单隐藏未生效");

await browser.close();
console.log("PASS: 列头右键打开同一套菜单，隐藏操作真实生效");