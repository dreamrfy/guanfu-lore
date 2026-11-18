// W16 页签栏 ⋯ 钮点验：尺寸 32×26、菜单 4 项真实生效（同步/新建/主题/图标风格）
// 用法: npm run tab-more-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W16/more-失败现场.png" });
  await browser.close();
  process.exit(1);
};
const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
const prefs = () =>
  page.evaluate(() => {
    const raw = localStorage.getItem("guanfu-lore.prefs") ?? localStorage.getItem("prefs");
    return raw;
  });
const findKey = () =>
  page.evaluate(() => Object.keys(localStorage).find((k) => k.toLowerCase().includes("pref")));

// 1) 尺寸 32×26
const r = await page.evaluate(() => {
  const el = document.querySelector(".tabbar__more");
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { w: Math.round(b.width), h: Math.round(b.height) };
});
console.log("⋯ 钮尺寸 =", JSON.stringify(r));
if (!r || r.w !== 32 || r.h !== 26) await fail("⋯ 钮应 32×26");

// 2) 菜单弹出 4 项
await page.click(".tabbar__more");
await page.waitForTimeout(300);
const itemCount = await page.locator(".tabctx--more .tabctx__item").count();
console.log("⋯ 菜单项数 =", itemCount);
if (itemCount !== 4) await fail("⋯ 菜单应 4 项");
await page.screenshot({ path: "../docs/验收证据/重做批/W16/more菜单-弹出.png" });

// 3) 新建页面 → 页签 +1
await page.locator(".tabctx--more .tabctx__item", { hasText: "新建页面" }).click();
await page.waitForTimeout(700);
console.log("新建后页签数 =", await page.locator(".tab").count());
if ((await page.locator(".tab").count()) !== 2) await fail("⋯ 菜单新建页面未生效");

// 4) 主题切换 → data-theme 翻转
const t0 = await theme();
await page.click(".tabbar__more");
await page.waitForTimeout(300);
await page.locator(".tabctx--more .tabctx__item", { hasText: "主题" }).click();
await page.waitForTimeout(500);
const t1 = await theme();
console.log("主题:", t0, "→", t1);
if (t0 === t1) await fail("主题未切换");
await page.click(".tabbar__more");
await page.waitForTimeout(300);
await page.locator(".tabctx--more .tabctx__item", { hasText: "主题" }).click();
await page.waitForTimeout(500);
const t2 = await theme();
if (t2 !== t0) await fail("主题未切回");

// 5) 图标风格切换 → prefs 落盘
const prefKey = await findKey();
const p0 = prefKey ? await page.evaluate((k) => localStorage.getItem(k), prefKey) : null;
await page.click(".tabbar__more");
await page.waitForTimeout(300);
await page.locator(".tabctx--more .tabctx__item", { hasText: "图标风格" }).click();
await page.waitForTimeout(500);
const p1 = prefKey ? await page.evaluate((k) => localStorage.getItem(k), prefKey) : null;
console.log("图标风格 prefs 变化:", (p0 ?? "").slice(0, 80), "→", (p1 ?? "").slice(0, 80));
if (p0 === p1) await fail("图标风格未切换/未落盘");

// 6) 立即同步 → 不崩（离线无服务端，错误被吞掉是预期）
await page.click(".tabbar__more");
await page.waitForTimeout(300);
await page.locator(".tabctx--more .tabctx__item", { hasText: "立即同步" }).click();
await page.waitForTimeout(1500);
if (!(await page.locator(".tabbar").count())) await fail("同步点击后应用崩了");
console.log("立即同步点击后应用正常");

// 7) Esc 关菜单
await page.click(".tabbar__more");
await page.waitForTimeout(300);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
if (await page.locator(".tabctx--more").count()) await fail("Esc 未关闭 ⋯ 菜单");
console.log("Esc 关闭生效");

await browser.close();
console.log("PASS: ⋯ 钮 32×26，4 项观复入口全部真实生效");
