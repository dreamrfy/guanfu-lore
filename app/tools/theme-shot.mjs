// W03 深浅双主题真实点验：点击外观菜单切换主题，截图浅/深各一张，刷新验证持久化
// 用法: npm run theme-shot
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

const OUT_DIR = "../docs/验收证据/重做批/W03";
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 }, deviceScaleFactor: 2 });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1200);

// 1) 浅色基线
await page.screenshot({ path: `${OUT_DIR}/主题-浅色.png` });
console.log("浅色截图完成; 初始 theme =", await page.evaluate(() => document.documentElement.dataset.theme));

// 2) 真实点击外观菜单 → 深色
await page.click('[title="外观"]');
await page.waitForTimeout(400);
await page.getByText("深色", { exact: true }).first().click();
await page.waitForTimeout(600);
const afterClick = await page.evaluate(() => document.documentElement.dataset.theme);
console.log("点击切换后 theme =", afterClick);
if (afterClick !== "dark") {
  console.error("FAIL: 点击外观菜单后 theme 不是 dark");
  await browser.close();
  process.exit(1);
}
await page.screenshot({ path: `${OUT_DIR}/主题-深色.png` });

// 3) 刷新验证持久化（数据真存、刷新不丢）
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const afterReload = await page.evaluate(() => document.documentElement.dataset.theme);
console.log("刷新后 theme =", afterReload);
if (afterReload !== "dark") {
  console.error("FAIL: 刷新后主题没有保持 dark（持久化失效）");
  await browser.close();
  process.exit(1);
}
await page.screenshot({ path: `${OUT_DIR}/主题-深色-刷新后.png` });

await browser.close();
console.log("PASS: 深浅切换真实生效，刷新保持");
