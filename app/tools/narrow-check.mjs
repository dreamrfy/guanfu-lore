// W47 窄口适配点验：<768 抽屉侧栏（默认收起/☰ 打开/遮罩关闭）、内容区不溢出；桌面形态不受影响
// 用法: npm run narrow-check
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
const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1600);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W47/narrow-失败现场.png" });
  await browser.close();
  process.exit(1);
};

// 1) 窄口：shell 有 narrow 类；侧栏默认在屏幕外（抽屉收起）；☰ 可见
const state0 = await page.evaluate(() => {
  const shell = document.querySelector(".shell");
  const sb = document.querySelector(".shell__sidebar").getBoundingClientRect();
  const menuBtn = document.querySelector(".narrow-menu");
  return {
    narrow: shell.className.includes("shell--narrow"),
    sbX: Math.round(sb.x),
    sbW: Math.round(sb.width),
    menuVisible: menuBtn ? getComputedStyle(menuBtn).display !== "none" : false,
  };
});
console.log("窄口初态 =", JSON.stringify(state0));
if (!state0.narrow) await fail("420 宽应进入 narrow 模式");
if (!state0.menuVisible) await fail("窄口应显示 ☰ 菜单钮");
if (!(state0.sbX + state0.sbW <= 1)) await fail("窄口侧栏默认应收起（屏幕外）");

// 2) 内容区不溢出
const overflow = await page.evaluate(() => ({
  docW: document.documentElement.scrollWidth,
  winW: window.innerWidth,
  innerW: Math.round(document.querySelector(".page__inner").getBoundingClientRect().width),
}));
console.log("内容区 =", JSON.stringify(overflow));
if (overflow.docW > overflow.winW + 1) await fail("窄口出现横向溢出");
if (overflow.innerW > overflow.winW) await fail("内容列超出视口");
await page.screenshot({ path: "../docs/验收证据/重做批/W47/窄口-抽屉收起.png" });

// 3) ☰ 打开抽屉 + 遮罩；点遮罩关闭
await page.click(".narrow-menu");
await page.waitForTimeout(500);
const opened = await page.evaluate(() => {
  const sb = document.querySelector(".shell__sidebar").getBoundingClientRect();
  return { x: Math.round(sb.x), w: Math.round(sb.width), scrim: Boolean(document.querySelector(".narrow-scrim")) };
});
console.log("打开后 =", JSON.stringify(opened));
if (opened.x !== 0) await fail("☰ 未打开抽屉");
if (opened.w !== 264) await fail("抽屉宽应 264");
if (!opened.scrim) await fail("抽屉打开应有遮罩");
await page.screenshot({ path: "../docs/验收证据/重做批/W47/窄口-抽屉打开.png" });

await page.mouse.click(380, 420); // 点遮罩右侧空白处（左侧被抽屉覆盖）
await page.waitForTimeout(500);
const closed = await page.evaluate(() => Math.round(document.querySelector(".shell__sidebar").getBoundingClientRect().x));
console.log("遮罩关闭后侧栏 x =", closed);
if (closed >= 0) await fail("点遮罩未关闭抽屉");

// 4) 桌面形态不受影响
await page.setViewportSize({ width: 1200, height: 762 });
await page.waitForTimeout(700);
const desktop = await page.evaluate(() => {
  const shell = document.querySelector(".shell");
  const sb = document.querySelector(".shell__sidebar").getBoundingClientRect();
  const menu = document.querySelector(".narrow-menu");
  return {
    narrow: shell.className.includes("shell--narrow"),
    sbX: Math.round(sb.x),
    sbW: Math.round(sb.width),
    menuVisible: menu ? getComputedStyle(menu).display !== "none" : false,
  };
});
console.log("桌面 =", JSON.stringify(desktop));
if (desktop.narrow) await fail("1200 宽不应是 narrow 模式");
if (desktop.sbX !== 0 || desktop.sbW !== 228) await fail("桌面侧栏应恢复 228 常驻");
if (desktop.menuVisible) await fail("桌面不应显示 ☰");

await page.screenshot({ path: "../docs/验收证据/重做批/W47/桌面-不受影响.png" });
await browser.close();
console.log("PASS: 窄口抽屉（默认收起/☰打开/遮罩关闭/不溢出）+ 桌面形态不变");