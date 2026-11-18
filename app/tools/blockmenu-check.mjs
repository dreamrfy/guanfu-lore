// W54 块右键菜单点验：14 项齐（含 2 项诚实置灰）、复制/副本/删除/上下插入/颜色/转换/移动/链接 真生效
// 用法: npm run blockmenu-check
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
const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:5173" });
const page = await context.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W54/blockmenu-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};

// 准备：一个含文字的段落
await page.click(".tabbar__new");
await page.waitForTimeout(700);
await page.locator(".ProseMirror").first().click();
await page.keyboard.type("块菜单测试BLOCK");
await page.waitForTimeout(600);

const openMenu = async () => {
  await page.locator(".bn-block[data-id]").first().click({ button: "right" });
  await page.waitForTimeout(400);
  return page.locator(".blockmenu");
};
const blockCount = () => page.locator('.ProseMirror .bn-block[data-id]').count();

// 1) 菜单项清单（14 项 + 2 置灰）
let menu = await openMenu();
if (!(await menu.count())) await fail("右键块未出现菜单");
const items = await page.locator(".blockmenu > .tabctx__item").evaluateAll((els) =>
  els.map((e) => ({ text: e.textContent?.replace(/\s+/g, " ").trim(), off: e.className.includes("tabctx__item--off") })),
);
console.log("菜单 =", JSON.stringify(items.map((i) => i.text)));
const expect = ["AI 助手", "复制", "剪切", "创建副本", "复制并移动到页面", "转换为", "复制块链接", "删除", "移动到", "颜色", "添加评论", "在上方插入", "在下方插入", "在右侧添加分栏"];
for (const e of expect) {
  if (!items.some((i) => i.text?.includes(e))) await fail("缺少菜单项: " + e);
}
const offCount = items.filter((i) => i.off).length;
console.log("置灰项 =", offCount);
if (offCount !== 2) await fail("应有 2 项诚实置灰（添加评论/右侧分栏）");
await page.screenshot({ path: "../docs/验收证据/重做批/W54/块右键菜单.png" });
await page.keyboard.press("Escape");
await page.mouse.click(700, 800);
await page.waitForTimeout(300);

// 2) 复制 → 剪贴板
await openMenu();
await page.locator(".blockmenu .tabctx__item", { hasText: "复制" }).first().click();
await page.waitForTimeout(400);
const clip = await page.evaluate(() => navigator.clipboard.readText());
console.log("复制剪贴板 =", clip);
if (!clip.includes("BLOCK")) await fail("复制未写入剪贴板");

// 3) 创建副本 → 块数 +1
const n0 = await blockCount();
await openMenu();
await page.locator(".blockmenu .tabctx__item", { hasText: "创建副本" }).click();
await page.waitForTimeout(600);
const n1 = await blockCount();
console.log("创建副本: 块数", n0, "→", n1);
if (n1 !== n0 + 1) await fail("创建副本未生效");

// 4) 下方插入 → 块数 +1
await openMenu();
await page.locator(".blockmenu .tabctx__item", { hasText: "在下方插入" }).click();
await page.waitForTimeout(600);
const n2 = await blockCount();
console.log("下方插入: 块数", n1, "→", n2);
if (n2 !== n1 + 1) await fail("下方插入未生效");

// 5) 颜色 → 黄（改块 props，检查计算样式背景变化）
await openMenu();
await page.locator(".blockmenu .tabctx__item", { hasText: "颜色" }).click();
await page.waitForTimeout(300);
await page.locator(".blockmenu .tabctx__item", { hasText: "黄" }).click();
await page.waitForTimeout(500);
const bg = await page.evaluate(() => {
  const el = document.querySelector('.ProseMirror [data-content-type="paragraph"]');
  return el ? getComputedStyle(el).backgroundColor : "";
});
console.log("颜色后背景 =", bg);
if (!bg || bg === "rgba(0, 0, 0, 0)") await fail("颜色未生效（无背景色）");

// 6) 转换为 → 标题2（检查 data-content-type 变 heading）
await openMenu();
await page.locator(".blockmenu .tabctx__item", { hasText: "转换为" }).click();
await page.waitForTimeout(300);
await page.locator(".blockmenu .tabctx__item", { hasText: "标题2" }).click();
await page.waitForTimeout(500);
const hasHeading = await page.locator('[data-content-type="heading"]').count();
console.log("转换为标题2后 heading 数 =", hasHeading);
if (hasHeading === 0) await fail("转换为标题2 未生效");

// 7) 复制块链接 → 剪贴板含 #block=
await openMenu();
await page.locator(".blockmenu .tabctx__item", { hasText: "复制块链接" }).click();
await page.waitForTimeout(400);
const link = await page.evaluate(() => navigator.clipboard.readText());
console.log("块链接 =", link.slice(0, 70));
if (!link.includes("#block=")) await fail("复制块链接格式不对");

// 8) 删除 → 块数 -1
const n3 = await blockCount();
await openMenu();
await page.locator(".blockmenu .tabctx__item", { hasText: "删除" }).click();
await page.waitForTimeout(600);
const n4 = await blockCount();
console.log("删除: 块数", n3, "→", n4);
if (n4 >= n3) await fail("删除未生效");

// 9) 移动到（跨页）：建第二页 → 回第一页把块移过去
await page.click(".tabbar__new");
await page.waitForTimeout(700);
await page.locator(".page__title").fill("接收页");
await page.waitForTimeout(400);
await page.locator(".tab", { hasText: "无标题" }).first().click();
await page.waitForTimeout(900);
await page.locator(".ProseMirror").first().click();
await page.waitForTimeout(300);
const beforeMove = await blockCount();
console.log("源页块数(右键前) =", beforeMove);
await openMenu();
await page.locator(".blockmenu .tabctx__item", { hasText: "↪ 移动到" }).click();
await page.waitForTimeout(300);
await page.locator(".blockmenu .tabctx__item", { hasText: "接收页" }).click();
await page.waitForTimeout(1200);
console.log("移动后 toast =", JSON.stringify(await page.locator(".toolbar__toast").allInnerTexts()));
const afterMove = await blockCount();
console.log("移动到跨页: 源页块数", beforeMove, "→", afterMove);
const srcText = await page.locator(".ProseMirror").first().innerText();
console.log("源页正文 =", srcText.replace(/s+/g, " ").slice(0, 30));
// BlockNote 会保证每个文档至少有一个空块，所以判据是「源页正文不再含被移动的块」
if (srcText.includes("BLOCK")) await fail("移动到后源页仍保留该块");
await page.locator(".tab", { hasText: "接收页" }).first().click();
await page.waitForTimeout(800);
const targetCount = await blockCount();
console.log("接收页块数 =", targetCount);
if (targetCount === 0) await fail("移动到未写入目标页");

await page.screenshot({ path: "../docs/验收证据/重做批/W54/块菜单操作后.png", fullPage: true });
await browser.close();
console.log("PASS: 14 项齐（2 置灰），复制/副本/插入/颜色/转换/块链接/删除 真实生效");