/**
 * 关联类型实测（M0-T29 上半）
 * 建隔离表 → 分类列换「关联」→ **不 Escape**，dump 配置层并尝试走完 → 读 string。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t29';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

const clickText = async (t) => {
  const r = await page.evaluate((txt) => {
    let best = null;
    document.querySelectorAll('div,span,button,li').forEach((e) => {
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
const dumpLayers = () => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.next-modal, [role="dialog"], [role="menu"], [data-popper-placement]').forEach((e) => {
    const b = e.getBoundingClientRect();
    if (b.width < 80 || b.height < 40) return;
    const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
    if (t) out.push({ w: Math.round(b.width), h: Math.round(b.height), text: t.slice(0, 500) });
  });
  const seen = new Set();
  return out.filter((o) => { const k = o.text.slice(0, 100); if (seen.has(k)) return false; seen.add(k); return true; });
});

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
R['0 基线'] = await page.evaluate(() => document.querySelectorAll('[data-test-id="aside-item-toc"]').length);

// 建页 → 点「表格」
await page.locator('[data-test-id="aside-toc-header-create-by-private"]').first().click({ force: true });
await page.waitForTimeout(5500);
const DOC = (page.url().match(/([0-9a-f-]{36})\s*$/) || [])[1];
R['1 docId'] = DOC;
R['2 点表格'] = await clickText('表格');
await page.waitForTimeout(5000);
console.log('临时页:', DOC, '| 点表格:', R['2 点表格']);

const readSchema = () => page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const out = [];
  Object.values(bs).forEach((b) => {
    const d = b.data || {};
    if (d.schema) Object.entries(d.schema).forEach(([k, f]) => out.push({ name: f.name, type: f.type, keys: Object.keys(f).sort().join(','), optionsType: Array.isArray(f.options) ? 'array' : typeof f.options }));
  });
  return out;
}, DOC);
R['3 初始 schema'] = await readSchema();

// 打开「分类」列头 → 更换类型 → 关联
const h = await page.evaluate(() => {
  let best = null;
  document.querySelectorAll('div,span,th').forEach((e) => {
    if ((e.innerText || '').trim() !== '分类') return;
    const r = e.getBoundingClientRect();
    if (r.width < 10 || r.x < 240 || e.children.length > 2) return;
    if (!best) best = { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  return best;
});
if (h) { await page.mouse.click(h.x + 30, h.y + h.h / 2); await page.waitForTimeout(1800); }
R['4 点更换类型'] = await clickText('更换类型');
await page.waitForTimeout(1800);
// 用 test-id 点「关联」
const relBtn = page.locator('[data-test-id="关联"]').first();
R['5 有关联testid'] = await relBtn.count();
if (await relBtn.count()) { await relBtn.click({ force: true }); }
else { await clickText('关联'); }
await page.waitForTimeout(3000);
await page.screenshot({ path: OUT + '/a-relation-dialog.png' });
R['6 关联后浮层'] = await dumpLayers();
R['7 关联后 schema'] = await readSchema();
console.log('关联后浮层:', JSON.stringify(R['6 关联后浮层']).slice(0, 500));
console.log('关联后 schema:', JSON.stringify(R['7 关联后 schema']));

fs.writeFileSync(OUT + '/relation.json', JSON.stringify(R, null, 1));
await browser.close();
