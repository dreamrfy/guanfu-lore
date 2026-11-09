/**
 * 块模型全量提取（M0-T08 定稿）
 * 跨该空间所有页面遍历 /api/docs/{id}，汇总「块类型 → 字段集合」与「行内 segment 结构」。
 * 隐私：只输出键名、类型、计数；任何字符串内容都不落地。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t08';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4500);

const R = await page.evaluate(async () => {
  const items = Array.from(document.querySelectorAll('[data-test-id="aside-item-toc"]'));
  const ids = items.map((e) => (e.getAttribute('href') || '').replace(/^\//, '')).filter((id) => /^[0-9a-f-]{36}$/.test(id));
  const out = { docsScanned: 0, docsFailed: 0, blockTypes: {}, segmentShapes: {}, formatKeys: {}, iconKeys: {}, topKeys: {}, totalBlocks: 0, collectionViewShapes: {} };

  const bump = (obj, k) => { obj[k] = (obj[k] || 0) + 1; };

  for (const id of ids) {
    try {
      const res = await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } });
      const j = await res.json();
      const d = j.data;
      if (!d) { out.docsFailed++; continue; }
      out.docsScanned++;
      Object.keys(d).forEach((k) => bump(out.topKeys, k));

      const blocks = d.blocks || {};
      out.totalBlocks += Object.keys(blocks).length;
      Object.values(blocks).forEach((b) => {
        if (!b || typeof b !== 'object') return;
        const key = typeof b.type + ':' + String(b.type);
        out.blockTypes[key] = out.blockTypes[key] || { count: 0, keys: {} };
        out.blockTypes[key].count++;
        Object.keys(b).forEach((k) => bump(out.blockTypes[key].keys, k + '<' + typeof b[k] + '>'));

        const segs = Array.isArray(b.segments) ? b.segments : Array.isArray(b.description) ? b.description : null;
        if (segs) {
          const f = segs.find((s) => s && typeof s === 'object');
          if (f) {
            const sk = Object.keys(f).sort().join(',');
            out.segmentShapes[sk] = (out.segmentShapes[sk] || 0) + 1;
          }
        }
        if (b.format && typeof b.format === 'object') Object.keys(b.format).forEach((k) => bump(out.formatKeys, k));
        if (b.icon && typeof b.icon === 'object') Object.keys(b.icon).forEach((k) => bump(out.iconKeys, k));
        if (b.properties && typeof b.properties === 'object') Object.keys(b.properties).forEach((k) => bump(out.collectionViewShapes, 'prop:' + k));
      });

      const cv = d.collectionViews || {};
      Object.values(cv).forEach((v) => {
        if (v && typeof v === 'object') Object.keys(v).forEach((k) => bump(out.collectionViewShapes, 'view:' + k));
      });
    } catch (e) { out.docsFailed++; }
  }
  return out;
});

fs.writeFileSync(OUT + '/block-model-all.json', JSON.stringify(R, null, 1));
console.log('扫描文档:', R.docsScanned, '| 失败:', R.docsFailed, '| 块总数:', R.totalBlocks);
console.log('data 顶层键:', JSON.stringify(R.topKeys));
console.log('=== 块类型分布（type 的 JS 类型:值）===');
Object.entries(R.blockTypes).sort((a, b) => b[1].count - a[1].count).forEach(([t, v]) => {
  console.log('  ' + t.padEnd(16) + ' x' + String(v.count).padStart(4));
  console.log('       字段: ' + Object.keys(v.keys).sort().join(', '));
});
console.log('=== 行内 segment 形状 ===');
Object.entries(R.segmentShapes).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, n]) => console.log('  x' + n + '  ' + k));
console.log('=== format 键 ===', Object.keys(R.formatKeys).join(', '));
console.log('=== icon 键 ===', Object.keys(R.iconKeys).join(', '));
console.log('=== 多维表相关键 ===', Object.keys(R.collectionViewShapes).join(', '));
console.log('\n已写出:', OUT + '/block-model-all.json');
await browser.close();
