/**
 * W92 AI 历史面板点验（10 号 §1 · 🕐 历史视图 / « 返回 / 空态 / 会话切换）
 * 用法: npm run ai-history-check   （先 npm run dev，AI_BASE 可覆盖端口）
 * 证据: docs/验收证据/重做批/W92/*.png
 *
 * 验证方式：沿用 W91 的 mock 网关思路（仅用于真实发消息产生会话落库），
 * 本点验本体是历史面板的形态与切换：空态文案、列表条目、« 返回、点条目切回会话。
 */
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) {
  console.error("未找到 Chrome");
  process.exit(2);
}

const BASE = process.env.AI_BASE ?? "http://localhost:5174/";
const OUT = "../docs/验收证据/重做批";
mkdirSync(`${OUT}/W92`, { recursive: true });

/* ---------- mock 网关（固定 5 段，120ms 一段） ---------- */
const CHUNKS = ["你好，", "这是", "一段", "流式回复", "。"];
const gateway = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    let i = 0;
    const timer = setInterval(() => {
      if (i >= CHUNKS.length) {
        clearInterval(timer);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: CHUNKS[i] } }] })}\n\n`);
      i += 1;
    }, 120);
  });
});
await new Promise((resolve) => gateway.listen(8788, "127.0.0.1", resolve));

/* ---------- 浏览器 ---------- */
const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await browser.close();
  gateway.close();
  process.exit(1);
};

const page = await browser.newPage({ viewport: { width: 1200, height: 762 }, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);
await page.click(".tabbar__new");
await page.waitForTimeout(700);

// 1) 开面板，配置 mock 供应商（同 W91）
await page.locator('.sidebar__icon[title="AI"]').click();
await page.waitForTimeout(400);
const configBtn = page.locator(".shell__ai button", { hasText: "供应商设置" });
if (await configBtn.count()) {
  await configBtn.click();
  await page.waitForTimeout(300);
}
await page.locator(".shell__ai input").first().fill("http://127.0.0.1:8788/v1");
const inputs = page.locator(".shell__ai input");
await inputs.nth(1).fill("mock-key");
await inputs.nth(2).fill("mock-model");
await page.locator(".shell__ai button", { hasText: "保存" }).click();
await page.waitForTimeout(500);
console.log("mock 供应商已保存 ✓");

// 2) 空态：什么会话都没有时 🕐 → « 历史记录 + 居中「暂无历史记录」
const tools = page.locator(".shell__ai .ai__tools .ai__tool");
if ((await tools.count()) < 2) await fail("对话视图没有出现 ⊕/🕐 工具行");
await tools.nth(1).click(); // 🕐
await page.waitForTimeout(300);
const historyView = page.locator(".shell__ai .ai__history");
if (!(await historyView.count())) await fail("点 🕐 后没有切到历史视图");
const title = await page.locator(".shell__ai .ai__history-title").innerText();
if (title !== "历史记录") await fail(`历史标题不对：${title}`);
const empty = await page.locator(".shell__ai .ai__history-empty").innerText();
if (empty !== "暂无历史记录") await fail(`空态文案不对：${empty}`);
const emptyBox = await page.locator(".shell__ai .ai__history-empty").boundingBox();
const panelBox = await page.locator(".shell__ai .ai__history").boundingBox();
if (!emptyBox || !panelBox) await fail("空态元素量不到尺寸");
const centered =
  Math.abs(emptyBox.x + emptyBox.width / 2 - (panelBox.x + panelBox.width / 2)) < 8 &&
  Math.abs(emptyBox.y + emptyBox.height / 2 - (panelBox.y + panelBox.height / 2)) < 40;
if (!centered) await fail("空态没有居中");
await page.screenshot({ path: `${OUT}/W92/历史-空态.png` });
console.log("空态：« 历史记录 + 居中「暂无历史记录」 ✓");

// 3) « 返回对话视图
await page.locator(".shell__ai .ai__history-head .ai__tool").click();
await page.waitForTimeout(300);
if (!(await page.locator(".shell__ai .ai__row .clip-input").count()))
  await fail("点 « 后没有回到对话视图");
console.log("« 返回对话视图 ✓");

// 4) 造两个会话：发消息 → ⊕ 新对话 → 再发消息
await page.locator(".shell__ai .ai__row .clip-input").fill("历史会话甲");
await page.locator(".shell__ai .ai__row button", { hasText: "发送" }).click();
await page.waitForTimeout(1300);
await page.locator('.shell__ai .ai__tools .ai__tool[title="新对话"]').click();
await page.waitForTimeout(200);
await page.locator(".shell__ai .ai__row .clip-input").fill("历史会话乙");
await page.locator(".shell__ai .ai__row button", { hasText: "发送" }).click();
await page.waitForTimeout(1300);
console.log("两个会话已产生 ✓");

// 5) 再开历史：两条条目，最近（乙）在前
await page.locator('.shell__ai .ai__tools .ai__tool[title="历史记录"]').click();
await page.waitForTimeout(300);
const items = page.locator(".shell__ai .ai__history-item");
const n = await items.count();
if (n !== 2) await fail(`历史条目应有 2 条，实际 ${n}`);
const first = await items.nth(0).locator(".ai__history-item-title").innerText();
const second = await items.nth(1).locator(".ai__history-item-title").innerText();
if (first !== "历史会话乙" || second !== "历史会话甲")
  await fail(`历史排序不对：首条=${first} 次条=${second}`);
if (!(await items.nth(0).locator(".ai__history-item-time").innerText()))
  await fail("历史条目缺时间");
await page.screenshot({ path: `${OUT}/W92/历史-列表.png` });
console.log("列表：2 条条目、最近在前、带时间 ✓");

// 6) 点甲 → 切回那个会话（对话视图 + 甲的消息都在）
await items.nth(1).click();
await page.waitForTimeout(300);
const userMsg = await page.locator(".shell__ai .ai__msg--user").first().innerText();
if (userMsg !== "历史会话甲") await fail(`切换会话失败：首条用户消息=${userMsg}`);
const assistantMsg = await page.locator(".shell__ai .ai__msg--assistant").last().innerText();
if (assistantMsg !== "你好，这是一段流式回复。") await fail(`甲的回复不在：${assistantMsg}`);
await page.screenshot({ path: `${OUT}/W92/历史-切换会话.png` });
console.log("切换：点甲 → 对话视图恢复甲的用户消息+回复 ✓");

// 7) 续聊写回同一条记录：在甲里再发一条 → 历史仍只有 2 条且甲时间最新
await page.locator(".shell__ai .ai__row .clip-input").fill("甲的续聊");
await page.locator(".shell__ai .ai__row button", { hasText: "发送" }).click();
await page.waitForTimeout(1300);
await page.locator('.shell__ai .ai__tools .ai__tool[title="历史记录"]').click();
await page.waitForTimeout(300);
const n2 = await page.locator(".shell__ai .ai__history-item").count();
if (n2 !== 2) await fail(`续聊后历史应仍 2 条（写回同记录），实际 ${n2}`);
const first2 = await page.locator(".shell__ai .ai__history-item-title").first().innerText();
if (first2 !== "历史会话甲") await fail(`续聊后甲应排最前，实际首条=${first2}`);
console.log("续聊写回同一条记录、updatedAt 排序刷新 ✓");

await browser.close();
gateway.close();
console.log("W92 历史面板点验全过 PASS");
