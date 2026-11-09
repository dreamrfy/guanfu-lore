import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t23';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4500);

const r = await page.evaluate(async () => {
  const out = {};
  for (const ep of ['/api/rag/capabilities', '/api/spaces/plans']) {
    try {
      const res = await fetch(ep, { headers: { accept: 'application/json' } });
      const t = await res.text();
      out[ep] = { status: res.status, len: t.length, head: t.slice(0, 600) };
      // 找类型关键词
      const kws = ['multi_select', 'checkbox', 'formula', 'rollup', 'relation', 'created_time', 'person', 'member'];
      out[ep].hits = kws.filter((k) => t.includes(k));
    } catch (e) { out[ep] = { err: String(e).slice(0, 60) }; }
  }
  return out;
});
console.log(JSON.stringify(r, null, 1).slice(0, 2000));
fs.writeFileSync(OUT + '/capabilities.json', JSON.stringify(r, null, 1));
await browser.close();
