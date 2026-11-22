// 剪藏离线队列点验：失败入队 → 刷新持久 → 服务恢复后「立即重试」入库 → 队列清空
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
const CHROME_PATHS = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) { console.error("未找到 Chrome"); process.exit(2); }
const OUT = "../docs/验收证据/重做批/离线队列";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
let failed = 0;
const fail = (m) => { console.error("FAIL: " + m); failed++; throw new Error(m); };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "POST, GET, DELETE, OPTIONS" };
let serverUp = false; // false = 抓取失败；true = 成功
await page.route("**/api/clip", async (route) => {
  if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
  if (!serverUp) {
    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ ok: false, code: "server_unreachable", error: "测试：剪藏服务不可达" }) });
  }
  return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ ok: true, clip: { id: "clip-queue", source: "other", sourceUrl: "https://example.com/queue", canonicalUrl: "https://example.com/queue", title: "离线队列恢复的文章", author: "", account: "", publishedAt: null, savedAt: new Date().toISOString(), text: "队列恢复正文。", status: "ok" }, contentHtml: "<p>队列恢复正文。</p>", snapshotHtml: "<!doctype html><html><body><p>队列恢复正文。</p></body></html>", assets: [] }) });
});
try {
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gf_store?.getState().ready), null, { timeout: 15000 });
  await page.getByRole("button", { name: /快速剪藏/ }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(400);

  // 1) 服务不可达：提交 → 失败面板 + 入队提示
  await page.evaluate(() => { const el = document.activeElement; if (el instanceof HTMLElement) el.blur(); });
  await page.keyboard.press("Control+Alt+V");
  const dialog = () => page.locator('[data-testid="clip-dialog"]');
  await dialog().waitFor({ timeout: 5000 });
  await dialog().locator(".clip-input").first().fill("https://example.com/queue");
  await dialog().getByRole("button", { name: "剪藏", exact: true }).click();
  await page.locator('[data-testid="clip-error"]').waitFor({ timeout: 8000 });
  await page.locator('[data-testid="clip-queue"]').waitFor({ timeout: 3000 });
  if (!((await page.locator('[data-testid="clip-queue"]').textContent()) ?? "").includes("离线队列：1 条")) fail("入队提示不对");
  await page.screenshot({ path: OUT + "/失败入队.png" });

  // 2) 刷新页面 → 队列还在（localStorage 持久），徽章显示
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__gf_store?.getState().ready), null, { timeout: 15000 });
  await page.getByRole("button", { name: /快速剪藏/ }).waitFor({ timeout: 8000 });
  const badge = page.locator('button:has-text("快速剪藏") .sidebar__badge');
  if (!(await badge.count())) fail("刷新后入口徽章没显示队列数");
  await page.keyboard.press("Control+Alt+V");
  await dialog().waitFor({ timeout: 5000 });
  await page.locator('[data-testid="clip-queue"]').waitFor({ timeout: 3000 });

  // 3) 服务恢复 → 立即重试 → 入库成功、队列清空、徽章消失
  serverUp = true;
  await page.locator('[data-testid="clip-queue"] button', { hasText: "立即重试" }).click();
  await page.locator('[data-testid="clip-queue"]').getByText("队列已清空").waitFor({ timeout: 15000 });
  if (await badge.count()) fail("队列清空后徽章应消失");
  const titles = await page.evaluate(() => {
    const s = window.__gf_store.getState();
    const c = s.collections.find((x) => x.name === "剪藏库");
    const f = c?.fields.find((x) => x.name === "标题");
    return (s.records[c.id] ?? []).map((r) => String(r.values[f.id] ?? ""));
  });
  if (!titles.includes("离线队列恢复的文章")) fail("重试没有真实入库: " + JSON.stringify(titles));
  await page.screenshot({ path: OUT + "/重试成功.png" });
  if (failed === 0) console.log("PASS: 离线队列 失败入队/刷新持久/恢复重试入库/清空 全过");
} catch (e) {
  failed++;
  await page.screenshot({ path: OUT + "/失败现场.png" }).catch(() => {});
  console.error(e instanceof Error ? e.message : e);
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}
