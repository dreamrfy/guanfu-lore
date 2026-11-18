// W13 页签本体点验：getBoundingClientRect 数值断言规格尺寸 + 多页签不压缩
// 用法: npm run tab-size-check
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
const page = await browser.newPage({ viewport: { width: 1200, height: 762 }, deviceScaleFactor: 2 });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W13/tab-size-失败现场.png" });
  await browser.close();
  process.exit(1);
};
const rect = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  }, sel);

// 0) 给页面设个 emoji 图标，让页签 favicon 位真实渲染
await page.click('.page__icon');
await page.waitForTimeout(400);
await page.locator('.popover .icon-btn').first().click();
await page.waitForTimeout(600);
if (!(await page.locator(".tab__icon").count())) await fail("设置图标后页签 favicon 位未渲染");

// 1) 数值断言（手册 §1）
const checks = [
  [".tab", 180, 38, "页签 180×38"],
  [".tab__icon", 16, 16, "favicon 16×16"],
  [".tab__label", null, 20, "标题高 20（宽≤120 另查）"],
  [".tab__close", 20, 20, "关闭钮 20×20"],
  [".tabbar__new", 28, 28, "新建钮 28×28"],
];
for (const [sel, w, h, name] of checks) {
  const r = await rect(sel);
  if (!r) await fail(name + " 元素不存在");
  const wOk = w === null ? true : r.w === w;
  const hOk = h === null ? true : r.h === h;
  console.log(`${name}: ${r.w}×${r.h} ${wOk && hOk ? "OK" : "FAIL"}`);
  if (!wOk || !hOk) await fail(`${name} 期望 ${w ?? "任意"}×${h}，实测 ${r.w}×${r.h}`);
}
const labelW = (await rect(".tab__label")).w;
console.log("标题实际宽 =", labelW, "(≤120)", labelW <= 120 ? "OK" : "FAIL");
if (labelW > 120) await fail("标题宽超 120");

// 2) 多页签不压缩：再开 3 个页签，所有页签宽度都应仍为 180
for (let i = 0; i < 3; i++) {
  await page.click(".tabbar__new");
  await page.waitForTimeout(500);
}
const widths = await page.evaluate(() =>
  [...document.querySelectorAll(".tab")].map((el) => Math.round(el.getBoundingClientRect().width)),
);
console.log("4 个页签宽度 =", JSON.stringify(widths));
if (widths.some((w) => w !== 180)) await fail("页签被压缩：宽度不全是 180");

// 3) 关闭钮常显验证：4 个页签每个都有关闭钮
const closeCount = await page.locator(".tab__close").count();
console.log("关闭钮数 =", closeCount, "/ 页签数 4");
if (closeCount !== 4) await fail("关闭钮非常显（数量对不上）");

await page.screenshot({ path: "../docs/验收证据/重做批/W13/页签本体-多页签尺寸.png" });
await browser.close();
console.log("PASS: 页签本体全部规格尺寸数值达标，多页签不压缩，关闭常显");
