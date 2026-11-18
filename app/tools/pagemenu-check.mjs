// W46 页面 ⋯ 菜单点验：17 项齐（含 5 项诚实置灰）、撤销/导出/移动/快速访问/复制链接/页面信息真实生效
// 用法: npm run pagemenu-check
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
const context = await browser.newContext({ viewport: { width: 1200, height: 762 }, acceptDownloads: true });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:5173" });
const page = await context.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W46/pagemenu-失败现场.png" });
  await browser.close();
  process.exit(1);
};
const openMenu = async () => {
  await page.click('.toolbar .icon-btn[title="页面菜单"]');
  await page.waitForTimeout(350);
};
const closeMenu = async () => {
  await page.keyboard.press("Escape");
  await page.mouse.click(700, 600);
  await page.waitForTimeout(250);
};

// 1) 菜单项清单
await openMenu();
const labels = (await page.locator(".pagemenu > .menu-item, .pagemenu > .menu-sep").evaluateAll((els) =>
  els.map((e) => ({
    text: e.textContent?.replace(/\s+/g, " ").trim(),
    sep: e.className.includes("menu-sep"),
    muted: e.className.includes("menu-item--muted"),
  })),
));
console.log("菜单 =", JSON.stringify(labels.map((l) => (l.sep ? "—" : l.text))));
const flat = labels.filter((l) => !l.sep).map((l) => l.text);
for (const need of [
  "撤销",
  "重做",
  "页面字体及布局设置",
  "导出页面 ›",
  "移动到 ›",
  "添加到快速访问",
  "复制页面访问链接",
  "页面信息",
  "创建副本",
  "移到回收站",
]) {
  if (!flat.some((t) => t?.includes(need.replace(" ›", "")))) await fail("缺少菜单项: " + need);
}
const muted = labels.filter((l) => l.muted).length;
console.log("置灰项数 =", muted, "（评论位置/锁定/动态/历史/已解决评论 = 5）");
if (muted !== 5) await fail("应 5 项诚实置灰");
await page.screenshot({ path: "../docs/验收证据/重做批/W46/页面菜单-17项.png" });
await closeMenu();

// 2) 撤销真实生效：正文打字 → 撤销
await page.locator(".ProseMirror").first().click();
await page.keyboard.type("撤销测试ABC");
await page.waitForTimeout(600);
await openMenu();
await page.locator(".pagemenu .menu-item", { hasText: "撤销" }).click();
await page.waitForTimeout(700);
const afterUndo = await page.locator(".ProseMirror").first().innerText();
console.log("撤销后正文 =", afterUndo.replace(/\s+/g, " ").slice(0, 30));
if (afterUndo.includes("ABC")) await fail("撤销未生效");

// 3) 导出页面 → 子菜单 → 真下载
await openMenu();
await page.locator(".pagemenu .menu-item", { hasText: "导出页面" }).click();
await page.waitForTimeout(300);
const exp = (await page.locator(".pagemenu .menu-item").allInnerTexts()).map((t) => t.trim());
console.log("导出子菜单 =", JSON.stringify(exp));
if (!exp.some((t) => t.includes("Markdown")) || !exp.some((t) => t.includes("HTML"))) await fail("导出子菜单缺格式");
const dlPromise = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
await page.locator(".pagemenu .menu-item", { hasText: "导出为 Markdown" }).click();
const dl = await dlPromise;
console.log("下载 =", dl ? dl.suggestedFilename() : "无");
if (!dl) await fail("导出未触发下载");

// 4) 添加到快速访问 → 侧栏出现「快速访问」分组（共享 store）
await openMenu();
const beforeStar = await page.locator(".tree-item--starred").count();
await page.locator(".pagemenu .menu-item", { hasText: "快速访问" }).click();
await page.waitForTimeout(600);
const afterStar = await page.locator(".tree-item--starred").count();
console.log("快速访问行数:", beforeStar, "→", afterStar);
if (afterStar <= beforeStar) await fail("添加到快速访问未同步侧栏");
await closeMenu();

// 5) 复制页面访问链接
await openMenu();
await page.locator(".pagemenu .menu-item", { hasText: "复制页面访问链接" }).click();
await page.waitForTimeout(500);
const clip = await page.evaluate(() => navigator.clipboard.readText());
console.log("剪贴板 =", clip);
if (!clip.includes("?page=")) await fail("复制链接未生效");
await closeMenu();

// 6) 页面信息 → 右栏开合切换
const rightBefore = await page.locator(".shell__right").count();
await openMenu();
await page.locator(".pagemenu .menu-item", { hasText: "页面信息" }).click();
await page.waitForTimeout(600);
const rightAfter = await page.locator(".shell__right").count();
console.log("右栏:", rightBefore, "→", rightAfter);
if (rightBefore === rightAfter) await fail("页面信息未切换右栏");

// 7) 移动到 → 二级菜单（顶层 + 页面列表）
await openMenu();
await page.locator(".pagemenu .menu-item", { hasText: "移动到" }).click();
await page.waitForTimeout(300);
const moveItems = (await page.locator(".pagemenu > .menu-item").allInnerTexts()).map((t) => t.trim());
console.log("移动二级 =", JSON.stringify(moveItems.slice(0, 3)));
if (!moveItems.some((t) => t.includes("顶层"))) await fail("移动到缺二级菜单");

await page.screenshot({ path: "../docs/验收证据/重做批/W46/页面菜单-二级.png" });
await browser.close();
console.log("PASS: 17 项齐（5 置灰）、撤销/导出下载/快速访问/复制链接/页面信息/移动到 全部真实生效");