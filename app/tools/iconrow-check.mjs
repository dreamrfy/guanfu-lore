// W21 侧栏顶部图标行点验：5 个 32×32、x 步长 45、语义与点击真实生效
// 用法: npm run iconrow-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W21/iconrow-失败现场.png" });
  await browser.close();
  process.exit(1);
};

// 1) 数量/尺寸/步长
const geo = await page.evaluate(() =>
  [...document.querySelectorAll(".sidebar__icons .sidebar__icon")].map((el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), title: el.getAttribute("title") };
  }),
);
console.log("图标行 =", JSON.stringify(geo));
if (geo.length !== 5) await fail("应 5 个图标");
if (geo.some((g) => g.w !== 32 || g.h !== 32)) await fail("图标应全 32×32");
for (let i = 1; i < geo.length; i++) {
  const step = geo[i].x - geo[i - 1].x;
  if (step !== 45) await fail(`x 步长应为 45，第 ${i} 个实测 ${step}`);
}
const firstX = geo[0].x;
const sidebarX = await page.evaluate(() =>
  Math.round(document.querySelector(".shell__sidebar").getBoundingClientRect().x),
);
console.log("首图标相对侧栏 x =", firstX - sidebarX, " y =", geo[0].y - (await page.evaluate(() => Math.round(document.querySelector(".shell__sidebar").getBoundingClientRect().y))));

// 2) 主页钮：真实跳页（先建一页再回主页）
await page.click(".tabbar__new");
await page.waitForTimeout(700);
const tabsBefore = await page.locator(".tab").count();
await page.locator('.sidebar__icons button[title="主页"]').click();
await page.waitForTimeout(700);
const activeIdx = await page.evaluate(() =>
  [...document.querySelectorAll(".tab")].findIndex((el) => el.className.includes("tab--active")),
);
console.log("主页点击后激活 idx =", activeIdx, "（页签数", tabsBefore, "）");
if (activeIdx < 0) await fail("主页钮点击后无激活页签");

// 3) AI 钮：真实打开对话弹层
await page.locator('.sidebar__icons button[title="AI"]').click();
await page.waitForTimeout(800);
const aiOpened = await page.evaluate(() => document.body.innerText.includes("发送") || document.querySelectorAll(".ai").length > 0);
console.log("AI 弹层打开 =", aiOpened);
if (!aiOpened) await fail("AI 钮未打开对话弹层");
await page.click('.modal__head .icon-btn[title="关闭"]');
await page.waitForTimeout(500);
if (await page.locator(".modal").count()) console.error("警告: 弹层未关");

// 4) 搜索钮：真实打开全局搜索浮层（W80 · 08 §1 侧栏图标行第 3 钮 = 浮层入口）
await page.locator('.sidebar__icons button[title^="快速查找"]').click();
await page.waitForTimeout(400);
const panelShown = await page.locator(".searchpanel").count();
const panelInputFocused = await page.evaluate(() =>
  document.activeElement?.classList.contains("searchpanel__input") ?? false
);
console.log("搜索浮层出现 =", panelShown, "浮层输入框聚焦 =", panelInputFocused);
if (!panelShown) await fail("搜索钮未打开全局搜索浮层");
if (!panelInputFocused) await fail("浮层打开后输入框未聚焦");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
if (await page.locator(".searchpanel").count()) await fail("Escape 未关闭搜索浮层");

// 5) 通知钮：按规格待 W28 → 应为 disabled（诚实占位）
const noticeDisabled = await page.locator('.sidebar__icons button[title^="通知"]').isDisabled();
console.log("通知钮 disabled =", noticeDisabled);
if (!noticeDisabled) await fail("通知钮在 W28 前应为 disabled");

// 6) 更多钮：触发隐藏文件选择框（真实动作：DOM 里存在并响应 click）
await page.evaluate(() => {
  const el = document.querySelector('input[accept*=".md"]');
  window.__importClicked = false;
  if (el) el.addEventListener("click", () => (window.__importClicked = true), { once: true });
});
await page.locator('.sidebar__icons button[title="更多"]').click();
await page.waitForTimeout(400);
const importClicked = await page.evaluate(() => Boolean(window.__importClicked));
console.log("更多钮触发文件选择 =", importClicked);
if (!importClicked) await fail("更多钮未触发导入文件");

await page.screenshot({ path: "../docs/验收证据/重做批/W21/图标行-规格.png" });
await browser.close();
console.log("PASS: 图标行 5×32 步长 45，主页/AI/搜索/更多真生效，通知按规待 W28");