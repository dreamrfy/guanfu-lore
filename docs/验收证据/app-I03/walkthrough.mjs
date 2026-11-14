/**
 * I03 端到端自验走查（剪藏 → 自动出现在未读 → 点开标已读 → 侧栏角标）
 *
 * 连接 9222 的 Chrome（browser.cmd 启的调试实例），清空 localhost:5173 的
 * IndexedDB 保证 virgin 状态，然后驱动真 app：
 *   1. 开机自动导入 → 侧栏「剪藏库」出现未读角标 1
 *   2. 打开收集箱 → 记录行有未读圆点、状态 pill「未读」
 *   3. 点开记录 → 状态自动变「已读」、圆点消失、角标清零
 *   4. 刷新页面 → 仍是已读（落库持久化）
 * 截图直接落证据目录。跑之前先起 docs/验收证据/app-I03/mock-clip-server.mjs 和 vite。
 *
 * 用法（cwd 必须在 flowus-cap，能解析到 playwright-core）：
 *   node i03-walkthrough.mjs <截图输出目录> [--port 5173]
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2];
if (!outDir) { console.error('用法: node i03-walkthrough.mjs <截图输出目录>'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const portIdx = process.argv.indexOf('--port');
const port = portIdx !== -1 ? process.argv[portIdx + 1] : '5173';
const url = `http://localhost:${port}/`;

const shot = async (page, name) => {
  const file = path.join(outDir, name);
  // 窗口被遮挡时 rAF 节流，screenshot 会卡到超时——先顶到前台再截
  await page.bringToFront();
  await page.screenshot({ path: file, type: 'png', timeout: 15000 });
  console.log('[shot]', name);
};

const waitGone = (page, selector, timeout = 8000) =>
  page.waitForFunction(
    (sel) => !document.querySelector(sel),
    selector,
    { timeout }
  );

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx = browser.contexts()[0] ?? (await browser.newContext());
// 该 Chrome 实例不允许 newPage（Target.createTarget Not supported），复用现成页面
const page =
  ctx.pages().find((p) => !p.isClosed()) ??
  (await ctx.newPage());
console.log('[i03] 复用页面:', page.url());

// ---- 清库：保证从零开始（S04 等历史数据会污染演示）----
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  const dbs = await indexedDB.databases();
  await Promise.all(
    dbs.map(
      (d) =>
        new Promise((res) => {
          const r = indexedDB.deleteDatabase(d.name);
          r.onsuccess = r.onerror = r.onblocked = () => res();
        })
    )
  );
  localStorage.clear();
});
console.log('[i03] IndexedDB 已清空');

// ---- 重新进入：hydrate → 自动导入 → 侧栏角标 ----
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sidebar__badge', { timeout: 20000 });
const badgeText1 = await page.locator('.sidebar__badge').first().innerText();
console.log('[i03] 侧栏角标 =', badgeText1);
await page.waitForTimeout(400);
await shot(page, '1-开机自动入库-侧栏角标.png');

// ---- 打开收集箱：未读圆点 + 状态 pill 未读 ----
await page.locator('.tree-item:has-text("剪藏库")').first().click();
await page.waitForSelector('.unread-dot', { timeout: 10000 });
await page.waitForTimeout(400);
const pill1 = await page.locator('.pill').first().innerText().catch(() => '(没找到 pill)');
console.log('[i03] 记录状态 pill =', pill1);
await shot(page, '2-收集箱列表-未读圆点.png');

// ---- 点开记录 → 自动标已读 ----
await page.locator('tbody tr').first().click();
await waitGone(page, '.unread-dot');
await waitGone(page, '.sidebar__badge');
await page.waitForTimeout(500);
const pill2 = await page
  .locator('.pill:has-text("已读")')
  .first()
  .innerText()
  .catch(() => '(没找到已读 pill)');
console.log('[i03] 点开后状态 pill =', pill2);
await shot(page, '3-点开标已读-圆点消失.png');

// ---- 刷新：已读落库持久化 ----
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sidebar__badge', { state: 'detached', timeout: 10000 }).catch(() => {
  console.log('[i03] 警告：刷新后仍出现未读角标！');
});
await page.waitForTimeout(800);
const badgeAfterReload = await page.locator('.sidebar__badge').count();
console.log('[i03] 刷新后未读角标数 =', badgeAfterReload, '（0 = 已读持久化成立）');
await shot(page, '4-刷新后仍是已读.png');

await page.close();
console.log('[i03] 走查完成，截图在', outDir);
process.exit(0);
