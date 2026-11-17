// 真实浏览器截图工具（重做批验收基建）
// 用法: node tools/shot.mjs <url> <输出路径> [宽] [高] [等待毫秒]
// 复用本机 Chrome（playwright-core 不下载浏览器），支持 IndexedDB，等待网络空闲后再截。
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];

const [, , url, out, w = "1200", h = "762", wait = "1200"] = process.argv;
if (!url || !out) {
  console.error("用法: node tools/shot.mjs <url> <输出.png> [宽] [高] [等待ms]");
  process.exit(2);
}
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) {
  console.error("未找到 Chrome，请把路径加进 CHROME_PATHS");
  process.exit(2);
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-gpu"],
});
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: 2,
});
await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log(`已保存: ${out}`);
