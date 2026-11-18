// W44 页头 hover 浮条点验：hover 才现、三格语义、添加图标/封面真实可用、评论置灰、已设置后对应格消失
// 用法: npm run pageheadbar-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W44/pageheadbar-失败现场.png" });
  await browser.close();
  process.exit(1);
};

// 1) hover 才现
const disp0 = await page.locator(".pagehead-add").evaluate((el) => getComputedStyle(el).display);
await page.hover(".page");
await page.waitForTimeout(400);
const disp1 = await page.locator(".pagehead-add").evaluate((el) => getComputedStyle(el).display);
console.log("浮条 display: 未hover =", disp0, "hover =", disp1);
if (disp0 !== "none" || disp1 === "none") await fail("浮条应 hover 才现");

// 2) 三格语义（未设图标/封面时三格都在）
const chips = (await page.locator(".pagehead-add__chip").allInnerTexts()).map((t) => t.trim());
console.log("浮条 =", JSON.stringify(chips));
for (const need of ["添加图标", "添加封面", "添加评论"]) {
  if (!chips.some((c) => c.includes(need))) await fail("缺少格: " + need);
}
const commentDisabled = await page.locator(".pagehead-add__chip", { hasText: "添加评论" }).isDisabled();
if (!commentDisabled) await fail("评论格应置灰（待专项）");
await page.screenshot({ path: "../docs/验收证据/重做批/W44/页头hover浮条.png" });

// 3) 点「添加图标」→ 图标选择器打开（真实联动）
await page.locator(".pagehead-add__chip", { hasText: "添加图标" }).click();
await page.waitForTimeout(500);
if ((await page.locator(".iconpicker").count()) === 0) await fail("添加图标未打开选择器");
await page.locator(".iconpicker__cell").first().click();
await page.waitForTimeout(500);
const iconSet = (await page.locator(".page__icon").innerText()).trim();
console.log("选完图标 =", iconSet);
if (!iconSet) await fail("选图标未生效");

// 4) 已设图标后，「添加图标」格应消失
await page.hover(".page");
await page.waitForTimeout(300);
const chips2 = (await page.locator(".pagehead-add__chip").allInnerTexts()).map((t) => t.trim());
console.log("设图标后浮条 =", JSON.stringify(chips2));
if (chips2.some((c) => c.includes("添加图标"))) await fail("已有图标时不应再显示添加图标");

// 5) 点「添加封面」→ 打开文件框（监听 click 事件）
await page.evaluate(() => {
  const input = document.querySelector('input[type="file"][accept="image/*"]');
  window.__coverDlg = false;
  input?.addEventListener("click", () => (window.__coverDlg = true), { once: true });
});
await page.locator(".pagehead-add__chip", { hasText: "添加封面" }).click();
await page.waitForTimeout(400);
const dlg = await page.evaluate(() => Boolean(window.__coverDlg));
console.log("添加封面触发文件框 =", dlg);
if (!dlg) await fail("添加封面未打开文件框");

await page.screenshot({ path: "../docs/验收证据/重做批/W44/浮条操作后.png" });
await browser.close();
console.log("PASS: 浮条 hover 才现、三格语义齐、图标/封面真实联动、评论诚实置灰");