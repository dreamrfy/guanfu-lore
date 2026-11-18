// W56 拖拽与块手柄点验（可自动化部分）：
//   1) 块手柄（+ / 拖动柄）出现
//   2) 键盘 Tab 缩进 → 块真实成为嵌套（BlockNote 的缩进语义）
//   3) 侧栏跨父级拖拽（HTML5 DnD）真实生效
// 注意：块手柄的「鼠标拖拽」在 headless Playwright 下无法复现（BlockNote 用原生拖拽会话），
//       该项标注【待人工】，不计入 PASS。
// 用法: npm run drag-check
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
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W56/drag-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};

await page.click(".tabbar__new");
await page.waitForTimeout(700);
await page.locator(".ProseMirror").first().click();
await page.keyboard.type("第一段A");
await page.keyboard.press("Enter");
await page.keyboard.type("第二段B");
await page.waitForTimeout(500);

// 1) 手柄：悬停块 → 侧边菜单含「添加块」+「拖动柄」
await page.locator(".bn-block[data-id]").first().hover();
await page.waitForTimeout(500);
const buttons = await page.locator(".bn-side-menu button").evaluateAll((els) =>
  els.map((b) => ({ label: b.getAttribute("aria-label"), draggable: b.getAttribute("draggable") })),
);
console.log("手柄按钮 =", JSON.stringify(buttons));
if (!buttons.some((b) => b.label === "添加块")) await fail("缺少「添加块」按钮");
if (!buttons.some((b) => b.draggable === "true")) await fail("缺少可拖动的手柄");

// 2) Tab 缩进 → 第二块成为第一块的嵌套子块（光标已在第二段末尾）
await page.keyboard.press("Control+End");
await page.waitForTimeout(200);
await page.keyboard.press("Tab");
await page.waitForTimeout(700);
const nested = await page.evaluate(() => {
  const outers = [...document.querySelectorAll(".ProseMirror .bn-block-outer")];
  return outers.some((e) => e.querySelector(".bn-block-outer .bn-block-outer"));
});
console.log("Tab 后存在嵌套块 =", nested);
if (!nested) await fail("Tab 缩进未产生嵌套");

// 3) 侧栏跨父级拖拽
await page.click(".tabbar__new");
await page.waitForTimeout(700);
await page.locator(".page__title").fill("页面乙");
await page.waitForTimeout(500);
const rows = page.locator(".sidebar__list .tree-item:not(.tree-item--starred)");
if ((await rows.count()) < 2) await fail("侧栏不足两页");
await rows.nth(0).dragTo(rows.nth(1));
await page.waitForTimeout(1200);
const pads = await page.evaluate(() =>
  [...document.querySelectorAll(".sidebar__list .tree-item:not(.tree-item--starred)")].map((e) =>
    parseFloat(getComputedStyle(e).paddingLeft),
  ),
);
console.log("侧栏缩进（拖后）=", JSON.stringify(pads));
if (!pads.some((p) => p > Math.min(...pads))) await fail("侧栏拖拽跨父级未生效");

await page.screenshot({ path: "../docs/验收证据/重做批/W56/拖拽与手柄.png", fullPage: true });
await browser.close();
console.log("PASS（可自动化部分）：手柄存在、Tab 缩进嵌套、侧栏跨父级拖拽");
console.log("【待人工】块手柄鼠标拖拽：headless 下无法复现原生拖拽会话，请人工拖一次验收");