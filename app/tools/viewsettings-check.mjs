// W69 视图设置浮层点验：6 页签、视图名/自适应行高/显示序号/复制链接/拷贝视图/删除
// 用法: npm run viewsettings-check
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
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:5173" });
const page = await context.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W69/viewsettings-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};

await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);

const openSettings = async () => {
  await page.locator(".viewtab__menu").first().click();
  await page.waitForTimeout(250);
  await page.locator(".viewtab__pop .menu-item", { hasText: "视图设置" }).click();
  await page.waitForTimeout(400);
};

// 1) 浮层与六页签
await openSettings();
if ((await page.locator(".viewsettings").count()) === 0) await fail("未打开视图设置浮层");
const tabs = (await page.locator(".viewsettings__tab").allInnerTexts()).map((t) => t.trim());
console.log("页签 =", JSON.stringify(tabs));
if (tabs.join("") !== "视图属性筛选排序分组子记录") await fail("页签不符（应 视图/属性/筛选/排序/分组/子记录）");
const box = await page.locator(".viewsettings").boundingBox();
console.log("浮层尺寸 =", Math.round(box.width), "x", Math.round(box.height));
if (Math.round(box.width) !== 400) await fail("浮层宽应 400");
await page.screenshot({ path: "../docs/验收证据/重做批/W69/视图设置浮层.png" });

// 2) 视图名称
const nameInput = page.locator(".viewsettings .vs-row", { hasText: "视图名称" }).locator("input");
await nameInput.fill("我的表格");
await page.keyboard.press("Tab");
await page.waitForTimeout(500);
const tabName = (await page.locator(".viewtab__name").first().innerText()).trim();
console.log("改名后标签 =", tabName);
if (tabName !== "我的表格") await fail("视图改名未同步到标签");

// 3) 显示序号关闭 → # 列消失
const showIndex = page.locator(".viewsettings .vs-row", { hasText: "显示序号" }).locator('input[type="checkbox"]');
await showIndex.uncheck();
await page.waitForTimeout(500);
await page.locator(".viewsettings__close").click();
await page.waitForTimeout(300);
const idxHead = await page.locator(".grid__idx--head").count();
console.log("关闭显示序号后 # 表头数 =", idxHead);
if (idxHead !== 0) await fail("关闭显示序号后 # 列仍在");
await openSettings();
await page.locator(".viewsettings .vs-row", { hasText: "显示序号" }).locator('input[type="checkbox"]').check();
await page.waitForTimeout(300);

// 4) 自适应行高 → 表格类
await page.locator(".viewsettings .vs-row", { hasText: "自适应行高" }).locator('input[type="checkbox"]').check();
await page.waitForTimeout(300);
await page.locator(".viewsettings__close").click();
await page.waitForTimeout(300);
const autoCls = await page.locator("table.grid").getAttribute("class");
console.log("表格类 =", autoCls);
if (!autoCls?.includes("grid--auto-row")) await fail("自适应行高未生效");

// 5) 复制引用视图链接
await openSettings();
await page.locator(".viewsettings .menu-item", { hasText: "复制引用视图链接" }).click();
await page.waitForTimeout(400);
const clip = await page.evaluate(() => navigator.clipboard.readText());
console.log("剪贴板 =", clip);
if (!clip.includes("?view=")) await fail("复制引用视图链接未生效");

// 6) 拷贝视图 → 标签 +1
const n0 = await page.locator(".viewtab").count();
await page.locator(".viewsettings .menu-item", { hasText: "拷贝视图" }).click();
await page.waitForTimeout(700);
const n1 = await page.locator(".viewtab").count();
console.log("拷贝视图: 标签", n0, "→", n1);
if (n1 !== n0 + 1) await fail("拷贝视图未生效");

// 7) 删除视图 → 确认文案
await openSettings();
await page.locator(".viewsettings .menu-item", { hasText: "删除视图" }).click();
await page.waitForTimeout(400);
const title = await page.locator(".confirm__title").innerText();
console.log("删除确认 =", title);
if (title !== "是否确认删除该视图？") await fail("删除确认文案不符");
await page.locator(".confirm__btn", { hasText: "取消" }).click();

await browser.close();
console.log("PASS: 六页签/改名/显示序号/自适应行高/复制链接/拷贝/删除确认 全部真实生效");