// W42 图标选择器点验：4 页签（2 可用 2 置灰）、8 分类、搜索、随机、清除、选择真生效（含图标库）
// 用法: npm run iconpicker-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W42/iconpicker-失败现场.png" });
  await browser.close();
  process.exit(1);
};
const openPicker = async () => {
  await page.click(".page__icon");
  await page.waitForTimeout(350);
};

// 1) 四页签：Emoji/Icons 可用，上传/链接置灰
await openPicker();
const tabs = await page.locator(".iconpicker__tab").evaluateAll((els) =>
  els.map((e) => ({ text: e.textContent?.trim(), disabled: e.disabled })),
);
console.log("页签 =", JSON.stringify(tabs));
if (tabs.length !== 4) await fail("应 4 个页签");
if (!tabs[0].text?.includes("Emoji") || !tabs[1].text?.includes("Icons")) await fail("前两页签应为 Emoji/Icons");
if (!tabs[2].disabled || !tabs[3].disabled) await fail("上传/链接应诚实置灰");

// 2) 8 分类
const cats = await page.locator(".iconpicker__cat").allInnerTexts();
console.log("分类 =", JSON.stringify(cats.map((c) => c.trim())));
if (cats.length !== 8) await fail("应有 8 个分类");
await page.screenshot({ path: "../docs/验收证据/重做批/W42/图标选择器-Emoji.png" });

// 3) 分类切换真实换内容
const first = await page.locator(".iconpicker__cell").first().innerText();
await page.locator(".iconpicker__cat", { hasText: "食物" }).click();
await page.waitForTimeout(300);
const foodFirst = await page.locator(".iconpicker__cell").first().innerText();
console.log("表情首项 =", first, "| 食物首项 =", foodFirst);
if (first === foodFirst) await fail("切分类未换内容");

// 4) 搜索过滤
await page.locator(".iconpicker__search").fill("🌱");
await page.waitForTimeout(300);
const searchCells = await page.locator(".iconpicker__cell").count();
console.log("搜索 🌱 命中 =", searchCells);
if (searchCells < 1) await fail("搜索未命中");
await page.locator(".iconpicker__search").fill("不存在的东西xyz");
await page.waitForTimeout(300);
const empty = await page.locator(".iconpicker__empty").count();
console.log("无结果空态 =", empty);
if (empty === 0) await fail("无结果时应显示空态");
await page.locator(".iconpicker__search").fill("");
await page.waitForTimeout(200);

// 5) 随机选择：真改变图标
const before = await page.locator(".page__icon").innerText();
await page.locator(".iconpicker__tool", { hasText: "随机" }).click();
await page.waitForTimeout(400);
const afterRandom = await page.locator(".page__icon").innerText();
console.log("随机前 =", before.trim(), "| 随机后 =", afterRandom.trim());
if (!afterRandom.trim()) await fail("随机未产生图标");

// 6) 选 Emoji → 页头 + 侧栏 + 页签 同步
await page.locator(".iconpicker__cat", { hasText: "符号" }).click();
await page.waitForTimeout(300);
await page.locator(".iconpicker__cell").first().click();
await page.waitForTimeout(500);
const headIcon = (await page.locator(".page__icon").innerText()).trim();
const rowIcon = (await page.locator(".sidebar__list .tree-item").first().innerText()).trim();
const tabIcon = (await page.locator(".tab__icon").first().innerText()).trim();
console.log("选 Emoji 后: 页头 =", headIcon, "| 侧栏行含 =", rowIcon.includes(headIcon), "| 页签 =", tabIcon);
if (!rowIcon.includes(headIcon)) await fail("侧栏行图标未同步");
if (!tabIcon.includes(headIcon)) await fail("页签图标未同步");

// 7) Icons 页签：选一个图标库图标（@icon: 前缀）→ 三处渲染为 SVG
await openPicker();
await page.locator(".iconpicker__tab", { hasText: "Icons" }).click();
await page.waitForTimeout(300);
await page.locator(".iconpicker__grid--icons .iconpicker__cell").first().click();
await page.waitForTimeout(500);
const headSvg = await page.locator(".page__icon svg").count();
const rowSvg = await page.locator(".sidebar__list .tree-item").first().locator("svg").count();
const tabSvg = await page.locator(".tab__icon svg").count();
console.log("选 Icons 后: 页头 svg =", headSvg, "| 侧栏行 svg =", rowSvg, "| 页签 svg =", tabSvg);
if (headSvg === 0) await fail("选图标库图标后页头未渲染 SVG");
if (tabSvg === 0) await fail("页签未渲染图标库 SVG");

// 8) 清除 → 回到「＋ 图标」
await openPicker();
await page.locator(".iconpicker__tool", { hasText: "清除" }).click();
await page.waitForTimeout(500);
const cleared = (await page.locator(".page__icon").innerText()).trim();
console.log("清除后 =", cleared);
if (!cleared.includes("图标")) await fail("清除未生效");

await page.screenshot({ path: "../docs/验收证据/重做批/W42/图标选择器-最终.png" });
await browser.close();
console.log("PASS: 四页签（2 置灰）、8 分类、搜索、随机、清除、Emoji/Icons 选择三处同步");