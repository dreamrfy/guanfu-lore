/**
 * M0-T34：③ type=15 身分 + ⑤ select 字段 options 结构
 * ③ 读「磷化工知识库」里 type=15 块的结构（不取文字）
 * ⑤ 隔离表 → 分类列「管理选项」加两个选项 → 读 schema[].options 结构
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t34';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);

// ③ type=15 结构
R['1 type15'] = await page.evaluate(async () => {
  const id = '05db2d4f-865c-4f3c-808a-6509331fc496'; // 磷化工知识库
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const hits = [];
  Object.values(bs).forEach((b) => {
    if (!b || typeof b.type !== 'number') return;
    if (b.type !== 15) return;
    const d = b.data || {};
    const segs = d.segments || [];
    hits.push({
      type: b.type,
      hasSubNodes: Array.isArray(b.subNodes) ? b.subNodes.length : 0,
      subTypes: (b.subNodes || []).map((sid) => (bs[sid] ? bs[sid].type : '?')),
      dataKeys: Object.keys(d).sort(),
      segCount: segs.length,
      textLen: segs.reduce((n, s) => n + ((s && s.text) || '').length, 0),
      titleLen: (b.title || '').length,
      isTemplate: b.isTemplate,
      hasChildren: !!(d.children || d.pages || d.items),
    });
  });
  return hits;
});
console.log('=== type=15 块 ===');
console.log(JSON.stringify(R['1 type15'], null, 1));

// ⑤ select options 结构：建隔离表
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
R['2 基线'] = await page.evaluate(() => document.querySelectorAll('[data-test-id="aside-item-toc"]').length);
await page.locator('[data-test-id="aside-toc-header-create-by-private"]').first().click({ force: true });
await page.waitForTimeout(5500);
const DOC = (page.url().match(/([0-9a-f-]{36})\s*$/) || [])[1];
R['3 docId'] = DOC;
await clickText('表格');
await page.waitForTimeout(5000);

const readSchema = () => page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const out = [];
  Object.values(bs).forEach((b) => {
    const d = b.data || {};
    if (!d.schema) return;
    Object.values(d.schema).forEach((f) => out.push({ name: f.name, type: f.type, optionsType: Array.isArray(f.options) ? 'array' : typeof f.options, optionSample: Array.isArray(f.options) ? f.options.slice(0, 2) : null }));
  });
  return out;
}, DOC);
R['4 加选项前'] = await readSchema();

// 打开分类列头 → 管理选项
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
R['5 点管理选项'] = await clickText('管理选项');
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + '/options-editor.png' });
R['6 选项编辑器'] = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.next-modal, [role="dialog"], [data-popper-placement]').forEach((e) => {
    const b = e.getBoundingClientRect();
    if (b.width < 100 || b.height < 60) return;
    const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
    if (t) out.push({ w: Math.round(b.width), h: Math.round(b.height), text: t.slice(0, 260) });
  });
  const seen = new Set();
  return out.filter((o) => { const k = o.text.slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; });
});
console.log('=== 管理选项浮层 ===');
console.log(JSON.stringify(R['6 选项编辑器']).slice(0, 500));

fs.writeFileSync(OUT + '/t34.json', JSON.stringify(R, null, 1));
await browser.close();