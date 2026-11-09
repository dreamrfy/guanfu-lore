import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t08';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4500);

const R = await page.evaluate(async () => {
  const ids = Array.from(document.querySelectorAll('[data-test-id="aside-item-toc"]'))
    .map((e) => (e.getAttribute('href') || '').replace(/^\//, '')).filter((id) => /^[0-9a-f-]{36}$/.test(id));
  const byType = {};
  for (const id of ids) {
    try {
      const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
      const blocks = (j.data && j.data.blocks) || {};
      Object.values(blocks).forEach((b) => {
        if (!b || typeof b.type !== 'number') return;
        const t = b.type;
        byType[t] = byType[t] || { count: 0, dataKeys: {}, segShapes: {}, sampleSegKeys: null, titleType: typeof b.title, subKey: null };
        byType[t].count++;
        const d = b.data;
        if (d && typeof d === 'object') {
          Object.keys(d).forEach((k) => { byType[t].dataKeys[k] = (byType[t].dataKeys[k] || 0) + 1; });
          const segs = d.segments || d.content || d.richText || d.text;
          if (Array.isArray(segs) && segs[0] && typeof segs[0] === 'object') {
            const kk = Object.keys(segs[0]).sort().join(',');
            byType[t].segShapes[kk] = (byType[t].segShapes[kk] || 0) + 1;
            if (!byType[t].sampleSegKeys) {
              const s = segs[0];
              byType[t].sampleSegKeys = Object.keys(s).map((k) => k + '<' + typeof s[k] + '>');
            }
          }
        }
        if (Array.isArray(b.subNodes) && b.subNodes.length && !byType[t].subKey) {
          byType[t].subKey = Object.keys(b.subNodes[0] || {}).join(',') || 'array-of-string';
        }
      });
    } catch (e) { /* skip */ }
  }
  return byType;
});
fs.writeFileSync(OUT + '/by-type.json', JSON.stringify(R, null, 1));
Object.entries(R).sort((a, b) => b[1].count - a[1].count).forEach(([t, v]) => {
  console.log('type=' + t + '  x' + v.count + '  title<' + v.titleType + '>');
  console.log('   data 键: ' + Object.keys(v.dataKeys).join(', '));
  if (v.sampleSegKeys) console.log('   行内段键: ' + v.sampleSegKeys.join(', '));
  const ss = Object.keys(v.segShapes);
  if (ss.length) console.log('   段形状变体: ' + ss.length + ' 种');
});
await browser.close();
