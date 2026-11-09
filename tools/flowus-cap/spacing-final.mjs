import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t19';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const DOC = '11572688-3c81-4054-a204-37f948284708'; // 「账号」：119 块（100 段落 + 18 标题）
await page.goto('https://flowus.cn/' + DOC, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.keyboard.press('Escape');
await page.mouse.move(5, 5);
await page.waitForTimeout(1000);
await page.screenshot({ path: OUT + '/sample-page.png' });

// ① 接口拿「类型/层级」序列（**不取文字**）
const seq = await page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const root = Object.values(bs).find((b) => b && !b.parentId) || Object.values(bs)[0];
  const out = [];
  const walk = (bid) => {
    const b = bs[bid]; if (!b) return;
    const segs = (b.data && b.data.segments) || [];
    out.push({ type: b.type, level: b.data ? b.data.level : null, len: segs.reduce((n, s) => n + ((s && s.text) || '').length, 0) });
    (b.subNodes || []).forEach(walk);
  };
  if (root) walk(root.uuid);
  // 去掉根页面块本身
  return out.slice(1);
}, DOC);

// ② DOM 找块矩形：内容列左缘对齐、宽度近列宽、y 递增
const rects = await page.evaluate(() => {
  const colLeft = 720, colW = 708;
  const cands = [];
  document.querySelectorAll('div').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < colW - 40 || r.width > colW + 4) return;
    if (Math.abs(r.x - colLeft) > 12) return;
    if (r.height < 8 || r.height > 200) return;
    if (r.y < 90) return;
    cands.push({ x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), kids: e.children.length });
  });
  // 去重：同一 y 只留最外层的那个（宽度最大）
  const byY = {};
  cands.forEach((c) => { const k = Math.round(c.y); if (!byY[k] || c.w > byY[k].w) byY[k] = c; });
  return Object.values(byY).sort((a, b) => a.y - b.y);
});

// ③ 配对（DOM 顺序 = 接口顺序）并算间距
const n = Math.min(seq.length, rects.length);
const rows = [];
for (let i = 0; i < n; i++) {
  const a = rects[i], b = rects[i + 1];
  rows.push({
    i, type: seq[i].type, level: seq[i].level,
    y: a.y, h: a.h, w: a.w,
    gap: b ? +(b.y - (a.y + a.h)).toFixed(1) : null,
  });
}
const gapByType = {};
for (let i = 0; i < rows.length - 1; i++) {
  const a = rows[i], b = rows[i + 1];
  if (a.gap === null || a.gap < -5) continue;
  const k = `${a.type}→${b.type}`;
  (gapByType[k] = gapByType[k] || []).push(a.gap);
}
const stats = {};
for (const [k, arr] of Object.entries(gapByType)) {
  const s = [...arr].sort((x, y) => x - y);
  stats[k] = { n: arr.length, min: s[0], median: s[Math.floor(s.length / 2)], max: s[s.length - 1], values: s.slice(0, 14) };
}
const hByType = {};
rows.forEach((r) => { (hByType['type' + r.type] = hByType['type' + r.type] || []).push(r.h); });

const R = { doc: '11572688(账号页，仅几何)', apiBlocks: seq.length, domBlocks: rects.length, rows, stats, hByType };
fs.writeFileSync(OUT + '/spacing.json', JSON.stringify(R, null, 1));
console.log('接口块数:', seq.length, '| DOM 找到块矩形:', rects.length, '（配对', n, '对）');
console.log('=== 各类型块高 ===');
Object.entries(hByType).forEach(([k, arr]) => {
  const s = [...arr].sort((a, b) => a - b);
  console.log(`  ${k.padEnd(8)} n=${String(arr.length).padStart(3)}  最小=${s[0]} 中位=${s[Math.floor(s.length / 2)]} 最大=${s[s.length - 1]}  样本=${JSON.stringify(s.slice(0, 10))}`);
});
console.log('=== 相邻块间距（按 类型→类型）===');
Object.entries(stats).sort((a, b) => b[1].n - a[1].n).forEach(([k, v]) =>
  console.log(`  ${k.padEnd(14)} n=${String(v.n).padStart(3)}  最小=${v.min} 中位=${v.median} 最大=${v.max}  ${JSON.stringify(v.values)}`));
await browser.close();
