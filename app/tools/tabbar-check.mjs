// W10 页签骨架交互点验：新建/切换/关闭真实生效
// 用法: npm run tabbar-check
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
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1200);

const countTabs = () => page.locator(".tab").count();
const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await browser.close();
  process.exit(1);
};

const before = await countTabs();
console.log("初始页签数 =", before);

// 新建页签（页签栏 + 钮）
await page.click(".tabbar__new");
await page.waitForTimeout(600);
const afterNew = await countTabs();
console.log("新建后页签数 =", afterNew);
if (afterNew !== before + 1) await fail("新建页签未生效");

// 切换回第一个页签
await page.locator(".tab").first().click();
await page.waitForTimeout(400);
const activeIdx = await page.evaluate(() =>
  [...document.querySelectorAll(".tab")].findIndex((el) => el.className.includes("tab--active")),
);
console.log("激活页签下标 =", activeIdx);
if (activeIdx !== 0) await fail("切换页签未生效");

// 关闭一个页签
await page.locator(".tab").last().locator(".tab__close").click();
await page.waitForTimeout(600);
const afterClose = await countTabs();
console.log("关闭后页签数 =", afterClose);
if (afterClose !== before) await fail("关闭页签未生效");

await browser.close();
console.log("PASS: 页签新建/切换/关闭全部真实生效");
