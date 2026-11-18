// W17 中键与页签边界行为点验：中键关页签无效（规格）+ 溢出滚动不压缩 + 最后一个页签不可关
// 用法: npm run tab-boundary-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W17/boundary-失败现场.png" });
  await browser.close();
  process.exit(1);
};
const tabCount = () => page.locator(".tab").count();

// 1) 中键关页签：无效（手册 §1「中键关页签不做」）——8 个页签中键点一遍，数量不变
for (let i = 0; i < 7; i++) {
  await page.click(".tabbar__new");
  await page.waitForTimeout(300);
}
const before = await tabCount();
console.log("页签数 =", before);
for (let i = 0; i < Math.min(before, 5); i++) {
  await page.locator(".tab").nth(i).click({ button: "middle" });
  await page.waitForTimeout(200);
}
const afterMid = await tabCount();
console.log("中键点 5 个页签后数量 =", afterMid);
if (afterMid !== before) await fail("中键不应关闭页签（规格：无效）");

// 2) 溢出不压缩：8 个页签超出可视宽度 → 全部仍 180 宽，容器可横向滚动
const widths = await page.evaluate(() =>
  [...document.querySelectorAll(".tab")].map((el) => Math.round(el.getBoundingClientRect().width)),
);
const overflow = await page.evaluate(() => {
  const el = document.querySelector(".tabbar__tabs");
  return el ? { scroll: el.scrollWidth, client: el.clientWidth } : null;
});
console.log("8 页签宽度 =", JSON.stringify(widths), "滚动区 =", JSON.stringify(overflow));
if (widths.some((w) => w !== 180)) await fail("溢出时页签被压缩");
if (!overflow || overflow.scroll <= overflow.client) await fail("8 页签应产生横向溢出");

// 3) 最后一个页签不可关：关到只剩 1 个后再点关闭钮，数量不变
//    先用右键菜单「关闭其他」快速收敛
await page.locator(".tab").nth(0).click({ button: "right" });
await page.waitForTimeout(300);
await page.locator(".tabctx__item", { hasText: "关闭其他" }).click();
await page.waitForTimeout(500);
if ((await tabCount()) !== 1) await fail("关闭其他应收敛到 1 个页签");
await page.locator(".tab__close").first().click();
await page.waitForTimeout(500);
console.log("单页签点关闭钮后数量 =", await tabCount());
if ((await tabCount()) !== 1) await fail("最后一个页签不应可关（store 守卫）");

await page.screenshot({ path: "../docs/验收证据/重做批/W17/单页签边界.png" });
await browser.close();
console.log("PASS: 中键无效、溢出不压缩可滚动、末签守卫生效");
