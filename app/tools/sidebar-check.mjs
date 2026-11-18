// W20 侧栏容器规格点验：宽 228 / 行高 32 / 组头两级结构 12px+两钮 20×20
// 用法: npm run sidebar-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W20/sidebar-失败现场.png" });
  await browser.close();
  process.exit(1);
};

// 1) 侧栏宽 228
const w = await page.evaluate(() => Math.round(document.querySelector(".shell__sidebar").getBoundingClientRect().width));
console.log("侧栏宽 =", w);
if (w !== 228) await fail("侧栏宽应 228");

// 2) 页面行高 32
const rowH = await page.evaluate(() =>
  Math.round(document.querySelector(".tree-item").getBoundingClientRect().height),
);
console.log("页面行高 =", rowH);
if (rowH !== 32) await fail("页面行高应 32");

// 3) 组头两级结构：至少两组，组头 32 高、12px 字号、各含两钮 20×20
const groups = await page.evaluate(() =>
  [...document.querySelectorAll(".sidebar__group-label")].map((el) => {
    const r = el.getBoundingClientRect();
    const btns = [...el.querySelectorAll(".groupbtn")].map((b) => {
      const br = b.getBoundingClientRect();
      return { w: Math.round(br.width), h: Math.round(br.height) };
    });
    return {
      text: el.textContent?.trim(),
      h: Math.round(r.height),
      fontSize: getComputedStyle(el).fontSize,
      btns,
    };
  }),
);
console.log("组头 =", JSON.stringify(groups));
if (groups.length < 2) await fail("应有两级分组（≥2 组头）");
for (const g of groups) {
  if (g.h !== 32) await fail(`组头「${g.text}」高应 32（实测 ${g.h}）`);
  if (g.fontSize !== "12px") await fail(`组头字号应 12px（实测 ${g.fontSize}）`);
  if (g.btns.length !== 2) await fail(`组头「${g.text}」应含两钮`);
  if (g.btns.some((b) => b.w !== 20 || b.h !== 20)) await fail(`组头「${g.text}」钮应 20×20`);
}

// 4) 组头新建钮真实生效：页面组 + 钮 → 页面 +1
const pagesBefore = await page.evaluate(() => document.querySelectorAll(".sidebar__list .tree-item").length);
await page.locator(".sidebar__group-label").first().locator(".groupbtn").nth(1).click();
await page.waitForTimeout(800);
const pagesAfter = await page.evaluate(() => document.querySelectorAll(".sidebar__list .tree-item").length);
console.log("组头新建钮: 行数", pagesBefore, "→", pagesAfter);
if (pagesAfter <= pagesBefore) await fail("组头新建钮未生效");

await page.screenshot({ path: "../docs/验收证据/重做批/W20/侧栏容器-规格.png" });
await browser.close();
console.log("PASS: 侧栏 228 / 行高 32 / 两级组头 12px+双钮 20×20 / 新建钮生效");