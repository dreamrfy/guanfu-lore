// W112 公开只读页真渲染截图：起本地 clip 服务 → 推演示页 → 开分享 → Playwright 截图。
// 用法: npm run share-page-shot
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) {
  console.error("未找到 Chrome");
  process.exit(2);
}
const OUT = "../docs/验收证据/重做批/W112";
mkdirSync(OUT, { recursive: true });

const PORT = 8799;
const TOKEN = "share-shot-token";
const DATA_DIR = ".share-shot-data";
const BASE = `http://127.0.0.1:${PORT}`;
const headers = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };

rmSync(DATA_DIR, { recursive: true, force: true });
const server = spawn("node", ["../server/src/clipServer.ts", "--port", String(PORT)], {
  stdio: ["ignore", "inherit", "inherit"],
  env: { ...process.env, KF_DATA_DIR: DATA_DIR, CLIP_TOKEN: TOKEN, KF_DISABLE_R2: "1" },
});

let failed = 0;
const fail = (msg) => {
  console.error("FAIL: " + msg);
  failed++;
};

try {
  // 等服务就绪
  let up = false;
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) {
        up = true;
        break;
      }
    } catch {
      /* 还没起 */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) fail("本地 clip 服务没起来");

  // 推一个演示页（标题/段落/列表/引用/代码/待办）
  const payload = {
    page: { id: "pg-share-demo", parentId: null, title: "观复公开分享演示", icon: "🌐", updatedAt: Date.now(), createdAt: Date.now() },
    blocks: [
      { id: "b0", type: "paragraph", content: "这是一篇通过观复「公开分享」发出的只读页面。", children: [] },
      { id: "b1", type: "heading", props: { level: 2 }, content: "它长这样", children: [] },
      { id: "b2", type: "paragraph", content: [{ type: "text", text: "正文支持 " }, { type: "text", text: "加粗", styles: { bold: true } }, { type: "text", text: "、" }, { type: "text", text: "斜体", styles: { italic: true } }, { type: "text", text: " 和 " }, { type: "text", text: "行内代码", styles: { code: true } }, { type: "text", text: "，以及链接：" }, { type: "link", href: "https://www.guanfu.app", content: "观复官网" }], children: [] },
      { id: "b3", type: "bulletListItem", content: "要点：块式编辑", children: [] },
      { id: "b4", type: "bulletListItem", content: "要点：多维表格", children: [] },
      { id: "b5", type: "numberedListItem", content: "微信剪藏收进收集箱", children: [] },
      { id: "b6", type: "numberedListItem", content: "一键公开分享", children: [] },
      { id: "b7", type: "checkListItem", props: { checked: true }, content: "已完成：生成分享链接", children: [] },
      { id: "b8", type: "checkListItem", props: { checked: false }, content: "待办：把链接发给朋友", children: [] },
      { id: "b9", type: "quote", content: "数据完全自持，分享由你决定。", children: [] },
      { id: "b10", type: "codeBlock", props: { language: "JavaScript" }, content: "const lore = await guanfu.open();", children: [] },
    ],
  };
  const push = await fetch(`${BASE}/api/sync/push`, {
    method: "POST",
    headers,
    body: JSON.stringify({ changes: [{ entity: "page", entityId: payload.page.id, op: "upsert", payload, baseSeq: 0, actor: "shot" }] }),
  });
  if (!push.ok) fail("推送演示页失败: " + (await push.text()));

  const share = await (await fetch(`${BASE}/api/share`, { method: "POST", headers, body: JSON.stringify({ pageId: payload.page.id }) })).json();
  if (!share.ok) fail("开分享失败: " + JSON.stringify(share));
  console.log("分享链接 =", share.url);

  const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const res = await page.goto(share.url, { waitUntil: "load", timeout: 15000 });
  if (!res || res.status() !== 200) fail("公开页状态码不对: " + (res?.status() ?? "无"));
  const robots = await page.evaluate(() => document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "");
  if (!robots.includes("noindex")) fail("公开页缺 noindex meta");
  const text = await page.evaluate(() => document.body.innerText);
  for (const t of ["观复公开分享演示", "加粗", "要点：多维表格", "一键公开分享", "数据完全自持"]) {
    if (!text.includes(t)) fail("公开页缺内容: " + t);
  }
  await page.screenshot({ path: OUT + "/公开页-桌面.png", fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(share.url, { waitUntil: "load" });
  await mobile.screenshot({ path: OUT + "/公开页-手机.png", fullPage: true });

  const bad = await browser.newPage();
  const badRes = await bad.goto(`${BASE}/s/AAAAAAAAAAAAAAAAAAAA`, { waitUntil: "load" });
  if (!badRes || badRes.status() !== 404) fail("失效链接应 404");
  await bad.screenshot({ path: OUT + "/公开页-已失效.png" });

  await browser.close();
  if (failed === 0) console.log("PASS: 公开只读页 渲染/内容/失效页 全过");
} catch (e) {
  failed++;
  console.error(e instanceof Error ? e.message : e);
} finally {
  server.kill();
  rmSync(DATA_DIR, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}