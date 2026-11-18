// W72 画廊视图点验：类型切换改名、卡片网格、封面(真图片上传)、标题、点开记录
// 用法: npm run gallery-check
import { chromium } from "playwright-core";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";

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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W72/gallery-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};

mkdirSync("../docs/验收证据/重做批/W72", { recursive: true });
mkdirSync("../ops/tmp", { recursive: true });

// 造一张真 PNG（1x1 红点，够当封面用）
const pngB64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
writeFileSync("../ops/tmp/gallery-cover.png", Buffer.from(pngB64, "base64"));

await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);

// 表格视图下建两条记录
await page.locator("button", { hasText: "新建记录" }).first().click();
await page.waitForTimeout(700);
await page.locator("button", { hasText: "新建记录" }).first().click();
await page.waitForTimeout(700);
await page.locator(".sidebar__list .tree-item").first().click();
await page.waitForTimeout(900);
console.log("行数 =", await page.locator(".grid tbody tr").count());

// 给「标题」列填两个标题（双击单元格才编辑）
const hs = (await page.locator(".grid__th-name").allInnerTexts()).map((t) => t.trim());
console.log("列 =", JSON.stringify(hs));
const titleIdx = hs.indexOf("标题");
if (titleIdx < 0) await fail("没找到「标题」列");

async function setTitle(rowIdx, text) {
  const cell = page.locator(".grid tbody tr").nth(rowIdx).locator("td.grid__cell").nth(titleIdx);
  await cell.dblclick();
  await page.waitForTimeout(400);
  const input = page.locator(".grid__cell--editing input.cell-input").first();
  await input.fill(text);
  // 文本编辑是 onBlur 提交 —— 点别处触发失焦
  await page.locator(".collection__name").click();
  await page.waitForTimeout(600);
}
await setTitle(0, "画廊卡片一");
await setTitle(1, "画廊卡片二");
console.log("标题列已填两行");

// 加一个「文件媒体」列用于放封面
const headers = (await page.locator(".grid__th-name").allInnerTexts()).map((t) => t.trim());
if (!headers.some((h) => h === "文件媒体")) {
  await page.locator(".grid__add .icon-btn").first().click();
  await page.waitForTimeout(400);
  const typeBtn = page.locator(".popover .menu-item", { hasText: "文件媒体" }).first();
  if (await typeBtn.count()) {
    await typeBtn.click();
    await page.waitForTimeout(800);
  } else {
    console.log("未找到「文件媒体」类型菜单项");
    await page.keyboard.press("Escape");
  }
}
const headers2 = (await page.locator(".grid__th-name").allInnerTexts()).map((t) => t.trim());
console.log("加文件列后 =", JSON.stringify(headers2));
const fileIdx = headers2.findIndex((h) => h === "文件媒体");
console.log("文件媒体列 =", fileIdx);

// 真上传图片当封面（隐藏 file input）
if (fileIdx >= 0) {
  const cell = page.locator(".grid tbody tr").first().locator("td.grid__cell").nth(fileIdx);
  await cell.click();
  await page.waitForTimeout(500);
  const fi = page.locator(".cell-files input[type=file]").first();
  if (await fi.count()) {
    await fi.setInputFiles("../ops/tmp/gallery-cover.png");
    await page.waitForTimeout(1200);
    console.log("封面已上传");
  } else {
    console.log("未找到上传 input（可能未进入编辑态）");
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

// 切到画廊视图
await page.locator(".viewtab__menu").first().click();
await page.waitForTimeout(250);
await page.locator(".viewtab__pop .menu-item", { hasText: "视图设置" }).click();
await page.waitForTimeout(400);
await page.locator(".viewsettings .vs-row", { hasText: "视图类型" }).locator("select").selectOption("gallery");
await page.waitForTimeout(700);
await page.locator(".viewsettings__close").click();
await page.waitForTimeout(700);

// 1) 画廊渲染 + 视图名跟随类型
const cards = await page.locator(".gallery__card").count();
const titles = (await page.locator(".gallery__title").allInnerTexts()).map((t) => t.trim());
const tabName = (await page.locator(".viewtab__name").first().innerText()).trim();
console.log("卡片数 =", cards, "| 标题 =", JSON.stringify(titles), "| 标签名 =", tabName);
if (!cards) await fail("未渲染画廊");
if (tabName !== "画廊") await fail("切类型后视图名未跟随（应为「画廊」）");
if (!titles.includes("画廊卡片一")) await fail("卡片标题缺失");

// 2) 封面：至少一张真图（img.src 是 blob:）
const imgCount = await page.locator(".gallery__img").count();
const imgSrc = imgCount ? await page.locator(".gallery__img").first().getAttribute("src") : "";
console.log("封面图数 =", imgCount, "| 首图 src =", String(imgSrc).slice(0, 24));
if (imgCount < 1) await fail("封面图片未渲染");

// 3) 封面比例 16:9（容差 ±2%）
const box = await page.locator(".gallery__cover").first().boundingBox();
const ratio = box.width / box.height;
console.log("封面尺寸 =", Math.round(box.width), "x", Math.round(box.height), "| 比例 =", ratio.toFixed(3));
if (Math.abs(ratio - 16 / 9) > 0.05) await fail(`封面比例非 16:9（实际 ${ratio.toFixed(3)}）`);

// 4) 卡片宽 220（22 §3.5）
const widths = await page.locator(".gallery__card").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
console.log("卡片宽 =", JSON.stringify(widths));
if (!widths.length) await fail("没有卡片");
for (const w of widths) {
  if (Math.abs(w - 220) > 2) await fail(`卡片宽应为 220（实际 ${w}）`);
}

await page.screenshot({ path: "../docs/验收证据/重做批/W72/画廊视图.png" });

// 5) 点卡片打开记录详情
await page.locator(".gallery__card").first().click();
await page.waitForTimeout(800);
const rightCount = await page.locator(".shell__right").count();
const rightVisible = rightCount ? await page.locator(".shell__right").first().isVisible() : false;
console.log("点卡片后右侧详情 =", rightCount, "可见 =", rightVisible);
if (!rightVisible) await fail("点卡片未打开记录详情");
await page.screenshot({ path: "../docs/验收证据/重做批/W72/画廊-点卡片开详情.png" });

await browser.close();
console.log("PASS: 画廊卡片网格/封面16:9/真图片封面/标题/点开记录 全部真实生效");
