// W43 封面设置点验：随机封面（渐变预设）/真上传换封面/移除，封面真显示
// 用法: npm run cover-check
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

// 1x1 红色 PNG（真实文件上传）
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W43/cover-失败现场.png" });
  await browser.close();
  process.exit(1);
};

// 1) 无封面时：hover 页面出「随机封面」→ 点后出现渐变封面（真显示，高 180）
await page.hover(".page");
await page.waitForTimeout(400);
const addBtn = page.locator(".cover-add .cover__btn--ghost", { hasText: "随机封面" });
if ((await addBtn.count()) === 0) await fail("无封面时应出现「随机封面」入口");
await addBtn.click();
await page.waitForTimeout(600);
const cover = page.locator(".cover");
if ((await cover.count()) === 0) await fail("随机后未出现封面");
const c1 = await page.evaluate(() => {
  const el = document.querySelector(".cover");
  const cs = getComputedStyle(el);
  return { h: Math.round(el.getBoundingClientRect().height), bg: cs.backgroundImage, title: el.getAttribute("title") };
});
console.log("渐变封面 =", JSON.stringify(c1));
if (c1.h !== 180) await fail("封面高应 180");
if (!c1.bg.includes("linear-gradient")) await fail("随机封面应为渐变");
await page.screenshot({ path: "../docs/验收证据/重做批/W43/封面-渐变.png" });

// 2) hover 封面 → 出现三个操作钮（更换/随机/移除）
await page.hover(".cover");
await page.waitForTimeout(400);
const btns = (await page.locator(".cover__actions .cover__btn").allInnerTexts()).map((t) => t.trim());
console.log("封面操作钮 =", JSON.stringify(btns));
for (const need of ["更换封面", "随机", "移除"]) {
  if (!btns.includes(need)) await fail("缺少按钮: " + need);
}

// 3) 再点随机 → 封面仍是渐变（可能换一张）
await page.locator(".cover__actions .cover__btn", { hasText: "随机" }).click();
await page.waitForTimeout(500);
const c2bg = await page.evaluate(() => getComputedStyle(document.querySelector(".cover")).backgroundImage);
console.log("再次随机 =", c2bg.slice(0, 60));
if (!c2bg.includes("linear-gradient")) await fail("再次随机后不是渐变");

// 4) 真上传一张图片换封面 → 背景变 url(...)
const fileInput = page.locator('input[type="file"][accept="image/*"]');
await fileInput.setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG });
await page.waitForTimeout(1500);
const c3 = await page.evaluate(() => {
  const el = document.querySelector(".cover");
  return el ? getComputedStyle(el).backgroundImage : "none";
});
console.log("上传后背景 =", c3.slice(0, 40));
if (!c3.includes("url(")) await fail("上传换封面未生效（背景不是 url）");
await page.screenshot({ path: "../docs/验收证据/重做批/W43/封面-上传.png" });

// 5) 移除 → 封面消失
await page.hover(".cover");
await page.waitForTimeout(300);
await page.locator(".cover__actions .cover__btn", { hasText: "移除" }).click();
await page.waitForTimeout(500);
if ((await page.locator(".cover").count()) !== 0) await fail("移除后封面应消失");

await browser.close();
console.log("PASS: 随机渐变/真上传/移除 全部真实生效，封面真显示（180 高）");