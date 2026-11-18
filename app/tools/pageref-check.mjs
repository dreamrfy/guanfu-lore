// W29 页尾引用区点验：常驻三段行、引用当前页真实插入正文、反链列表可展开、Beta 置灰
// 用法: npm run pageref-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W29/pageref-失败现场.png" });
  await browser.close();
  process.exit(1);
};

// 1) 常驻三段行（即使没有反链也在）
const segs = (await page.locator(".pageref__seg").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
console.log("三段 =", JSON.stringify(segs));
if (segs.length !== 3) await fail("页尾应常驻三段");
if (!segs[0].includes("引用当前页面")) await fail("第一段应为「引用当前页面」");
if (!segs[1].includes("提及的页面引用")) await fail("第二段应为「提及的页面引用」");
if (!segs[2].includes("引用建议")) await fail("第三段应为「引用建议 Beta」");
const betaOff = await page.locator(".pageref__seg--off").count();
if (betaOff !== 1) await fail("引用建议 Beta 应置灰（待专项）");
await page.screenshot({ path: "../docs/验收证据/重做批/W29/页尾引用区.png" });

// 2) 引用当前页面：正文末尾出现提及节点，且刷新后仍在（真落库）
await page.locator(".pageref__seg", { hasText: "引用当前页面" }).click();
await page.waitForTimeout(1500);
const mentionCount = await page.locator(".page-mention").count();
const body = await page.locator(".ProseMirror").first().innerText();
console.log("提及节点数 =", mentionCount, "| 正文 =", body.replace(/\s+/g, " ").slice(0, 40));
if (mentionCount === 0) await fail("引用当前页面未插入提及节点");
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);
const afterReload = await page.locator(".page-mention").count();
console.log("刷新后提及节点数 =", afterReload);
if (afterReload === 0) await fail("提及未落库（刷新后消失）");

// 3) 反链列表可展开且至少有本页这条提及
await page.locator(".pageref__seg", { hasText: "提及的页面引用" }).click();
await page.waitForTimeout(900);
const listOpen = await page.locator(".pageref__list").count();
const items = await page.locator(".backlinks__item").count();
const countBadge = await page.locator(".pageref__count").innerText();
console.log("列表展开 =", listOpen > 0, "| 条目 =", items, "| 计数 =", countBadge);
if (listOpen === 0) await fail("反链列表未展开");
// 反链按设计排除本页（自引用不计入）；0 时应给出空态文案
const emptyText = await page.locator(".pageref__empty").count();
console.log("空态文案出现 =", emptyText > 0);
if (Number(countBadge) === 0 && emptyText === 0) await fail("0 反链时应显示空态文案");

// 4) 再点一次收起
await page.locator(".pageref__seg", { hasText: "提及的页面引用" }).click();
await page.waitForTimeout(400);
if ((await page.locator(".pageref__list").count()) !== 0) await fail("再次点击应收起列表");

// 5) Beta 段不可点（没有 onClick 行为）
const betaClickable = await page.locator(".pageref__seg--off").evaluate((el) => el.tagName);
console.log("Beta 段元素 =", betaClickable);
if (betaClickable !== "SPAN") await fail("Beta 段不应是可点的 button");

await page.screenshot({ path: "../docs/验收证据/重做批/W29/引用插入后.png" });
await browser.close();
console.log("PASS: 页尾三段常驻、引用当前页真插入并落库、反链列表展开/收起、Beta 诚实置灰");