/**
 * W91 AI 面板会话点验（10 号 §1 · 输入/发送/流式/停止/落库）
 * 用法: npm run ai-chat-check   （先 npm run dev，AI_BASE 可覆盖端口）
 * 证据: docs/验收证据/重做批/W91/*.png
 *
 * 验证方式：脚本自带一个 OpenAI 兼容 mock 网关（SSE 5 段流式，250ms 一段），
 * 把面板供应商指向它——链路（fetch → SSE 解析 → 增量渲染 → 停止 → IndexedDB 落库）全真，
 * 只有「模型」是假的。刷新后会话仍在 = 落库实锤。
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
mkdirSync(`${OUT}/W91`, { recursive: true });

/* ---------- mock 网关 ---------- */
const CHUNKS = ["你好，", "这是", "一段", "流式回复", "。"];
let slow = false; // 第二轮放慢，给「停止」留时间
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
    const useSlow = slow;
    slow = false;
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
    }, useSlow ? 700 : 120);
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

// 1) 开面板，把供应商指向 mock 网关
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
const inputBox = page.locator(".shell__ai .ai__row .clip-input");
if (!(await inputBox.count())) await fail("保存后没有回到对话输入框");
console.log("mock 供应商已保存 ✓");

// 2) 发送 → 流式渲染（5 段增量）
await inputBox.fill("流式测试");
await page.locator(".shell__ai .ai__row button", { hasText: "发送" }).click();
await page.waitForTimeout(300);
const streaming = await page.locator(".shell__ai .ai__msg--assistant").count();
console.log("流式中已出现 assistant 消息 =", streaming);
if (!streaming) await fail("发送后 300ms 内没有出现 assistant 消息（不像流式）");
await page.waitForTimeout(1000);
const fullText = await page.locator(".shell__ai .ai__msg--assistant").last().innerText();
console.log("流式全文 =", JSON.stringify(fullText));
if (fullText !== "你好，这是一段流式回复。") await fail(`流式全文不对：${fullText}`);
await page.screenshot({ path: `${OUT}/W91/流式回复.png` });

// 3) 停止：慢速一轮，中途中止，部分文字保留
slow = true;
await inputBox.fill("停止测试");
await page.locator(".shell__ai .ai__row button", { hasText: "发送" }).click();
await page.waitForTimeout(1100); // 收到 1~2 段
const stopBtn = page.locator(".shell__ai .ai__row button", { hasText: "停止" });
if (!(await stopBtn.count())) await fail("流式进行中没有「停止」按钮");
await stopBtn.click();
await page.waitForTimeout(300);
const sendBack = await page.locator(".shell__ai .ai__row button", { hasText: "发送" }).count();
const partial = await page.locator(".shell__ai .ai__msg--assistant").last().innerText();
console.log("点停止后发送钮恢复 =", sendBack, "部分文本 =", JSON.stringify(partial));
if (!sendBack) await fail("停止后没有回到「发送」态");
if (!partial || partial === "你好，这是一段流式回复。") await fail("停止后部分文本不保留或没收到增量");
await page.screenshot({ path: `${OUT}/W91/停止-部分保留.png` });

// 4) 刷新后会话仍在（落库实锤）
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);
if (!(await page.locator(".shell__ai").count())) {
  await page.locator('.sidebar__icon[title="AI"]').click();
  await page.waitForTimeout(500);
}
const restored = await page.locator(".shell__ai .ai__msg--assistant").count();
console.log("刷新后 assistant 消息条数 =", restored);
if (restored < 2) await fail("刷新后历史会话没恢复（未落库）");
const restoredLast = await page.locator(".shell__ai .ai__msg--assistant").last().innerText();
console.log("刷新后最后一条 =", JSON.stringify(restoredLast.slice(0, 20)));
await page.screenshot({ path: `${OUT}/W91/刷新-会话恢复.png` });

await browser.close();
gateway.close();
console.log("PASS: W91 流式渲染 ✓ 停止保留部分 ✓ 刷新恢复会话 ✓");
