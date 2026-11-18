// W22 页面树行交互点验：hover 态 / 选中态 / 展开收起箭头 / 缩进层级
// 用法: npm run tree-row-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W22/tree-row-失败现场.png" });
  await browser.close();
  process.exit(1);
};
const rows = () => page.locator(".sidebar__list .tree-item");
const rowCount = () => rows().count();

// 1) 造父子页：点首行的「新建子页面」动作钮
const before = await rowCount();
await rows().first().hover();
await page.waitForTimeout(300);
await rows().first().locator(".tree-item__actions .icon-btn").first().click();
await page.waitForTimeout(800);
const after = await rowCount();
console.log("行数:", before, "→", after);
if (after !== before + 1) await fail("新建子页未生效");

// 2) 缩进层级：子行比父行多缩进 14
const pads = await page.evaluate(() =>
  [...document.querySelectorAll(".sidebar__list .tree-item")].map((el) => ({
    pad: parseFloat(getComputedStyle(el).paddingLeft),
    depth: el.getAttribute("style") ?? "",
  })),
);
console.log("各行 paddingLeft =", JSON.stringify(pads.map((p) => p.pad)));
if (pads[1].pad - pads[0].pad !== 14) await fail("子行缩进应为父行 +14");

// 3) 展开/收起箭头：父行有 chevron，点击收起后子行消失
const parent = rows().first();
const chev = parent.locator(".tree-item__chev");
if ((await chev.count()) === 0) await fail("父行应有展开箭头");
await chev.click();
await page.waitForTimeout(500);
const collapsedCount = await rowCount();
console.log("收起后行数 =", collapsedCount, "（应回到", before, "）");
if (collapsedCount !== before) await fail("收起后子行应隐藏");
await chev.click();
await page.waitForTimeout(500);
if ((await rowCount()) !== after) await fail("再展开后子行应恢复");

// 4) hover 态：hover 行背景不是透明
await rows().nth(1).hover();
await page.waitForTimeout(300);
const hoverBg = await rows().nth(1).evaluate((el) => getComputedStyle(el).backgroundColor);
console.log("hover 背景 =", hoverBg);
if (hoverBg === "rgba(0, 0, 0, 0)" || hoverBg === "transparent") await fail("hover 无背景反馈");

// 5) 选中态：点行后带 tree-item--active
await rows().nth(1).click();
await page.waitForTimeout(600);
const cls = await rows().nth(1).getAttribute("class");
console.log("点击后 class =", cls);
if (!cls?.includes("tree-item--active")) await fail("选中态未生效");

await page.screenshot({ path: "../docs/验收证据/重做批/W22/页面树行交互.png" });
await browser.close();
console.log("PASS: hover/选中态/展开收起箭头/缩进层级 全部真实生效");