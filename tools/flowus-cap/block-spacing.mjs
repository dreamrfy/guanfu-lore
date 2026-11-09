/**
 * 块级排版间距实测（M0-T19）
 * 思路：接口拿"块序列（类型/层级/文本）" → 在 DOM 里按文本定位每块的矩形 → 算块高与相邻间距。
 * 只读，不改任何内容。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t19';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// 选一篇文本块最多的页面（磷化工知识库 14 块；学习进度是数据库页，块只有 4 个）
await page.locator('[data-test-id="aside-item-toc"]').filter({ hasText: '磷化工知识库' }).first().click({ force: true });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.mouse.move(5, 5);
await page.waitForTimeout(900);
await page.screenshot({ path: OUT + '/page.png' });
const docId = (page.url().match(/([0-9a-f-]{36})\s*$/) || [])[1];

// ① 接口拿块序列
const blocks = await page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const root = Object.values(bs).find((b) => b && !b.parentId) || Object.values(bs)[0];
  const out = [];
  const walk = (bid) => {
    const b = bs[bid]; if (!b) return;
    const segs = (b.data && b.data.segments) || [];
    out.push({ type: b.type, level: b.data ? b.data.level : null, text: segs.map((s) => (s && s.text) || '').join('') });
    (b.subNodes || []).forEach(walk);
  };
  if (root) walk(root.uuid);
  return out;
}, docId);

// ② DOM 里按文本定位
const located = await page.evaluate((items) => {
  return items.map((it) => {
    const t = (it.text || '').trim().slice(0, 12);
    if (!t) return { ...it, rect: null, note: '无文本' };
    let best = null;
    document.querySelectorAll('div,p,span,h1,h2,h3,h4,li').forEach((e) => {
      const s = (e.innerText || '').trim();
      if (!s.startsWith(t)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 20 || r.height < 8 || r.x < 240) return;
      if (e.children.length > 2) return;
      if (!best || r.width * r.height < best.w * best.h) best = { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    });
    return { ...it, rect: best };
  });
}, blocks);

// ③ 算块高与间距
const rows = [];
for (let i = 0; i < located.length; i++) {
  const b = located[i], n = located[i + 1];
  const gap = (b.rect && n && n.rect) ? +(n.rect.y - (b.rect.y + b.rect.h)).toFixed(1) : null;
  rows.push({ i, type: b.type, level: b.level, h: b.rect ? b.rect.h : null, y: b.rect ? b.rect.y : null, gapToNext: gap, text: (b.text || '').slice(0, 18) });
}

// ④ 汇总：按 type 归纳
const byType = {};
// 相邻同类型/跨类型的间隔统计
for (let i = 0; i < rows.length - 1; i++) {
  const a = rows[i], b = rows[i + 1];
  if (a.gapToNext === null) continue;
  const key = `type${a.type}→type${b.type}`;
  (byType[key] = byType[key] || []).push(a.gapToNext);
}
const gapStats = {};
for (const [k, arr] of Object.entries(byType)) {
  const sorted = [...arr].sort((x, y) => x - y);
  gapStats[k] = { n: arr.length, min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1], values: arr.slice(0, 12) };
}
// 各 type 的块高
const heightByType = {};
rows.forEach((r) => { if (r.h !== null) (heightByType['type' + r.type] = heightByType['type' + r.type] || []).push(r.h); });

const R = { docId, blockCount: rows.length, rows, gapStats, heightByType };
fs.writeFileSync(OUT + '/block-spacing.json', JSON.stringify(R, null, 1));

console.log('docId:', docId, '| 块数:', rows.length);
console.log('=== 块序列（类型/层级/高/到下一块的间距）===');
rows.forEach((r) => console.log(`  ${String(r.i).padStart(2)} type=${String(r.type).padEnd(4)} lv=${r.level === null ? '-' : r.level} h=${String(r.h).padStart(6)} gap=${String(r.gapToNext).padStart(6)}  [${r.text}]`));
console.log('=== 相邻间隔统计（按 类型→类型）===');
Object.entries(gapStats).sort((a, b) => b[1].n - a[1].n).forEach(([k, v]) =>
  console.log(`  ${k.padEnd(16)} n=${String(v.n).padStart(2)}  min=${v.min} 中位=${v.median} max=${v.max}  ${JSON.stringify(v.values)}`));
console.log('=== 各类型块高 ===');
Object.entries(heightByType).forEach(([k, arr]) => console.log(`  ${k.padEnd(8)} n=${arr.length}  值=${JSON.stringify(arr.slice(0, 12))}`));
await browser.close();
