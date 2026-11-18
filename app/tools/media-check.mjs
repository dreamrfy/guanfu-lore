// W52 媒体与文件块点验：图片/视频/音频/文件块插入、图片与文件真上传、书签输入、Callout 文本与落库
// 用法: npm run media-check
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

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const TXT = Buffer.from("媒体块上传验证文本\n", "utf8");

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W52/media-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};
const newPage = async (title) => {
  await page.click(".tabbar__new");
  await page.waitForTimeout(700);
  if (title) {
    await page.locator(".page__title").fill(title);
    await page.waitForTimeout(400);
  }
  await page.locator(".ProseMirror").first().click();
};
const slash = async (q) => {
  await page.keyboard.type("/" + q);
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
};

// 1) 四类媒体块可插入
await newPage();
for (const [q, type] of [
  ["图片", "image"],
  ["视频", "video"],
  ["音频", "audio"],
  ["文件", "file"],
]) {
  await slash(q);
  const n = await page.locator(`[data-content-type="${type}"]`).count();
  console.log(`${q}块渲染 =`, n);
  if (n === 0) await fail(`${q}块未插入`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
}

// 2) 图片真上传：点「添加图片」捕获文件选择
await newPage("媒体·图片");
await slash("图片");
const imgBlock = page.locator('[data-content-type="image"]').last();
await imgBlock.locator(".bn-add-file-button").click();
await page.waitForTimeout(400);
// BlockNote 的文件选择框是隐藏 input（不一定触发 filechooser 事件）→ 直接给它塞文件
const imgInput = page.locator('input[type="file"][accept="image/*"]').last();
await imgInput.setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: PNG });
await page.waitForTimeout(2000);
const imgSrc = await page.locator('[data-content-type="image"] img').first().getAttribute("src").catch(() => null);
console.log("图片 src =", (imgSrc ?? "").slice(0, 40));
if (!imgSrc || !/^(blob:|data:|asset)/.test(imgSrc)) await fail("图片上传后未渲染图片");

// 3) 文件块真上传
await newPage("媒体·文件");
await slash("文件");
const fileBlock = page.locator('[data-content-type="file"]').last();
await fileBlock.locator(".bn-add-file-button").click();
await page.waitForTimeout(400);
// 文件块会新建一个 accept 为空的隐藏 input → 取最后一个非图片/非 md 的
const anyInput = page.locator('input[type="file"]:not([accept="image/*"]):not([accept*=".md"]):not([accept*="json"])').last();
await anyInput.setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: TXT });
await page.waitForTimeout(2000);
const fileText = await page.locator('[data-content-type="file"]').last().innerText();
console.log("文件块内容 =", fileText.replace(/\s+/g, " ").slice(0, 60));
if (!fileText.includes("note")) await fail("文件上传后未显示文件名");

// 4) 书签：粘贴网址回车
await newPage("媒体·书签");
await slash("书签");
const bmInput = page.locator(".bookmark__url-input");
if ((await bmInput.count()) === 0) await fail("书签块未出现网址输入框");
await bmInput.fill("example.com/article");
await bmInput.press("Enter");
await page.waitForTimeout(900);
const bmText = await page.locator('[data-content-type="bookmark"], .bookmark').last().innerText();
console.log("书签内容 =", bmText.replace(/\s+/g, " ").slice(0, 60));
if (!bmText.includes("example.com")) await fail("书签未生成（域名未显示）");

// 5) 着重文字：插入并输入文字
await newPage("媒体·着重");
await slash("着重文字");
await page.waitForTimeout(400);
await page.keyboard.type("重点提醒内容CALLOUT");
await page.waitForTimeout(700);
const calloutText = await page.locator('[data-content-type="callout"]').last().innerText().catch(() => "");
console.log("着重文字 =", calloutText.replace(/\s+/g, " ").slice(0, 40));
if (!calloutText.includes("CALLOUT")) await fail("着重文字未可编辑");

// 6) 落库：刷新后图片/文件/书签/着重文字仍在
await page.waitForTimeout(900);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2400);
const checks = [
  ["媒体·图片", '[data-content-type="image"] img', "图片"],
  ["媒体·文件", '[data-content-type="file"]', "文件"],
  ["媒体·书签", '[data-content-type="bookmark"]', "书签"],
  ["媒体·着重", '[data-content-type="callout"]', "着重文字"],
];
for (const [tabTitle, sel, name] of checks) {
  await page.locator(".tab", { hasText: tabTitle }).first().click();
  await page.waitForTimeout(800);
  const n = await page.locator(sel).count();
  console.log(`刷新后 ${name} = ${n}`);
  if (n === 0) await fail(`刷新后 ${name} 丢失（未落库）`);
}

await page.screenshot({ path: "../docs/验收证据/重做批/W52/媒体与文件块.png", fullPage: true });
await browser.close();
console.log("PASS: 四类媒体块插入、图片/文件真上传、书签、着重文字 全部真实可用");