// W104 设置走查截图：真实浏览器打开设置弹层，4 页签逐个截图 + 深色主题整弹层截图。
// 只截图，不做断言（断言由 settings-check / settings-content-check / account-check 三脚本承担）。
// 用法: npm run w104-shot （需 dev server 已起）
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) { console.error("未找到 Chrome"); process.exit(2); }
const OUT = "../docs/验收证据/重做批/W104";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

try {
  // 入口链：工作区行 → 空间切换菜单 →「空间设置」（与 settings-check 同款选择器）
  await page.locator(".wsrow").click();
  await page.waitForTimeout(400);
  await page.locator(".tabctx__item", { hasText: "空间设置" }).click();
  await page.waitForTimeout(600);

  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  await shot("01-设置弹层-整体");

  // 左导航各项逐个截图（W102 槽位替换后：账号组=账号设置/通用设置，空间组=空间设置/MCP & SKILL）
  const items = ["账号设置", "通用设置", "MCP & SKILL"];
  let i = 2;
  for (const label of items) {
    const navItem = page.locator(".setdlg__item", { hasText: label }).first();
    await navItem.click();
    await page.waitForTimeout(500);
    await shot(`0${i}-页签-${label}`);
    i++;
  }

  // 深色主题：主题控件是 .setpane__row 里的 button（点击循环切换），与 settings-content-check 同款
  // 循环停在 MCP & SKILL 页签，先回「通用设置」
  await page.locator(".setdlg__item", { hasText: "通用设置" }).first().click();
  await page.waitForTimeout(500);
  const themeBtn = page.locator(".setpane__row", { hasText: "主题" }).locator("button");
  if (await themeBtn.count()) {
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    await themeBtn.click();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => document.documentElement.dataset.theme);
    if (after !== before) {
      await page.screenshot({ path: `${OUT}/05-深色-通用设置.png` });
      await page.locator(".setdlg__item", { hasText: "账号设置" }).first().click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/06-深色-账号设置.png` });
      // 还原
      await page.locator(".setdlg__item", { hasText: "通用设置" }).first().click();
      await themeBtn.click();
      await page.waitForTimeout(400);
    } else {
      console.log("SKIP: 主题按钮点击未变 data-theme");
    }
  } else {
    console.log("SKIP: 未找到主题按钮（走查文档如实记录）");
  }
  console.log("PASS: W104 走查截图完成");
} catch (e) {
  console.error("FAIL: " + e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
