// W130 全模块串测（一条龙）：新建页→编辑块→建多维表→切视图→搜索→AI 对话→设置→分享→剪藏。
// 全部真实 UI 操作；AI 用本地 mock 网关、剪藏/分享用 route 桩（其余链路全真）。
// 用法: npm run full-chain-w130 （需 dev server 已起）
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) {
  console.error("未找到 Chrome");
  process.exit(2);
}
const OUT = "../docs/验收证据/重做批/W130";
mkdirSync(OUT, { recursive: true });

/* ---------- AI mock 网关（SSE 流式，同 ai-chat-check） ---------- */
const CHUNKS = ["串测", "回复：", "全链路", "畅通。"];
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
      i++;
    }, 120);
  });
});
await new Promise((r) => gateway.listen(8788, "127.0.0.1", r));

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,authorization",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
};

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
let failed = 0;
const fail = (msg) => {
  console.error("FAIL: " + msg);
  failed++;
  throw new Error(msg);
};
const step = (name) => console.log("▶ " + name);

/* ---------- route 桩：分享 / 剪藏 ---------- */
let shareUrl = null;
await page.route("**/api/share**", async (route) => {
  if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
  const h = { ...CORS, "content-type": "application/json" };
  if (route.request().method() === "GET") {
    return route.fulfill({ status: 200, headers: h, body: JSON.stringify({ ok: true, shared: Boolean(shareUrl), url: shareUrl, createdAt: null }) });
  }
  if (route.request().method() === "POST") {
    shareUrl = "https://share.guanfu.app/s/W130ChainToken12345678";
    return route.fulfill({ status: 200, headers: h, body: JSON.stringify({ ok: true, url: shareUrl, created: true }) });
  }
  shareUrl = null;
  return route.fulfill({ status: 200, headers: h, body: JSON.stringify({ ok: true, shared: false }) });
});
await page.route("**/api/clip", async (route) => {
  if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
  await route.fulfill({
    status: 200,
    headers: { ...CORS, "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      clip: { id: "clip-w130", source: "other", sourceUrl: "https://example.com/w130", canonicalUrl: "https://example.com/w130", title: "W130 剪藏链路测试", author: "串测", account: "", publishedAt: null, savedAt: new Date().toISOString(), text: "串测剪藏正文。", status: "ok" },
      contentHtml: "<p>串测剪藏正文。</p>",
      snapshotHtml: "<!doctype html><html><body><p>W130 快照内容标记</p></body></html>",
      assets: [],
    }),
  });
});
await page.addInitScript(() => {
  const clipboard = { writeText: async () => {}, readText: async () => "" };
  try {
    Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
  } catch {
    /* ignore */
  }
});

