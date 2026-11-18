// W68 视图标签栏点验：标签切换/＋新建/删除确认文案与取消/确定
// 用法: npm run viewtabs-check
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
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W68/viewtabs-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};
const tabs = () => page.locator(".viewtab");

await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);

// 1) 初始一个标签
const n0 = await tabs().count();
console.log("初始视图标签数 =", n0);
if (n0 < 1) await fail("没有视图标签");

// 2) ＋ 新建视图 → 标签 +1 且新标签选中（下划线）
await page.locator(".viewtab__add").click();
await page.waitForTimeout(700);
const n1 = await tabs().count();
const onNames = async () => (await page.locator(".viewtab--on .viewtab__name").allInnerTexts()).map((t) => t.trim());
console.log("新建后标签数 =", n1, "| 当前 =", JSON.stringify(await onNames()));
if (n1 !== n0 + 1) await fail("＋ 未新建视图");
if (!(await onNames()).some((t) => t.includes("视图 2"))) await fail("新视图未成为当前视图");

// 3) 点回第一个标签 → 切换生效
const firstName = (await page.locator(".viewtab__name").first().innerText()).trim();
await page.locator(".viewtab__name").first().click();
await page.waitForTimeout(400);
if (!(await onNames()).includes(firstName)) await fail("切换视图未生效");

// 4) ⋯ → 删除视图 → 确认文案；取消不删
await page.locator(".viewtab__menu").first().click();
await page.waitForTimeout(300);
await page.locator(".viewtab__pop .menu-item", { hasText: "删除视图" }).click();
await page.waitForTimeout(300);
const title = await page.locator(".confirm__title").innerText();
console.log("确认文案 =", title);
if (title !== "是否确认删除该视图？") await fail("确认文案不符");
await page.screenshot({ path: "../docs/验收证据/重做批/W68/删除视图确认.png" });
await page.locator(".confirm__btn", { hasText: "取消" }).click();
await page.waitForTimeout(400);
if ((await tabs().count()) !== n1) await fail("取消后视图被删了");

// 5) 再删并确定 → 标签 -1
await page.locator(".viewtab__menu").first().click();
await page.waitForTimeout(300);
await page.locator(".viewtab__pop .menu-item", { hasText: "删除视图" }).click();
await page.waitForTimeout(300);
await page.locator(".confirm__btn", { hasText: "确定" }).click();
await page.waitForTimeout(700);
const n2 = await tabs().count();
console.log("确定删除后标签数 =", n2);
if (n2 !== n1 - 1) await fail("确定删除未生效");

await page.screenshot({ path: "../docs/验收证据/重做批/W68/视图标签栏.png", fullPage: true });
await browser.close();
console.log("PASS: 视图切换/＋新建/删除确认文案与取消确定 全部真实生效");