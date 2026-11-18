// W15 页签=独立实例（同窗口隔离【暂定】）点验：两页签各自编辑互不串 + 滚动位置各自记忆
// 用法: npm run tab-isolation-check
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
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W15/isolation-失败现场.png" });
  await browser.close();
  process.exit(1);
};
const activeIdx = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".tab")].findIndex((el) => el.className.includes("tab--active")),
  );
const titleValue = () => page.locator(".page__title").inputValue();
const bodyText = () => page.locator(".ProseMirror").first().innerText();

// 准备第二个页签
await page.click(".tabbar__new");
await page.waitForTimeout(800);
if ((await tabCount2()) !== 2) await fail("准备 2 页签失败");
function tabCount2() {
  return page.locator(".tab").count();
}

// 1) 在页签 A（idx0）写标题与正文
await page.locator(".tab").first().click();
await page.waitForTimeout(400);
await page.locator(".page__title").fill("甲页");
await page.locator(".ProseMirror").first().click();
await page.keyboard.type("这是甲页的独有内容ABC");
await page.keyboard.press("Enter");
for (let i = 1; i <= 30; i++) {
  await page.keyboard.type("甲页填充行" + i);
  await page.keyboard.press("Enter");
}
await page.waitForTimeout(600);

// 2) 切到页签 B（idx1），写自己的标题与正文
await page.locator(".tab").nth(1).click();
await page.waitForTimeout(400);
const bTitle0 = await titleValue();
const bBody0 = await bodyText();
console.log("切到 B: 标题=", bTitle0, " 正文含甲内容?", bBody0.includes("ABC"));
if (bTitle0 === "甲页") await fail("B 的标题被 A 串了");
if (bBody0.includes("ABC")) await fail("B 的正文被 A 串了");
await page.locator(".page__title").fill("乙页");
await page.locator(".ProseMirror").first().click();
await page.keyboard.type("这是乙页的独有内容XYZ");
await page.waitForTimeout(600);

// 3) 切回 A：标题/正文必须还是 A 的
await page.locator(".tab").first().click();
await page.waitForTimeout(500);
console.log("切回 A: 标题=", await titleValue(), " 正文含甲?", (await bodyText()).includes("ABC"), " 含乙?", (await bodyText()).includes("XYZ"));
if ((await titleValue()) !== "甲页") await fail("切回 A 标题不对");
if (!(await bodyText()).includes("ABC")) await fail("A 正文丢失");
if ((await bodyText()).includes("XYZ")) await fail("A 正文被 B 串了");

// 4) 滚动记忆：A 滚到 ~400，B 保持 0；来回切换各自恢复
await page.locator(".ProseMirror").first().click();
await page.mouse.wheel(0, 400);
await page.waitForTimeout(400);
const aScroll = await page.evaluate(() => document.querySelector(".page")?.scrollTop ?? 0);
console.log("A 滚动到 =", aScroll);
if (aScroll < 200) await fail("A 未滚动成功（内容不足？先补正文）");

await page.locator(".tab").nth(1).click();
await page.waitForTimeout(500);
const bScroll = await page.evaluate(() => document.querySelector(".page")?.scrollTop ?? 0);
console.log("B 滚动位置 =", bScroll, "(应为 0)");
if (bScroll > 5) await fail("B 的滚动被 A 串了");

await page.locator(".tab").first().click();
await page.waitForTimeout(500);
const aScrollBack = await page.evaluate(() => document.querySelector(".page")?.scrollTop ?? 0);
console.log("切回 A 滚动恢复 =", aScrollBack);
if (Math.abs(aScrollBack - aScroll) > 10) await fail("A 的滚动位置未恢复");

// 页签标签同步显示标题（三处同步的真实性）
const labels = await page.evaluate(() =>
  [...document.querySelectorAll(".tab__label")].map((el) => el.textContent?.trim()),
);
console.log("页签标签 =", JSON.stringify(labels));
if (!labels.includes("甲页") || !labels.includes("乙页")) await fail("页签标签未同步页面标题");

await page.screenshot({ path: "../docs/验收证据/重做批/W15/两页签隔离-各自编辑.png" });
await browser.close();
console.log("PASS: 两页签各自编辑互不串，滚动位置各自记忆，页签标签三处同步");
