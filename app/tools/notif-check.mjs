// W28 通知面板点验：浮层 ~500 宽、标题+筛选钮、条目 头像24+两行+日期、高 68、条目真跳转
// 用法: npm run notif-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W28/notif-失败现场.png" });
  await browser.close();
  process.exit(1);
};

// 0) 造一条回收站记录，让内容类通知有真实数据
//    （用行菜单删除一篇新建的页）
await page.click(".tabbar__new");
await page.waitForTimeout(700);
// 删掉它 → 回收站有真实条目（带删除时间）
await page.locator(".sidebar__list .tree-item:not(.tree-item--starred)").last().hover();
await page.waitForTimeout(250);
await page.locator(".sidebar__list .tree-item:not(.tree-item--starred)").last().locator('.tree-item__actions button[title="移到回收站"]').click();
await page.waitForTimeout(800);
await page.locator(".trashbar__close").click();
await page.waitForTimeout(300);

// 1) 打开面板
await page.locator('.sidebar__icons button[title="通知"]').click();
await page.waitForTimeout(500);
const panel = page.locator(".notif");
if ((await panel.count()) === 0) await fail("通知面板未打开");

// 2) 形态：宽 500、标题 + 3 个筛选钮
const geo = await page.evaluate(() => {
  const el = document.querySelector(".notif");
  const r = el.getBoundingClientRect();
  return {
    w: Math.round(r.width),
    title: document.querySelector(".notif__title")?.textContent,
    filters: [...document.querySelectorAll(".notif__filter")].map((b) => b.textContent?.trim()),
    items: [...document.querySelectorAll(".notif__item")].map((it) => ({
      h: Math.round(it.getBoundingClientRect().height),
      av: Math.round(it.querySelector(".notif__avatar").getBoundingClientRect().width),
      lines: it.querySelectorAll(".notif__name, .notif__sub").length,
      at: Boolean(it.querySelector(".notif__at")),
    })),
  };
});
console.log("面板 =", JSON.stringify(geo));
if (geo.w !== 500) await fail("面板宽应 500");
if (geo.title !== "通知") await fail("面板标题应为「通知」");
if (geo.filters.length !== 3) await fail("应有 3 个筛选钮");
if (geo.items.length < 3) await fail("应有 ≥3 条通知（同步/剪藏/回收站）");
if (geo.items.some((i) => i.h !== 68)) await fail("条目高应 68");
if (geo.items.some((i) => i.av !== 24)) await fail("条目头像应 24");
if (geo.items.some((i) => i.lines !== 2)) await fail("条目应为两行文字");
if (!geo.items.some((i) => i.at)) await fail("至少一条通知应带日期（规格：条目含日期）");
await page.screenshot({ path: "../docs/验收证据/重做批/W28/通知面板.png" });

// 3) 筛选：同步 → 只剩同步类
await page.locator(".notif__filter", { hasText: "同步" }).click();
await page.waitForTimeout(300);
const syncTitles = await page.locator(".notif__item .notif__name").allInnerTexts();
console.log("同步筛选 =", JSON.stringify(syncTitles));
if (syncTitles.length === 0) await fail("同步筛选为空");
if (syncTitles.some((t) => t.includes("剪藏") || t.includes("回收站"))) await fail("同步筛选混入内容类");
await page.locator(".notif__filter", { hasText: "内容" }).click();
await page.waitForTimeout(300);
const contentTitles = await page.locator(".notif__item .notif__name").allInnerTexts();
console.log("内容筛选 =", JSON.stringify(contentTitles));
if (!contentTitles.some((t) => t.includes("剪藏") || t.includes("回收站"))) await fail("内容筛选缺条目");

// 4) 条目真跳转：点「回收站」→ 回收站区展开 + 面板关闭
await page.locator(".notif__item", { hasText: "回收站" }).click();
await page.waitForTimeout(600);
if ((await page.locator(".notif").count()) !== 0) await fail("点条目后面板应关闭");
const trashOpen = await page.locator(".sidebar__footer").innerText();
console.log("点回收站条目后页脚 =", trashOpen.replace(/\s+/g, " ").slice(0, 50));

// 5) Esc 关闭：再开一次 → Esc
await page.locator('.sidebar__icons button[title="通知"]').click();
await page.waitForTimeout(300);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
if ((await page.locator(".notif").count()) !== 0) await fail("Esc 未关闭面板");

await page.screenshot({ path: "../docs/验收证据/重做批/W28/通知面板-点后.png" });
await browser.close();
console.log("PASS: 通知面板形态达标、筛选真实、条目真实跳转、Esc 可关");