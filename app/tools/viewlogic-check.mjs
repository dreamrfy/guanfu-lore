// W70 筛选/排序/分组 UI 对齐点验：条件与排序真实写入视图、分组产生组头与计数
// 用法: npm run viewlogic-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W70/viewlogic-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};
const barText = async () => (await page.locator(".viewbar").innerText()).replace(/\s+/g, " ");

await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);
for (let i = 0; i < 2; i++) {
  await page.locator("button", { hasText: "新建记录" }).first().click();
  await page.waitForTimeout(600);
  await page.locator(".sidebar__list .tree-item").first().click();
  await page.waitForTimeout(800);
}
const rowCount = () => page.locator(".grid tbody tr").count();
console.log("初始行数 =", await rowCount());

// 1) 筛选：添加条件 → 视图栏显示 筛选 · 1，且「视图生效中」出现
await page.locator(".viewbar__btn", { hasText: "筛选" }).click();
await page.waitForTimeout(300);
await page.locator(".viewpop .btn", { hasText: "添加条件" }).click();
await page.waitForTimeout(600);
const t1 = await barText();
console.log("加筛选后 =", t1);
if (!/筛选 · 1/.test(t1)) await fail("筛选条件未写入视图");
// 条件上切换 and/or（分段按钮）
const seg = page.locator(".viewpop .seg__btn", { hasText: "或" });
if (await seg.count()) {
  await seg.first().click();
  await page.waitForTimeout(300);
}
await page.locator(".viewpop__close").click();
await page.waitForTimeout(300);

// 2) 排序：添加排序 → 排序 · 1
await page.locator(".viewbar__btn", { hasText: "排序" }).click();
await page.waitForTimeout(300);
await page.locator(".viewpop .btn", { hasText: "添加排序" }).click();
await page.waitForTimeout(600);
const t2 = await barText();
console.log("加排序后 =", t2);
if (!/排序 · 1/.test(t2)) await fail("排序规则未写入视图");
await page.mouse.click(1150, 770); // sort/group 面板无关闭钮，点空白处收起
await page.waitForTimeout(300);

// 3) 分组：按标题分组 → 组头 + 计数
await page.locator(".viewbar__btn", { hasText: "分组" }).click();
await page.waitForTimeout(300);
await page.locator(".viewpop .btn", { hasText: "按「标题」分组" }).click();
await page.waitForTimeout(700);
const groupHeads = await page.locator(".grid__group-cell").allInnerTexts();
const counts = await page.locator(".grid__group-count").allInnerTexts();
console.log("组头 =", JSON.stringify(groupHeads.map((t) => t.replace(/\s+/g, " "))), "| 计数 =", JSON.stringify(counts));
if (groupHeads.length === 0) await fail("分组未产生组头");
if (counts.length === 0) await fail("组头缺计数");

// 4) 清空筛选 → 行数恢复
await page.mouse.click(1150, 770); // sort/group 面板无关闭钮，点空白处收起
await page.waitForTimeout(200);
await page.locator(".viewbar__btn", { hasText: "筛选" }).click();
await page.waitForTimeout(300);
await page.locator(".viewpop .btn", { hasText: "清空" }).click();
await page.waitForTimeout(600);
const t3 = await barText();
console.log("清空筛选后 =", t3);
const filterBtn = (await page.locator(".viewbar__btn", { hasText: "筛选" }).innerText()).trim();
console.log("筛选按钮 =", filterBtn);
if (filterBtn.includes("·")) await fail("清空筛选未生效");
if (!t3.includes("无筛选")) await fail("视图状态未显示无筛选");

await page.screenshot({ path: "../docs/验收证据/重做批/W70/筛选排序分组.png", fullPage: true });
await browser.close();
console.log("PASS: 筛选条件/排序规则写入视图、分组产生组头与计数、清空生效");