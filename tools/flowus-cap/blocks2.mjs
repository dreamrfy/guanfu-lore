/**
 * 剩余块级排版实测（M0-T24）
 * 采：① 标题 level 1-4 各自的块高 ② 段落块高 ③ 列表块高与缩进 ④ 多行块的高度规律
 * 只记几何（y/h/x/w），不记任何文字。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t24';
fs.mkdirSync(OUT, { recursive: true });

const DOCS = [
  { id: '11572688-3c81-4054-a204-37f948284708', label: '账号页（段落+标题）' },
  { id: 'e94d0289-344d-44f2-bf6e-0a2a89549c95', label: '无标题页（段落+项目列表）' },
];

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

for (const doc of DOCS) {
  await page.goto('https://flowus.cn/' + doc.id, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.keyboard.press('Escape');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(900);

  // 接口：类型 + level（不取文字）
  const seq = await page.evaluate(async (id) => {
    const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
    const bs = (j.data || {}).blocks || {};
    const root = Object.values(bs).find((b) => b && !b.parentId) || Object.values(bs)[0];
    const out = [];
    const walk = (bid) => {
      const b = bs[bid]; if (!b) return;
      const segs = (b.data && b.data.segments) || [];
      out.push({ type: b.type, level: b.data && b.data.level !== undefined ? b.data.level : null, len: segs.reduce((n, s) => n + ((s && s.text) || '').length, 0) });
      (b.subNodes || []).forEach(walk);
    };
    if (root) walk(root.uuid);
    return out.slice(1);
  }, doc.id);

  // DOM：块矩形
  const rects = await page.evaluate(() => {
    const cands = [];
    document.querySelectorAll('div').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 600 || r.width > 716) return;
      if (Math.abs(r.x - 720) > 40) return;
      if (r.height < 8 || r.height > 260) return;
      if (r.y < 90) return;
      cands.push({ x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) });
    });
    const byY = {};
    cands.forEach((c) => { const k = Math.round(c.y); if (!byY[k] || c.w > byY[k].w) byY[k] = c; });
    return Object.values(byY).sort((a, b) => a.y - b.y);
  });

  const n = Math.min(seq.length, rects.length);
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ type: seq[i].type, level: seq[i].level, len: seq[i].len, x: rects[i].x, y: rects[i].y, h: rects[i].h });

  // 按 (type, level) 聚合
  const agg = {};
  rows.forEach((r) => {
    const k = 'type' + r.type + (r.level === null ? '' : '/lv' + r.level);
    (agg[k] = agg[k] || []).push({ h: r.h, x: r.x, len: r.len });
  });
  const summary = {};
  for (const [k, arr] of Object.entries(agg)) {
    const hs = arr.map((a) => a.h).sort((a, b) => a - b);
    const xs = [...new Set(arr.map((a) => a.x))].sort((a, b) => a - b);
    summary[k] = {
      n: arr.length,
      hMin: hs[0], hMed: hs[Math.floor(hs.length / 2)], hMax: hs[hs.length - 1],
      xValues: xs.slice(0, 6),
      singleLineHeights: [...new Set(hs.filter((h) => h < 60))].slice(0, 6),
    };
  }
  R[doc.label] = { docId: doc.id, apiBlocks: seq.length, domBlocks: rects.length, paired: n, summary };
  await page.screenshot({ path: OUT + '/' + (doc.id === DOCS[0].id ? 'a-account' : 'b-list') + '.png' });
}

// 脱敏：不保留 docId 里的账号标识（docId 本身是 uuid，无隐私）
fs.writeFileSync(OUT + '/blocks2.json', JSON.stringify(R, null, 1));
for (const [label, v] of Object.entries(R)) {
  console.log('=== ' + label + ' === 接口块 ' + v.apiBlocks + ' / DOM ' + v.domBlocks + ' / 配对 ' + v.paired);
  for (const [k, s] of Object.entries(v.summary)) {
    console.log(`  ${k.padEnd(12)} n=${String(s.n).padStart(3)} 高[${s.hMin}/${s.hMed}/${s.hMax}] x值=${JSON.stringify(s.xValues)} 单行高集合=${JSON.stringify(s.singleLineHeights)}`);
  }
}
await browser.close();
