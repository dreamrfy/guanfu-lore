/**
 * H04 端到端自验走查（扩展划线 → 客户端看到高亮）。
 *
 * 前置（各起一个）：
 *   1. node docs/验收证据/app-H04/mock-clip-server.mjs   （8787：剪藏契约 + 划线契约 + 活页文章）
 *   2. npm run dev（app/，5173）
 *   3. Chrome 调试实例（加载未打包扩展）：
 *      chrome.exe --remote-debugging-port=9223 --user-data-dir=<新目录>
 *                 --load-extension=<仓库>/extension --disable-extensions-except=<仓库>/extension
 *                 --no-first-run --no-default-browser-check --window-size=1600,1000
 *
 * 走查（真浏览器、真扩展、真 IndexedDB，服务端按真实契约 mock）：
 *   1. 扩展 popup 填服务地址/Token（chrome.storage.local）
 *   2. 活页文章选中第一段 → 浮钮「🖍 划线」→ 上报 → 「已划线」提示
 *   3. 第二段再划一条（多条共存）
 *   4. app 开机自动入库 → 收集箱点开记录 → 详情出现「🖍 划线（2）」两条摘录带 mark
 *
 * 用法（cwd 必须在 E:/dev/tools/flowus-cap，能解析到 playwright-core）：
 *   node <本文件> <截图输出目录>
 */
import { chromium } from "playwright-core";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2];
if (!outDir) { console.error("用法: node h04-walkthrough.mjs <截图输出目录>"); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const ARTICLE = "http://127.0.0.1:8787/article.html";
const APP = "http://localhost:5173/";
const EXTSRC = "E:/VBcoding/bijiapp/extension";
const HIGHLIGHT1 = "验证扩展划线会按引文定位回客户端正文";
const HIGHLIGHT2 = "多条划线共存";

const shot = async (page, name) => {
  const file = path.join(outDir, name);
  await page.bringToFront();
  await page.screenshot({ path: file, type: "png", timeout: 15000 });
  console.log("[shot]", name);
};

// 未打包扩展的 ID（兜底）：Chromium id_util 的算法——路径 UTF-16LE 编码取 SHA-256，
// 前 16 字节每个 nibble 映射到 a-p，共 32 个字母
function unpackedExtId(absPath) {
  const sum = crypto.createHash("sha256").update(Buffer.from(absPath, "utf16le")).digest();
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += "abcdefghijklmnop"[sum[i] >> 4];
    id += "abcdefghijklmnop"[sum[i] & 0xf];
  }
  return id;
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const ctx = browser.contexts()[0] ?? (await browser.newContext());
// 该实例不允许 newPage（Target.createTarget 受限），复用现成页面
const page = ctx.pages().find((p) => !p.isClosed()) ?? (await ctx.newPage());
console.log("[h04] 复用页面:", page.url());

// ---- 0. 找扩展 ID：优先 service worker target，兜底路径哈希 ----
let extId = null;
for (let i = 0; i < 20 && !extId; i++) {
  for (const sw of ctx.serviceWorkers()) {
    const m = sw.url().match(/^chrome-extension:\/\/([a-p]{32})\//);
    if (m) { extId = m[1]; break; }
  }
  if (!extId) await page.waitForTimeout(500);
}
if (!extId) {
  // 兜底 2：chrome://extensions 的 items 列表（双层 shadow DOM）读扩展 ID。
  try {
    await page.goto("chrome://extensions/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("extensions-manager", { timeout: 5000 });
    extId = await page.evaluate(() => {
      const mgr = document.querySelector("extensions-manager");
      const list = mgr?.shadowRoot?.querySelector("extensions-item-list");
      const item = list?.shadowRoot?.querySelector("extensions-item");
      return item?.id || null;
    });
    if (extId) console.log("[h04] 扩展 ID（chrome://extensions）=", extId);
  } catch {}
}
if (!extId) { extId = unpackedExtId(EXTSRC); console.log("[h04] SW 未发现，用路径哈希 ID:", extId); }

// ---- 1. popup 配置服务地址与 Token ----
await page.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: "domcontentloaded" });
await page.fill("#server", "http://127.0.0.1:8787");
await page.fill("#token", "h04-mock-token");
await page.click("#save");
await page.waitForTimeout(300);
console.log("[h04] 扩展配置已保存");

// ---- 2. 活页文章：选区 → 浮钮 → 上报 ----
const selectAndClick = async (text, shotName) => {
  await page.goto(ARTICLE, { waitUntil: "domcontentloaded" });
  // 等 content script 注入完成（右下角「✂ 剪藏」常驻钮出现）
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("剪藏")), { timeout: 10000 });
  const ok = await page.evaluate((needle) => {
    const p = [...document.querySelectorAll("p")].find((el) => el.textContent.includes(needle));
    if (!p) return false;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.nodeValue.indexOf(needle);
      if (i >= 0) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + needle.length);
        sel.addRange(range);
        document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        return true;
      }
    }
    return false;
  }, text);
  if (!ok) throw new Error("选区失败：" + text);
  await page.waitForSelector("#biji-hl-btn", { timeout: 5000 });
  await shot(page, shotName);
  await page.click("#biji-hl-btn");
  await page.waitForFunction(() => document.body.innerText.includes("已划线"), { timeout: 8000 });
  console.log("[h04] 已划线:", text);
  return true;
};

await selectAndClick(HIGHLIGHT1, "1-文章页选区划线浮钮.png");
await page.waitForTimeout(400);
await shot(page, "2-划线成功-已划线提示.png");
await selectAndClick(HIGHLIGHT2, "3-第二条划线成功.png");

// 核对 mock 里的划线数（真 HTTP 读回）
const listed = await page.evaluate(async () => {
  const r = await fetch("http://127.0.0.1:8787/api/highlights?pageUrl=" + encodeURIComponent(location.href));
  return (await r.json()).items.length;
});
console.log("[h04] mock 划线数 =", listed, "（应为 2）");
if (listed !== 2) throw new Error("划线数不对：" + listed);

// ---- 3. 客户端：清库 → 开机自动入库 → 打开详情看划线 ----
await page.goto(APP, { waitUntil: "domcontentloaded" });
await page.evaluate(async () => {
  const dbs = await indexedDB.databases();
  await Promise.all(dbs.map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); })));
  localStorage.clear();
});
await page.goto(APP, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".sidebar__badge", { timeout: 20000 });
console.log("[h04] 侧栏角标 =", await page.locator(".sidebar__badge").first().innerText());

await page.locator('.tree-item:has-text("剪藏库")').first().click();
await page.waitForTimeout(400);
await page.locator("tbody tr").first().click();
await page.waitForSelector(".record__marks", { timeout: 10000 });
await page.waitForTimeout(600);
const marksLabel = await page.locator(".record__marks-label").innerText();
const markTexts = await page.locator(".record__mark mark").allInnerTexts();
console.log("[h04] 划线区块 =", marksLabel, "| mark 数 =", markTexts.length);
console.log("[h04] mark 内容 =", JSON.stringify(markTexts));
if (markTexts.length !== 2 || !markTexts.includes(HIGHLIGHT1) || !markTexts.includes(HIGHLIGHT2)) {
  throw new Error("客户端 mark 与划线不一致：" + JSON.stringify(markTexts));
}
await page.locator(".record__marks").scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await shot(page, "4-客户端详情-划线区块.png");

console.log("[h04] 走查完成，截图在", outDir);
process.exit(0);
