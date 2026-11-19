/**
 * W80–W83 全局搜索浮层点验（08 号规格）
 * 用法: npm run search-check   （先 npm run dev，SEARCH_BASE 可覆盖端口）
 * 证据: docs/验收证据/重做批/W80~W83/*.png
 */
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) {
  console.error("未找到 Chrome");
  process.exit(2);
}

const BASE = process.env.SEARCH_BASE ?? "http://localhost:5174/";
const OUT = "../docs/验收证据/重做批";
mkdirSync(`${OUT}/W80`, { recursive: true });
mkdirSync(`${OUT}/W81`, { recursive: true });
mkdirSync(`${OUT}/W82`, { recursive: true });
mkdirSync(`${OUT}/W83`, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await browser.close();
  process.exit(1);
};

// ---------- 桌面形态（1200×762，08 §1） ----------
const page = await browser.newPage({ viewport: { width: 1200, height: 762 }, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

// 0) 造数据：建一页，页头标题框打「磷化工笔记」+ 正文「磷酸铁锂」（标题命中 + 正文命中都有了）
//    注意：标题是页头单独的 .page__title 输入，不是 ProseMirror 正文
await page.click(".tabbar__new");
await page.waitForTimeout(700);
await page.locator(".page__title").fill("磷化工笔记");
await page.locator(".ProseMirror").first().click();
await page.keyboard.type("正文里提到磷酸铁锂的工艺");
await page.waitForTimeout(600);

// 1) W80 · Ctrl+P 真开浮层 + 输入框聚焦
await page.keyboard.press("Control+p");
await page.waitForTimeout(400);
const panel = await page.locator(".searchpanel").count();
const inputFocused = await page.evaluate(() => document.activeElement?.classList.contains("searchpanel__input") ?? false);
console.log("Ctrl+P 开浮层 =", panel, "输入框聚焦 =", inputFocused);
if (!panel) await fail("Ctrl+P 未打开搜索浮层");
if (!inputFocused) await fail("浮层打开后输入框未聚焦");

// 2) W80 · 默认态：问问 AI 行 + 最近浏览分组（含刚浏览过的「磷化工笔记」）
const aiRowText = await page.locator(".searchpanel__airow").innerText();
const recentSection = await page.locator(".searchpanel__section", { hasText: "最近浏览" }).count();
const recentItem = await page.locator(".searchpanel__item", { hasText: "磷化工笔记" }).count();
console.log("默认态 AI 行 =", JSON.stringify(aiRowText.trim()), "最近浏览分组 =", recentSection, "最近条目 =", recentItem);
if (!aiRowText.includes("问 AI")) await fail("默认态缺少「在当前页中问 AI」行");
if (!recentSection) await fail("默认态缺少「最近浏览」分组");
if (!recentItem) await fail("最近浏览里没有刚浏览过的页面");
await page.screenshot({ path: `${OUT}/W80/浮层-默认态.png` });

// 3) W80 · 页签行与过滤行
const tabsText = await page.locator(".searchpanel__tabs").innerText();
const filterBtns = await page.locator(".searchpanel__filters .searchpanel__chip-btn").count();
const creatorDisabled = await page.locator(".searchpanel__filters button", { hasText: "创建者" }).isDisabled();
console.log("页签行 =", JSON.stringify(tabsText), "过滤按钮数 =", filterBtns, "创建者置灰 =", creatorDisabled);
if (!tabsText.includes("页面") || !tabsText.includes("对话")) await fail("页签行缺「页面/对话」");
if (!creatorDisabled) await fail("创建者应诚实置灰（页面表无创建者字段）");
await page.screenshot({ path: `${OUT}/W80/浮层-过滤行.png` });

// 4) W80 · Escape 关闭
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
if (await page.locator(".searchpanel").count()) await fail("Escape 未关闭浮层");
console.log("Escape 关闭浮层 ✓");

// ---------- W81/W82 搜索语义与结果行为 ----------
// 5) 输入关键词（标题命中）→ AI 行变「问问 AI「关键词」」+ 结果条目
await page.keyboard.press("Control+p");
await page.waitForTimeout(300);
await page.keyboard.type("磷化工");
await page.waitForTimeout(900);
const aiWithQuery = await page.locator(".searchpanel__airow").innerText();
const resultItems = await page.locator(".searchpanel__item").count();
console.log("输入后 AI 行 =", JSON.stringify(aiWithQuery.trim()), "结果条目数 =", resultItems);
if (!aiWithQuery.includes("问问 AI")) await fail("输入后 AI 行未变为「问问 AI「关键词」」");
if (!resultItems) await fail("标题命中应至少 1 条结果");
await page.screenshot({ path: `${OUT}/W81/浮层-搜索结果.png` });

// 6) W82 · 点击结果跳页（浮层关闭 + 激活对应页签）
//    openTab 对已打开的页是「聚焦既有页签」而非新开页签，所以断言激活态而非页签数增长
const beforeTabs = await page.evaluate(() => document.querySelectorAll(".tab").length);
await page.locator(".searchpanel__item").first().click();
await page.waitForTimeout(600);
const afterTabs = await page.evaluate(() => document.querySelectorAll(".tab").length);
const panelGone = (await page.locator(".searchpanel").count()) === 0;
const activeTabText = await page.evaluate(() =>
  document.querySelector(".tab--active")?.textContent ?? ""
);
console.log("点击结果：浮层关闭 =", panelGone, "页签数", beforeTabs, "→", afterTabs, "激活页签 =", JSON.stringify(activeTabText.trim()));
if (!panelGone) await fail("点击结果后浮层未关闭");
if (afterTabs < beforeTabs) await fail("点击结果后页签不应减少");
if (!activeTabText.includes("磷化工笔记")) await fail("点击结果未激活对应页签");

// 7) W81 · 只搜索标题开关：正文命中被滤掉（磷酸铁锂只在正文里）
await page.keyboard.press("Control+p");
await page.waitForTimeout(300);
await page.keyboard.type("磷酸铁锂");
await page.waitForTimeout(900);
const bodyHits = await page.locator(".searchpanel__item").count();
await page.locator(".searchpanel__filters button", { hasText: "只搜索标题" }).click();
await page.waitForTimeout(700);
const titleOnlyOn = await page.locator(".searchpanel__chip-btn--on", { hasText: "只搜索标题" }).count();
const itemsAfter = await page.locator(".searchpanel__item").count();
console.log("只搜索标题开 =", titleOnlyOn, "正文命中结果", bodyHits, "→", itemsAfter);
if (bodyHits < 1) await fail("正文关键词「磷酸铁锂」应有命中（前置数据缺失）");
if (!titleOnlyOn) await fail("只搜索标题开关未点亮");
if (itemsAfter !== 0) await fail("只搜标题后正文命中应被滤掉");
await page.screenshot({ path: `${OUT}/W81/浮层-只搜标题.png` });
// 关掉开关恢复
await page.locator(".searchpanel__filters button", { hasText: "只搜索标题" }).click();
await page.waitForTimeout(500);

// 8) W81 · 排序下拉（3 项，选中态可切换；再点一次排序钮收起，不用 Escape 以免误关浮层）
await page.locator(".searchpanel__filters button", { hasText: "排序" }).click();
await page.waitForTimeout(300);
const sortItems = await page.locator(".searchpanel__sortitem").count();
if (sortItems !== 3) await fail("排序下拉应为 3 项（匹配度/编辑时间新→旧/旧→新）");
await page.locator(".searchpanel__sortitem", { hasText: "最近到最早" }).click();
await page.waitForTimeout(300);
const sortOn = await page.locator(".searchpanel__filters button", { hasText: "最近到最早" }).count();
console.log("排序选项数 =", sortItems, "切到「最近到最早」 =", sortOn);
if (!sortOn) await fail("排序切换未生效");
await page.locator(".searchpanel__filters button", { hasText: "排序" }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/W81/浮层-排序.png` });

// 9) W81 · ＋加范围（当前页入范围 chip，可移除）
await page.locator(".searchpanel__filters button", { hasText: "加范围" }).click();
await page.waitForTimeout(300);
const scopeChips = await page.locator(".searchpanel__scope").count();
console.log("范围 chip 数 =", scopeChips);
if (!scopeChips) await fail("＋加范围未产生范围 chip");
await page.locator(".searchpanel__scope-x").click();
await page.waitForTimeout(300);
if (await page.locator(".searchpanel__scope").count()) await fail("范围 chip × 未移除");
await page.screenshot({ path: `${OUT}/W81/浮层-范围chip.png` });

// ---------- W82 键盘导航 ----------
// 10) ↓↓ 移动光标、Enter 打开
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.keyboard.press("Control+p");
await page.waitForTimeout(300);
await page.keyboard.type("磷化工");
await page.waitForTimeout(900);
await page.keyboard.press("ArrowDown");
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(200);
const cursorOn = await page.locator(".searchpanel__item--on").count();
console.log("↓↓ 后选中条目 =", cursorOn);
if (cursorOn !== 1) await fail("键盘 ↓ 未移动选中态");
await page.keyboard.press("Enter");
await page.waitForTimeout(600);
if (await page.locator(".searchpanel").count()) await fail("Enter 未打开选中结果");
console.log("Enter 打开结果 ✓");
await page.screenshot({ path: `${OUT}/W82/键盘导航-打开结果.png` });

// 11) W82 · 空态：搜不存在的词 → 「无结果」提示
await page.keyboard.press("Control+p");
await page.waitForTimeout(300);
await page.keyboard.type("zzz不存在的词");
await page.waitForTimeout(700);
const emptyState = await page.locator(".searchpanel__empty").innerText();
console.log("空态提示 =", JSON.stringify(emptyState.trim()));
if (!emptyState.includes("没找到")) await fail("空搜索结果缺「没找到」空态提示");
await page.screenshot({ path: `${OUT}/W82/空态.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// ---------- W83 窄口全屏搜索 ----------
const narrow = await browser.newPage({ viewport: { width: 480, height: 762 }, deviceScaleFactor: 2 });
await narrow.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
await narrow.waitForTimeout(1500);
await narrow.keyboard.press("Control+p");
await narrow.waitForTimeout(400);
const full = await narrow.locator(".searchpanel--full").count();
const cancelBtn = await narrow.locator(".searchpanel__cancel", { hasText: "取消" }).count();
const topbarTitle = await narrow.locator(".searchpanel__topbar-title").innerText();
console.log("窄口全屏页 =", full, "取消钮 =", cancelBtn, "标题 =", JSON.stringify(topbarTitle));
if (!full) await fail("窄口未切换为全屏搜索页");
if (!cancelBtn) await fail("全屏页缺「取消」钮");
await narrow.screenshot({ path: `${OUT}/W83/窄口全屏-默认态.png` });

// browser.newPage() 是全新 context（localStorage/IndexedDB 独立），窄口里要重新造数据
await narrow.locator(".searchpanel__cancel").click();
await narrow.waitForTimeout(300);
await narrow.click(".tabbar__new");
await narrow.waitForTimeout(700);
await narrow.locator(".page__title").fill("磷化工笔记");
await narrow.locator(".ProseMirror").first().click();
await narrow.keyboard.type("正文里提到磷酸铁锂的工艺");
await narrow.waitForTimeout(600);
await narrow.keyboard.press("Control+p");
await narrow.waitForTimeout(400);

await narrow.keyboard.type("磷酸铁锂");
await narrow.waitForTimeout(900);
const narrowItems = await narrow.locator(".searchpanel__item").count();
const narrowCount = await narrow.locator(".searchpanel__count").innerText();
console.log("窄口结果条目 =", narrowItems, "计数 =", JSON.stringify(narrowCount));
if (!narrowItems) await fail("窄口搜索无结果（前置数据缺失）");
await narrow.screenshot({ path: `${OUT}/W83/窄口全屏-搜索结果.png` });

await narrow.locator(".searchpanel__cancel").click();
await narrow.waitForTimeout(300);
if (await narrow.locator(".searchpanel").count()) await fail("窄口「取消」未关闭搜索页");
console.log("窄口取消关闭 ✓");

await browser.close();
console.log("PASS: W80 浮层形态/默认态/Escape ✓，W81 只搜标题+排序+范围chip ✓，W82 点击跳页+键盘导航 ✓，W83 窄口全屏页 ✓");
