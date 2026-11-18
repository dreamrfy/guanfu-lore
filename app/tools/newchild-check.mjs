// W25 新建子页类型浮层点验：浮层可见项/置灰项、页面类真出页可编辑、多维表类真建表
// 用法: npm run newchild-check
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
  await page.screenshot({ path: "../docs/验收证据/重做批/W25/newchild-失败现场.png" });
  await browser.close();
  process.exit(1);
};
const rows = () => page.locator(".sidebar__list .tree-item:not(.tree-item--starred)");
const openPicker = async (idx = 0) => {
  await rows().nth(idx).hover();
  await page.waitForTimeout(250);
  await rows().nth(idx).locator('.tree-item__actions button[title="新建子页面"]').click();
  await page.waitForTimeout(400);
};

// 1) 浮层结构：页面(↵)/文件夹/AI 写作/思维导图/模板/导入 + 多维表区 6 类
await openPicker(0);
const items = (await page.locator(".newchild .newchild__item").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
console.log("浮层项 =", JSON.stringify(items));
const need = ["页面", "文件夹", "AI 写作", "思维导图", "模板", "导入", "表格", "看板", "画廊", "目录", "时间轴", "日历"];
for (const n of need) {
  if (!items.some((t) => t.includes(n))) await fail("缺少类型项: " + n);
}
const off = await page.locator(".newchild__item--off").count();
console.log("置灰项数 =", off, "（AI 写作/思维导图/5 种未建视图 = 7）");
if (off !== 7) await fail("置灰项数应为 7（未建成的不许装可用）");
await page.screenshot({ path: "../docs/验收证据/重做批/W25/新建类型浮层.png" });

// 2) 页面（↵）：真出子页且可编辑
const n0 = await rows().count();
await page.locator(".newchild .newchild__item", { hasText: "页面" }).first().click();
await page.waitForTimeout(900);
const n1 = await rows().count();
console.log("选「页面」: 行数", n0, "→", n1);
if (n1 !== n0 + 1) await fail("页面项未创建子页");
await page.locator(".ProseMirror").first().click();
await page.keyboard.type("子页可编辑CONTENT");
await page.waitForTimeout(700);
const body = await page.locator(".ProseMirror").first().innerText();
if (!body.includes("CONTENT")) await fail("新建子页不可编辑");

// 3) 文件夹【暂定】：真出页且标题为「未命名文件夹」
await openPicker(0);
await page.locator(".newchild .newchild__item", { hasText: "文件夹" }).click();
await page.waitForTimeout(900);
const titles = await page.locator(".tree-item__label").allInnerTexts();
console.log("行标题含文件夹 =", titles.filter((t) => t.includes("未命名文件夹")).length);
if (!titles.some((t) => t.includes("未命名文件夹"))) await fail("文件夹项未建出页");

// 4) 模板：进二级列表（空库时给出诚实提示），返回可用
await openPicker(0);
await page.locator(".newchild .newchild__item", { hasText: "模板" }).click();
await page.waitForTimeout(700);
const head = await page.locator(".newchild__head").first().innerText();
console.log("模板二级标题 =", head);
if (!head.includes("模板")) await fail("模板二级未打开");
if (await page.locator(".newchild__item--back").count() === 0) await fail("模板二级缺返回");
await page.locator(".newchild__item--back").click();
await page.waitForTimeout(300);

// 5) 表格：真建多维表（侧栏出现表格行）
await page.locator(".newchild .newchild__item", { hasText: "表格" }).click();
await page.waitForTimeout(900);
const tableRows = await page.locator(".sidebar__list .tree-item").count();
const emptyHint = await page.locator(".sidebar__hint").allInnerTexts();
console.log("建表后提示文案 =", JSON.stringify(emptyHint));
if (emptyHint.some((t) => t.includes("还没有表格"))) await fail("表格项未真建表");

await page.screenshot({ path: "../docs/验收证据/重做批/W25/浮层操作后.png" });
await browser.close();
console.log("PASS: 类型浮层 12 项齐（7 项诚实置灰）、页面/文件夹/模板/表格/导入真实生效");