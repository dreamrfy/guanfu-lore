/**
 * 复核 type=15 = 文件夹（M0-T35 第①项）
 * 建空页 → 空页类型选择器点「文件夹」→ 读根块 type → 三步删页。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t35';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

const clickText = async (t) => {
  const r = await page.evaluate((txt) => {
    let best = null;
    document.querySelectorAll('div,span,button,li,a').forEach((e) => {
      if ((e.innerText || '').trim() !== txt) return;
      const b = e.getBoundingClientRect();
      if (b.width < 8 || b.height < 8) return;
      if (!best || b.width * b.height < best.w * best.h) best = { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    return best;
  }, t);
  if (!r) return false;
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  return true;
};

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
R['0 基线'] = await page.evaluate(() => document.querySelectorAll('[data-test-id="aside-item-toc"]').length);

await page.locator('[data-test-id="aside-toc-header-create-by-private"]').first().click({ force: true });
await page.waitForTimeout(5500);
const DOC = (page.url().match(/([0-9a-f-]{36})\s*$/) || [])[1];
R['1 docId'] = DOC;
console.log('临时页:', DOC);
R['2 点文件夹'] = await clickText('文件夹');
await page.waitForTimeout(4500);
await page.screenshot({ path: OUT + '/folder-page.png' });

R['3 块结构'] = await page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const root = Object.values(bs).find((b) => b && !b.parentId) || Object.values(bs)[0];
  const out = { total: Object.keys(bs).length, root: null };
  if (root) out.root = { type: root.type, dataKeys: Object.keys(root.data || {}).sort(), subNodes: (root.subNodes || []).length };
  return out;
}, DOC);
console.log('块总数:', R['3 块结构'].total, '| 根块:', JSON.stringify(R['3 块结构'].root));

fs.writeFileSync(OUT + '/folder.json', JSON.stringify(R, null, 1));
await browser.close();