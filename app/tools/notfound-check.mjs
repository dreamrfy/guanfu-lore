// W95 404 空态点验（06 号 §2）：居中 🎉 欢迎使用 + ＋ 创建新页面（真实建页闭环）
// 可达路径：远端同步删除当前页签页（applyRemoteChange 不清页签，主区落 404 空态）
// 用法: npm run notfound-check
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) { console.error("未找到 Chrome"); process.exit(2); }
const OUT = "../docs/验收证据/重做批/W95";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: OUT + "/404-失败现场.png" });
  await browser.close();
  process.exit(1);
};

// 1) 打开一篇真实页面（页签指向它）
await page.click(".tabbar__new");
await page.waitForTimeout(800);
const tabCount0 = await page.locator(".tab").count();
if (tabCount0 < 2) await fail("新页签未创建，tab 数=" + tabCount0);

// 2) 模拟远端同步删除当前页签页（与 runSync→applyRemoteChange 同构的真实数据流）
await page.evaluate(() => {
  const id = window.__gf_store?.getState().activeTabId;
  window.__gf_store.getState().applyRemoteChange("page", id, "delete", { page: { id } });
});
await page.waitForTimeout(600);

// 3) 断言 404 空态三要素
const nf = await page.evaluate(() => {
  const el = document.querySelector(".notfound");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    emoji: document.querySelector(".notfound__emoji")?.textContent,
    text: document.querySelector(".notfound__text")?.textContent,
    btn: document.querySelector(".notfound__btn")?.textContent,
    centered: (() => { const pg = document.querySelector(".page").getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - (pg.left + pg.width / 2)) < 20 && Math.abs(r.top + r.height / 2 - (pg.top + pg.height / 2)) < 60; })(),
  };
});
if (!nf) await fail("404 空态未出现（.notfound 不存在）");
if (nf.emoji !== "🎉") await fail("emoji 不对: " + nf.emoji);
if (!nf.text?.includes("欢迎使用")) await fail("文案不对: " + nf.text);
if (!nf.btn?.includes("创建新页面")) await fail("按钮文案不对: " + nf.btn);
if (!nf.centered) await fail("404 空态未居中");
await page.screenshot({ path: OUT + "/404-空态.png" });
console.log("PASS 1/2: 404 空态形态正确（居中 🎉 欢迎使用 + ＋ 创建新页面）");

// 4) 点「＋ 创建新页面」→ 真实建页，页签恢复，编辑器出现
await page.locator(".notfound__btn").click();
await page.waitForTimeout(900);
const after = await page.evaluate(() => ({
  tabs: window.__gf_store.getState().tabs.length,
  hasPage: !!document.querySelector(".page__title"),
  nfGone: !document.querySelector(".notfound"),
}));
if (after.tabs !== tabCount0) await fail("建页后页签数不对: " + after.tabs);
if (!after.hasPage) await fail("建页后编辑器未出现");
if (!after.nfGone) await fail("404 空态未消失");
await page.screenshot({ path: OUT + "/404-建页恢复.png" });
console.log("PASS 2/2: 点击创建新页面 → 页签恢复 + 编辑器出现，闭环成立");

await browser.close();
console.log("W95 404 空态点验全部通过");
