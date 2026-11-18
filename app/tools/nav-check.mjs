// W12 导航钮区真实点验：后退/前进真点击（历史栈行为）+ 主页/刷新冒烟
// 页面都以"无标题"命名，用激活页签的索引区分页面
// 主页跳转逻辑由 navHistory.test.ts 单测覆盖（编辑器挂载会触碰 updatedAt，
// UI 层无法构造"当前页≠最新页"的场景，故此处只做冒烟）
// 用法: npm run nav-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W12/nav-check-失败现场.png" });
  await browser.close();
  process.exit(1);
};

const back = page.locator('.navbtn[title="后退"]');
const fwd = page.locator('.navbtn[title="前进"]');
const home = page.locator('.navbtn[title="主页"]');
const refreshBtn = page.locator('.navbtn[title="刷新"]');
const activeIdx = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".tab")].findIndex((el) => el.className.includes("tab--active")),
  );
const tabCount = () => page.locator(".tab").count();

// 1) 初始：无历史 → 后退/前进 disabled（手册规格）
const d1 = { back: await back.isDisabled(), fwd: await fwd.isDisabled() };
console.log("初始 disabled =", JSON.stringify(d1));
if (!d1.back || !d1.fwd) await fail("初始无历史时后退/前进应为 disabled");

// 2) 新建页面（压历史）→ 后退可用
await page.click(".tabbar__new");
await page.waitForTimeout(800);
console.log("新建后 tab 数 =", await tabCount(), "激活 idx =", await activeIdx());
if (await back.isDisabled()) await fail("新建页面后后退应可用");
if ((await activeIdx()) !== 1) await fail("新建页应成为激活页签 idx=1");

// 3) 后退 → 回到第一页（idx 0）
await back.click();
await page.waitForTimeout(600);
console.log("后退后激活 idx =", await activeIdx());
if ((await activeIdx()) !== 0) await fail("后退应回到第一页");
if (await fwd.isDisabled()) await fail("后退后前进应可用");

// 4) 前进 → 回到新页（idx 1）
await fwd.click();
await page.waitForTimeout(600);
console.log("前进后激活 idx =", await activeIdx());
if ((await activeIdx()) !== 1) await fail("前进应回到新页");

// 5) 主页/刷新冒烟：真点击不报错、编辑器正常渲染
await home.click();
await page.waitForTimeout(600);
if (!(await page.locator(".page__title").count())) await fail("主页点击后编辑器未渲染");
await refreshBtn.click();
await page.waitForTimeout(900);
if (!(await page.locator(".page__title").count())) await fail("刷新后编辑器未渲染");
console.log("主页/刷新冒烟通过（跳转与重读逻辑见 navHistory.test.ts 6 条单测）");

// 形态截图
await page.screenshot({ path: "../docs/验收证据/重做批/W12/导航钮区-首页.png" });

await browser.close();
console.log("PASS: 后退/前进真实生效 + 主页/刷新冒烟过，disabled 逻辑正确");
