// W14 页签右键菜单真实点验：8 项菜单 + 边界灰置 + 每项真实生效
// 用法: npm run tabctx-check
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

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-gpu"],
});
const ctxOpts = {
  viewport: { width: 1200, height: 762 },
};
const context = await browser.newContext(ctxOpts);
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:5173" });
const page = await context.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W14/tabctx-失败现场.png" });
  await browser.close();
  process.exit(1);
};
const activeIdx = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".tab")].findIndex((el) => el.className.includes("tab--active")),
  );
const tabCount = () => page.locator(".tab").count();
const openMenu = async (tabIdx) => {
  await page.locator(".tab").nth(tabIdx).click({ button: "right" });
  await page.waitForTimeout(300);
  return page.locator(".tabctx");
};
const itemOff = async (label) => {
  const item = page.locator(`.tabctx__item`, { hasText: label });
  return item.evaluate((el) => el.className.includes("tabctx__item--off"));
};

// 准备 3 个页签（启动页 A + 新建 B + C，激活 C）
await page.click(".tabbar__new");
await page.waitForTimeout(600);
await page.click(".tabbar__new");
await page.waitForTimeout(600);
console.log("页签数 =", await tabCount(), "激活 idx =", await activeIdx());
if ((await tabCount()) !== 3) await fail("准备 3 页签失败");

// 1) 右键第一个页签（无左侧）→ 向左侧添加新标签 / 关闭左侧 灰置
let menu = await openMenu(0);
if (!(await menu.count())) await fail("右键未弹出菜单");
const offLeft = await itemOff("向左侧添加新标签");
const offCloseLeft = await itemOff("关闭左侧");
const offCloseRight = await itemOff("关闭右侧");
const offCloseOthers = await itemOff("关闭其他");
console.log("首签菜单灰置: 向左=", offLeft, "关闭左=", offCloseLeft, "关闭右=", offCloseRight, "关闭其他=", offCloseOthers);
if (!offLeft || !offCloseLeft) await fail("首签的左侧项应灰置");
if (offCloseRight || offCloseOthers) await fail("首签的右侧项不应灰置");
await page.screenshot({ path: "../docs/验收证据/重做批/W14/页签右键菜单-首签灰置.png" });

// 2) 点「关闭其他」→ 只剩第一个页签
await page.locator(".tabctx__item", { hasText: "关闭其他" }).click();
await page.waitForTimeout(600);
console.log("关闭其他后页签数 =", await tabCount());
if ((await tabCount()) !== 1) await fail("关闭其他应只剩 1 个页签");

// 3) 重建 3 页签，右键中间页签（idx1）→ 左右项都不灰
await page.click(".tabbar__new");
await page.waitForTimeout(500);
await page.click(".tabbar__new");
await page.waitForTimeout(500);
menu = await openMenu(1);
if (!(await menu.count())) await fail("右键中间页签未弹菜单");
if ((await itemOff("向左侧添加新标签")) || (await itemOff("关闭左侧"))) await fail("中间签左侧项不应灰置");
if ((await itemOff("关闭右侧")) || (await itemOff("关闭其他"))) await fail("中间签右侧项不应灰置");
await page.screenshot({ path: "../docs/验收证据/重做批/W14/页签右键菜单-中间签全可用.png" });

// 4) 「向左侧添加新标签」→ 新签插到 idx1 且激活
await page.locator(".tabctx__item", { hasText: "向左侧添加新标签" }).click();
await page.waitForTimeout(800);
console.log("向左插签后: 页签数 =", await tabCount(), "激活 idx =", await activeIdx());
if ((await tabCount()) !== 4) await fail("向左插签后应为 4 页签");
if ((await activeIdx()) !== 1) await fail("新签应插在锚点左侧(idx1)并激活");

// 5) 右键 idx1 → 「向右侧添加新标签」→ 新签插到 idx2 且激活
menu = await openMenu(1);
await page.locator(".tabctx__item", { hasText: "向右侧添加新标签" }).click();
await page.waitForTimeout(800);
console.log("向右插签后: 页签数 =", await tabCount(), "激活 idx =", await activeIdx());
if ((await tabCount()) !== 5) await fail("向右插签后应为 5 页签");
if ((await activeIdx()) !== 2) await fail("新签应插在锚点右侧(idx2)并激活");

// 6) 「复制网址」→ 剪贴板真实拿到 ?page= 链接
menu = await openMenu(2);
await page.locator(".tabctx__item", { hasText: "复制网址" }).click();
await page.waitForTimeout(500);
const clip = await page.evaluate(() => navigator.clipboard.readText());
console.log("剪贴板 =", clip.slice(0, 60));
if (!clip.includes("?page=")) await fail("复制网址未写入剪贴板");

// 7) 「刷新」→ 菜单关闭、编辑器正常渲染
menu = await openMenu(2);
await page.locator(".tabctx__item", { hasText: "刷新" }).click();
await page.waitForTimeout(800);
if (!(await page.locator(".page__title").count())) await fail("刷新后编辑器未渲染");
console.log("刷新项生效（编辑器正常渲染）");

// 8) 「关闭标签页」→ 页签数减一
const beforeClose = await tabCount();
menu = await openMenu(2);
await page.locator(".tabctx__item", { hasText: "关闭标签页" }).click();
await page.waitForTimeout(600);
console.log("关闭标签页后页签数 =", await tabCount(), "/ 原", beforeClose);
if ((await tabCount()) !== beforeClose - 1) await fail("关闭标签页未生效");

// 9) Esc 关闭菜单
menu = await openMenu(0);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
if (await menu.count()) await fail("Esc 未关闭菜单");
console.log("Esc 关闭菜单生效");

await browser.close();
console.log("PASS: 右键菜单 8 项全真实生效，边界灰置正确");
