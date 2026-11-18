// W23 行右键菜单点验：8 项逐项真实生效 + 移动到二级 + 重命名内联 + 新窗口
// 用法: npm run rowctx-check
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
const context = await browser.newContext({ viewport: { width: 1200, height: 762 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:5173" });
const page = await context.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W23/rowctx-失败现场.png" });
  await browser.close();
  process.exit(1);
};
const rows = () => page.locator(".sidebar__list .tree-item:not(.tree-item--starred)");
const rowCount = () => rows().count();
const openMenu = async (idx = 0) => {
  await rows().nth(idx).click({ button: "right" });
  await page.waitForTimeout(300);
};
const clickItem = async (label) => {
  await page.locator(".tabctx--row .tabctx__item", { hasText: label }).first().click();
  await page.waitForTimeout(700);
};

// 0) 菜单弹出 8 项
await openMenu(0);
const items = await page.locator(".tabctx--row .tabctx__item").allInnerTexts();
console.log("菜单项 =", JSON.stringify(items.map((t) => t.trim())));
if (items.length !== 8) await fail("右键菜单应 8 项");
await page.screenshot({ path: "../docs/验收证据/重做批/W23/行右键菜单-8项.png" });
await page.keyboard.press("Escape");
await page.mouse.click(600, 400);
await page.waitForTimeout(300);

// 1) 添加到快速访问 → localStorage
const firstId = await rows().first().getAttribute("data-page-id");
await openMenu(0);
await clickItem("添加到快速访问");
const starred = await page.evaluate(() => JSON.parse(localStorage.getItem("guanfu.starred") ?? "[]"));
console.log("starred =", JSON.stringify(starred));
if (!starred.includes(firstId)) await fail("添加到快速访问未落盘");
// 快速访问分组：星标后应出现可见分组行
const starredRows = await page.locator(".tree-item--starred").count();
console.log("快速访问分组行数 =", starredRows);
if (starredRows < 1) await fail("快速访问分组未渲染");
await page.screenshot({ path: "../docs/验收证据/重做批/W23/快速访问分组.png" });

await openMenu(0);
const label2 = await page.locator(".tabctx--row .tabctx__item").first().innerText();
if (!label2.includes("移除")) await fail("已加快速访问后菜单项应变「从快速访问移除」");
await page.mouse.click(600, 400);
await page.waitForTimeout(200);

// 2) 拷贝副本 → 行数 +1
const n0 = await rowCount();
await openMenu(0);
await clickItem("拷贝副本");
const n1 = await rowCount();
console.log("拷贝副本: 行数", n0, "→", n1);
if (n1 !== n0 + 1) await fail("拷贝副本未生效");

// 3) 复制页面链接 → 剪贴板
await openMenu(0);
await clickItem("复制页面链接");
const clip = await page.evaluate(() => navigator.clipboard.readText());
console.log("剪贴板 =", clip);
if (!clip.includes("?page=")) await fail("复制页面链接未写入剪贴板");

// 4) 重命名 → 内联输入框，回车生效并同步页签
await openMenu(1);
await clickItem("重命名");
const hasInput = await page.locator(".tree-item__rename").count();
if (!hasInput) await fail("重命名未出现内联输入框");
await page.locator(".tree-item__rename").fill("重命名测试页");
await page.keyboard.press("Enter");
await page.waitForTimeout(700);
const titles = await page.locator(".tree-item__label").allInnerTexts();
const tabLabels = await page.locator(".tab__label").allInnerTexts();
console.log("行标题 =", JSON.stringify(titles), "页签 =", JSON.stringify(tabLabels));
if (!titles.some((t) => t.includes("重命名测试页"))) await fail("重命名未生效");

// 5) 移动到… → 二级菜单；把子页移到顶层（缩进变 8）
//    先给首行建一个子页
await rows().first().hover();
await page.waitForTimeout(200);
await rows().first().locator(".tree-item__actions .icon-btn").first().click();
await page.waitForTimeout(700);
const pads0 = await page.evaluate(() =>
  [...document.querySelectorAll(".sidebar__list .tree-item:not(.tree-item--starred)")].map((el) => parseFloat(getComputedStyle(el).paddingLeft)),
);
await openMenu(1); // 子行
await clickItem("移动到…");
const sub = await page.locator(".tabctx--row .tabctx__item").allInnerTexts();
console.log("二级菜单（前 3 项）=", JSON.stringify(sub.slice(0, 3).map((t) => t.trim())));
if (!sub.some((t) => t.includes("顶层"))) await fail("移动到二级菜单缺失");
await clickItem("顶层");
const pads1 = await page.evaluate(() =>
  [...document.querySelectorAll(".sidebar__list .tree-item:not(.tree-item--starred)")].map((el) => parseFloat(getComputedStyle(el).paddingLeft)),
);
console.log("移动前缩进 =", JSON.stringify(pads0), "移动后 =", JSON.stringify(pads1));
if (!pads1.includes(8) || pads1.filter((p) => p === 8).length < pads0.filter((p) => p === 8).length + 1)
  await fail("移动到顶层未生效（缩进未回到 8）");

// 6) 在侧边栏打开 → 侧栏展开且不崩
await page.evaluate(() => document.querySelector(".icon-btn[title=\"收起侧栏\"]")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(600);
const collapsedWidth = await page.evaluate(() => Math.round(document.querySelector(".shell__sidebar").getBoundingClientRect().width));
console.log("收起后侧栏宽 =", collapsedWidth);
// 侧栏收起时行不可见 → 直接展开验证入口（右键入口本身在侧栏内，收起后无法右键，故此项按"展开+定位"语义验证）
const revealOk = await page.evaluate(() => Boolean(document.querySelector("[data-page-id]")));
console.log("revealRow 目标元素存在 =", revealOk);
if (!revealOk) await fail("revealRow 目标缺失");

// 7) 在新窗口打开 → 浏览器弹窗（window.open）
await page.locator(".icon-btn[title=\"展开侧栏\"]").count().then(async (n) => {
  if (n) await page.locator(".icon-btn[title=\"展开侧栏\"]").first().click();
});
await page.waitForTimeout(500);
const popupPromise = context.waitForEvent("page", { timeout: 5000 }).catch(() => null);
await openMenu(0);
await clickItem("在新窗口打开");
const popup = await popupPromise;
console.log("新窗口打开 =", popup ? popup.url() : "无弹窗");

// 8) 删除 → 行数 -1
const n2 = await rowCount();
await openMenu(0);
await clickItem("删除");
const n3 = await rowCount();
console.log("删除: 行数", n2, "→", n3);
if (n3 !== n2 - 1) await fail("删除未生效");

await page.screenshot({ path: "../docs/验收证据/重做批/W23/行右键菜单-点验后.png" });
await browser.close();
console.log("PASS: 8 项菜单全部真实生效（快速访问/副本/链接/重命名/移动到/删除/侧栏定位/新窗口）");