try {
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gf_store?.getState().ready), null, { timeout: 15000 });

  // 1) 新建页 + 标题 + 编辑块
  step("1 新建页 → 编辑块");
  await page.locator('.groupbtn[title="新建页面"]').click();
  await page.locator(".page").waitFor({ timeout: 5000 });
  await page.locator(".page__title").fill("W130 全模块串测页");
  await page.locator(".bn-editor [contenteditable=true], .ProseMirror").first().click();
  await page.keyboard.type("这是串测第一段。");
  await page.keyboard.press("Enter");
  await page.keyboard.type("第二段：多维表与剪藏都在后面。");
  await page.waitForTimeout(600);
  const editorHas = (await page.evaluate(() => document.body.innerText)).includes("串测第一段");
  if (!editorHas) fail("编辑器输入未生效");
  await page.screenshot({ path: OUT + "/01-新建页与编辑.png" });

  // 2) 建多维表 + 记录
  step("2 建多维表 → 新建记录");
  await page.locator('.groupbtn[title="新建表格"]').click();
  await page.locator(".collection").waitFor({ timeout: 5000 });
  await page.locator('.collection__head button:has-text("新建记录")').click();
  await page.waitForTimeout(700);
  const rows = await page
    .locator(".collection__scroll tbody tr")
    .evaluateAll((tr) => tr.filter((r) => r.querySelector(".grid__idx")).length);
  if (rows < 1) fail("多维表建记录失败");
  await page.screenshot({ path: OUT + "/02-多维表与记录.png" });

  // 3) 切视图（表格 → 看板）
  step("3 切视图到看板");
  await page.locator(".viewtab__menu").first().click();
  await page.waitForTimeout(250);
  await page.locator(".viewtab__pop .menu-item", { hasText: "视图设置" }).click();
  await page.waitForTimeout(450);
  await page.locator(".viewsettings .vs-row", { hasText: "视图类型" }).locator("select").selectOption("kanban");
  await page.waitForTimeout(700);
  await page.locator(".viewsettings__close").click();
  await page.waitForTimeout(700);
  if (!(await page.locator(".kanban").count())) fail("切到看板失败");
  await page.screenshot({ path: OUT + "/03-看板视图.png" });

  // 4) 搜索命中页面
  step("4 全局搜索");
  await page.keyboard.press("Control+P");
  await page.locator(".searchpanel__card").waitFor({ timeout: 5000 });
  await page.locator(".searchpanel__input").fill("全模块串测页");
  await page.waitForTimeout(600);
  const resultText = (await page.locator(".searchpanel__card").innerText()) || "";
  if (!resultText.includes("全模块串测页")) fail("搜索没有命中串测页");
  await page.screenshot({ path: OUT + "/04-搜索命中.png" });
  await page.keyboard.press("Escape");
  await page.locator(".searchpanel__card").waitFor({ state: "detached", timeout: 3000 });

  // 5) AI 对话（mock 网关，真 fetch/SSE/落库）
  step("5 AI 对话（mock 网关）");
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
  if (!(await inputBox.count())) fail("AI 供应商保存后没有回到输入框");
  await inputBox.fill("串测一下");
  await page.locator(".shell__ai .ai__row button", { hasText: "发送" }).click();
  await page
    .locator(".shell__ai .ai__msg--assistant", { hasText: "全链路畅通" })
    .waitFor({ timeout: 10000 });
  await page.screenshot({ path: OUT + "/05-AI对话.png" });

  // 6) 设置弹层
  step("6 设置弹层");
  await page.locator('[title="空间切换"]').click();
  await page.waitForTimeout(300);
  await page.locator(".tabctx--ws .tabctx__item", { hasText: "空间设置" }).click();
  await page.locator('[data-testid="settings-dialog"]').waitFor({ timeout: 5000 });
  await page.screenshot({ path: OUT + "/06-设置.png" });
  await page.keyboard.press("Escape");
  await page.locator('[data-testid="settings-dialog"]').waitFor({ state: "detached", timeout: 3000 });

  // 7) 分享：切回页面页签（表格态下分享入口按规格禁用）→ 开关 → 链接出现 → 关闭
  step("7 公开分享开关");
  await page.locator('.sidebar__icon[title="AI"]').click(); // 收起 AI 面板
  await page.waitForTimeout(400);
  await page.locator(".tab", { hasText: "W130 全模块串测页" }).click();
  await page.locator(".page__title").waitFor({ timeout: 5000 });
  await page.locator('.toolbar .icon-btn[title="分享"]').click();
  await page.locator('[data-testid="share-panel"]').waitFor({ timeout: 5000 });
  await page.locator(".share-perm").nth(1).click();
  await page.locator('[data-testid="share-linkrow"]').waitFor({ timeout: 5000 });
  const shareLink = await page.locator(".share-linkrow input.share-link").inputValue();
  if (!shareLink.startsWith("https://share.guanfu.app/s/")) fail("串测分享链接不对: " + shareLink);
  await page.screenshot({ path: OUT + "/07-分享链接.png" });
  await page.locator(".share-perm").nth(0).click();
  await page.locator('[data-testid="share-linkrow"]').waitFor({ state: "detached", timeout: 5000 });
  await page.keyboard.press("Escape");

  // 8) 剪藏：弹层 → 入库 → 打开记录 → 快照
  step("8 剪藏入库 → 打开快照");
  await page.keyboard.press("Control+Alt+V");
  await page.locator('[data-testid="clip-dialog"]').waitFor({ timeout: 5000 });
  await page.locator('[data-testid="clip-dialog"] .clip-input').first().fill("https://example.com/w130");
  await page.locator('[data-testid="clip-dialog"]').getByRole("button", { name: "剪藏", exact: true }).click();
  await page.locator('[data-testid="clip-success"]').waitFor({ timeout: 10000 });
  await page.locator('[data-testid="clip-success"]').getByRole("button", { name: "打开" }).click();
  await page.locator(".record__title").first().waitFor({ timeout: 5000 });
  const recTitle = await page.locator(".record__title").first().inputValue();
  if (!recTitle.includes("W130")) fail("剪藏记录标题不对: " + recTitle);
  await page.waitForTimeout(400);
  const bodyText = (await page.evaluate(() => document.body.innerText)) || "";
  if (!bodyText.includes("串测剪藏正文")) fail("剪藏正文未入库");
  await page.screenshot({ path: OUT + "/08-剪藏与快照.png" });

  console.log("PASS: W130 全模块串测 8 步全过（页面/编辑/表格/视图/搜索/AI/设置/分享/剪藏）");
} catch (e) {
  failed++;
  await page.screenshot({ path: OUT + "/失败现场.png" }).catch(() => {});
  console.error(e instanceof Error ? e.message : e);
} finally {
  gateway.close();
  await browser.close();
  process.exit(failed ? 1 : 0);
}