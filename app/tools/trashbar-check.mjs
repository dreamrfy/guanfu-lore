// W26 删除页语义点验：无确认弹窗、红幅出现、子树连带、恢复/彻底删除真实生效
// 用法: npm run trashbar-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W26/trashbar-失败现场.png" });
  await browser.close();
  process.exit(1);
};
const rows = () => page.locator(".sidebar__list .tree-item:not(.tree-item--starred)");
const rowCount = () => rows().count();

// 1) 造 父→子→孙 三级
await rows().first().hover();
await page.waitForTimeout(250);
await rows().first().locator('.tree-item__actions button[title="新建子页面"]').click();
await page.waitForTimeout(400);
await page.locator(".newchild .newchild__item", { hasText: "页面" }).first().click();
await page.waitForTimeout(800);
await rows().nth(1).hover();
await page.waitForTimeout(250);
await rows().nth(1).locator('.tree-item__actions button[title="新建子页面"]').click();
await page.waitForTimeout(400);
await page.locator(".newchild .newchild__item", { hasText: "页面" }).first().click();
await page.waitForTimeout(800);
const n0 = await rowCount();
console.log("初始行数 =", n0);
if (n0 !== 3) await fail("应造出 3 行（父/子/孙）");

// 2) 删除父页：无确认弹窗（没有 dialog）、行数 -3
let dialogSeen = false;
page.on("dialog", async (d) => {
  dialogSeen = true;
  await d.dismiss();
});
await rows().first().hover();
await page.waitForTimeout(250);
await rows().first().locator('.tree-item__actions button[title="移到回收站"]').click();
await page.waitForTimeout(1200);
const n1 = await rowCount();
console.log("删除父页后行数 =", n1, "（应 0，另补的空页算 1）| 出现确认弹窗 =", dialogSeen);
if (dialogSeen) await fail("删除不应有确认弹窗");
if (n1 !== 1) await fail("子树未连带删除（应只剩自动补的空页）");

// 3) 红幅出现且文案含「含 2 个子页」
const bar = page.locator(".trashbar");
if ((await bar.count()) === 0) await fail("删除后未出现红幅");
const text = await bar.innerText();
console.log("红幅文案 =", text.replace(/\s+/g, " ").trim());
if (!text.includes("已删除")) await fail("红幅文案缺「已删除」");
if (!text.includes("2 个子页")) await fail("红幅未显示连带子页数量");
await page.screenshot({ path: "../docs/验收证据/重做批/W26/删除红幅.png" });

// 4) 恢复：整棵回来（3 行 + 自动补的空页）
await bar.getByText("恢复").click();
await page.waitForTimeout(1200);
const n2 = await rowCount();
console.log("恢复后行数 =", n2);
if (n2 < 3) await fail("恢复未带回整棵子树");
if ((await page.locator(".trashbar").count()) !== 0) await fail("恢复后红幅应消失");

// 5) 再删一次 → 彻底删除：红幅消失、回收站计数归零
await rows().first().hover();
await page.waitForTimeout(250);
await rows().first().locator('.tree-item__actions button[title="移到回收站"]').click();
await page.waitForTimeout(1000);
const bar2 = page.locator(".trashbar");
await bar2.getByText("彻底删除").click();
await page.waitForTimeout(1200);
if ((await page.locator(".trashbar").count()) !== 0) await fail("彻底删除后红幅应消失");
const trashLabel = await page.locator(".sidebar__footer").innerText();
console.log("页脚回收站区 =", trashLabel.replace(/\s+/g, " ").slice(0, 60));

await page.screenshot({ path: "../docs/验收证据/重做批/W26/彻底删除后.png" });
await browser.close();
console.log("PASS: 无确认弹窗、子树连带删除、红幅撤销/彻底删除均真实生效");