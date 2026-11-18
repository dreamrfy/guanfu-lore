// W30 侧栏收起/展开点验：过渡动画真实存在（中间帧宽度落在 0..228 之间）、内容区让位正确、可往返
// 用法: npm run sidebar-toggle-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W30/toggle-失败现场.png" });
  await browser.close();
  process.exit(1);
};
const widths = () =>
  page.evaluate(() => {
    const sb = document.querySelector(".shell__sidebar");
    const main = document.querySelector(".shell__main");
    return {
      sidebar: Math.round(sb.getBoundingClientRect().width),
      main: Math.round(main.getBoundingClientRect().width),
      transition: getComputedStyle(sb).transitionProperty,
      duration: getComputedStyle(sb).transitionDuration,
    };
  });

const before = await widths();
console.log("初始 =", JSON.stringify(before));
if (before.sidebar !== 228) await fail("初始侧栏应 228");
if (!before.transition.includes("width")) await fail("侧栏应有 width 过渡（动画缺失）");

// 1) 收起：采样中间帧，证明是动画不是瞬变
await page.click(".wsrow");
await page.waitForTimeout(250);
await page.locator(".tabctx--ws .tabctx__item", { hasText: "收起侧栏" }).click();
await page.waitForTimeout(70);
const mid = await page.evaluate(() => Math.round(document.querySelector(".shell__sidebar").getBoundingClientRect().width));
await page.waitForTimeout(400);
const after = await widths();
console.log("收起中间帧宽 =", mid, "| 收起后 =", JSON.stringify(after));
if (!(mid > 0 && mid < 228)) await fail("收起应有过渡中间帧（实测瞬变=无动画）");
if (after.sidebar !== 0) await fail("收起后侧栏应 0");
if (after.main <= before.main) await fail("收起后内容区未让位");

// 2) 展开：中间帧 + 恢复 228 + 内容区回缩
await page.locator('.icon-btn[title="展开侧栏"]').first().click();
await page.waitForTimeout(70);
const mid2 = await page.evaluate(() => Math.round(document.querySelector(".shell__sidebar").getBoundingClientRect().width));
await page.waitForTimeout(400);
const back = await widths();
console.log("展开中间帧宽 =", mid2, "| 展开后 =", JSON.stringify(back));
if (!(mid2 > 0 && mid2 < 228)) await fail("展开应有过渡中间帧");
if (back.sidebar !== 228) await fail("展开后应恢复 228");
if (back.main !== before.main) await fail("展开后内容区宽度未恢复");

await page.screenshot({ path: "../docs/验收证据/重做批/W30/侧栏动画后.png" });
await browser.close();
console.log("PASS: 收起/展开有真实过渡，内容区让位与恢复正确");