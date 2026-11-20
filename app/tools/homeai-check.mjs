/**
 * W94 桌面主页（=AI 对话页，06 号规格 §1）点验
 * 用法: npm run homeai-check   （先 npm run dev，AI_BASE 可覆盖端口）
 * 证据: docs/验收证据/重做批/W94/*.png
 *
 * 验证方式：mock 网关（同 ai-chat-check，SSE 5 段流式）走真实 chatStream 链路——
 * 链路（fetch → SSE → 增量渲染 → IndexedDB 落库）全真，只有「模型」是假的。
 * 断言：主页空态形态（居中 logo+6 chips+大输入框，无文档顶栏）/ chip 预填 /
 * 首条消息切对话形态+流式全文 / 刷新会话恢复 / 主页钮已在主页无反应+离页后再点回主页。
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

const BASE = process.env.AI_BASE ?? "http://localhost:5173/";
const OUT = "../docs/验收证据/重做批";
mkdirSync(`${OUT}/W94`, { recursive: true });

/* ---------- mock 网关（与 ai-chat-check 一致） ---------- */
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
const page = await browser.newPage({ viewport: { width: 1200, height: 762 }, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await browser.close();
  gateway.close();
  process.exit(1);
};

const activeTabLabel = async () => page.locator(".tab--active").innerText();

// 1) 主页空态形态：激活页签=观复 AI、居中 logo+6 chips+大输入框、无文档顶栏
const label = await activeTabLabel();
console.log("激活页签 =", JSON.stringify(label));
if (!label.includes("观复 AI")) await fail("主页页签未激活或标题不是「观复 AI」");
if (!(await page.locator(".homeai__hero").count())) await fail("主页空态没有 hero 形态");
const chips = await page.locator(".homeai__chip").count();
console.log("能力 chips 数 =", chips);
if (chips !== 6) await fail(`chips 应为 6 个，实际 ${chips}`);
if (!(await page.locator(".homeai__input").count())) await fail("没有大输入框");
if (await page.locator(".toolbar").count()) await fail("主页不应出现文档页顶栏");
await page.screenshot({ path: `${OUT}/W94/01-主页空态形态.png` });
console.log("主页空态形态 ✓");

// 2) 开 AI 面板配置 mock 供应商（链路真实，模型假），配完关面板
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
await page.locator('.sidebar__icon[title="AI"]').click();
await page.waitForTimeout(400);
console.log("mock 供应商已保存 ✓");

// 3) chip 点击=预填提示词【暂定】
await page.locator(".homeai__chip", { hasText: "研究" }).click();
await page.waitForTimeout(200);
const chipDraft = await page.locator(".homeai__input").inputValue();
console.log("chip 预填 =", JSON.stringify(chipDraft));
if (!chipDraft.includes("帮我研究这个课题：")) await fail("chip 点击没有预填提示词");

// 4) 输入问题回车 → 空态大输入框消失、切对话形态、流式全文到达
await page.locator(".homeai__input").fill("主页测试：真实对话走查");
await page.keyboard.press("Enter");
await page.waitForTimeout(600);
if (await page.locator(".homeai__hero").count()) await fail("发出首条消息后空态大输入框没有切换");
const userMsgs = await page.locator(".homeai__chat .ai__msg").count();
if (!userMsgs) await fail("对话形态没有出现消息");
await page.waitForTimeout(1200);
const fullText = await page
  .locator(".homeai__chat .ai__msg--assistant")
  .last()
  .innerText({ timeout: 5000 })
  .catch(async () => {
    console.error("诊断: msg 数 =", await page.locator(".homeai__chat .ai__msg").count());
    console.error(
      "诊断: chat 文本 =",
      JSON.stringify((await page.locator(".homeai__chat").innerText().catch(() => "<none>")).slice(0, 500))
    );
    await fail("30 秒内助手消息没出现");
    return "<fail>";
  });
console.log("流式全文 =", JSON.stringify(fullText));
if (fullText !== "你好，这是一段流式回复。") await fail(`流式全文不对：${fullText}`);
await page.screenshot({ path: `${OUT}/W94/02-主页对话流式.png` });
console.log("首条消息切对话形态+流式 ✓");

// 5) 刷新后会话恢复（IndexedDB 落库实锤），页签仍是观复 AI
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const label2 = await activeTabLabel();
if (!label2.includes("观复 AI")) await fail("刷新后主页页签丢失");
const restored = await page.locator(".homeai__chat .ai__msg--assistant").last().innerText();
console.log("刷新后恢复全文 =", JSON.stringify(restored));
if (restored !== "你好，这是一段流式回复。") await fail("刷新后主页会话没有恢复");
if (await page.locator(".toolbar").count()) await fail("刷新后主页不应出现文档顶栏");
await page.screenshot({ path: `${OUT}/W94/03-主页刷新恢复会话.png` });
console.log("刷新会话恢复 ✓");

// 6) 主页钮：已在主页点击无反应；开文档页后点击回主页
const tabsBefore = await page.locator(".tab").count();
await page.locator('.sidebar__icon[title="主页"]').click();
await page.waitForTimeout(400);
const tabsAfter = await page.locator(".tab").count();
if (tabsAfter !== tabsBefore) await fail("已在主页点主页钮不应有反应（页签数变了）");
if (!(await page.locator(".tab--active").innerText()).includes("观复 AI"))
  await fail("已在主页点主页钮后激活页签变了");
console.log("已在主页点击无反应 ✓");

await page.click(".tabbar__new");
await page.waitForTimeout(700);
if (!(await page.locator(".toolbar").count())) await fail("文档页应有顶栏");
await page.locator('.sidebar__icon[title="主页"]').click();
await page.waitForTimeout(400);
if (!(await page.locator(".tab--active").innerText()).includes("观复 AI"))
  await fail("从文档页点主页钮没有回到主页");
if (await page.locator(".toolbar").count()) await fail("回主页后文档顶栏应消失");
console.log("离页后点主页钮回主页 ✓");

await browser.close();
gateway.close();
console.log("PASS: W94 主页形态/预填/流式对话/刷新恢复/主页钮语义全部真实生效");
