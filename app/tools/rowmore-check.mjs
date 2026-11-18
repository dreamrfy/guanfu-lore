// W24 行「更多」⋯ 菜单点验：hover 才现、与右键菜单语义一致（8 项文案逐字相同）、菜单项真实可用
// 用法: npm run rowmore-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W24/rowmore-失败现场.png" });
  await browser.close();
  process.exit(1);
};
const rows = () => page.locator(".sidebar__list .tree-item:not(.tree-item--starred)");
const texts = () => page.locator(".tabctx--row .tabctx__item").allInnerTexts();

// 1) hover 才现：未 hover 时 actions 不可见，hover 后出现
const vis0 = await rows().first().locator(".tree-item__actions").evaluate((el) => getComputedStyle(el).display);
await rows().first().hover();
await page.waitForTimeout(400);
const vis1 = await rows().first().locator(".tree-item__actions").evaluate((el) => getComputedStyle(el).display);
console.log("actions display: 未hover =", vis0, " hover =", vis1);
if (vis0 === vis1) await fail("hover 后行内操作未显现");

// 2) ⋯ 钮位置：actions 里第一个按钮，图标语义=more
const dots = rows().first().locator('.tree-item__actions button[title="更多"]');
if ((await dots.count()) !== 1) await fail("行内应有「更多」⋯ 钮");
await page.screenshot({ path: "../docs/验收证据/重做批/W24/行hover操作钮.png" });

// 3) ⋯ 菜单 8 项文案
await dots.click();
await page.waitForTimeout(400);
const viaDots = (await texts()).map((t) => t.trim());
console.log("⋯ 菜单 =", JSON.stringify(viaDots));
if (viaDots.length !== 8) await fail("⋯ 菜单应 8 项");
await page.mouse.click(600, 400);
await page.waitForTimeout(300);

// 4) 右键菜单同 8 项、文案逐字相同
await rows().first().click({ button: "right" });
await page.waitForTimeout(400);
const viaRight = (await texts()).map((t) => t.trim());
console.log("右键菜单 =", JSON.stringify(viaRight));
if (JSON.stringify(viaRight) !== JSON.stringify(viaDots)) await fail("⋯ 菜单与右键菜单文案不一致");
await page.mouse.click(600, 400);
await page.waitForTimeout(300);

// 5) ⋯ 菜单项真实可用：拷贝副本 → 行数 +1
const n0 = await rows().count();
await rows().first().hover();
await page.waitForTimeout(300);
await rows().first().locator('.tree-item__actions button[title="更多"]').click();
await page.waitForTimeout(300);
await page.locator(".tabctx--row .tabctx__item", { hasText: "拷贝副本" }).click();
await page.waitForTimeout(800);
const n1 = await rows().count();
console.log("⋯ 菜单「拷贝副本」: 行数", n0, "→", n1);
if (n1 !== n0 + 1) await fail("⋯ 菜单项未生效");

// 6) ⋯ 菜单的重命名（内联输入）可用
await rows().nth(1).hover();
await page.waitForTimeout(250);
const dots2 = rows().nth(1).locator('.tree-item__actions button[title="更多"]');
await (await dots2.isVisible()) ? dots2.click() : null;
await page.waitForTimeout(300);
await page.locator(".tabctx--row .tabctx__item", { hasText: "重命名" }).click();
await page.waitForTimeout(400);
if (!(await page.locator(".tree-item__rename").count())) await fail("⋯ 菜单重命名未出现输入框");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

await page.screenshot({ path: "../docs/验收证据/重做批/W24/行更多菜单-8项.png" });
await browser.close();
console.log("PASS: ⋯ 菜单 hover 才现、与右键菜单 8 项文案逐字一致、菜单项真实可用");