import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t29';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);

const r = await page.evaluate(async () => {
  const id = '0e207dcb-a6fe-40d8-8867-af42cf465a72'; // 学习进度
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const fields = [];
  Object.values(bs).forEach((b) => {
    const d = b.data || {};
    if (d.schema) Object.entries(d.schema).forEach(([k, f]) => fields.push({ k, name: f.name, type: f.type, keys: Object.keys(f).sort().join(',') }));
  });
  return { blocks: Object.keys(bs).length, fields };
});
fs.writeFileSync(OUT + '/learning-progress-schema.json', JSON.stringify(r, null, 1));
console.log('学习进度：块', r.blocks, '| 字段', r.fields.length);
r.fields.forEach((f) => console.log(`  ${f.name.padEnd(10)} ${f.type.padEnd(12)} keys=${f.keys}`));
const rels = r.fields.filter((f) => f.type === 'relation');
console.log('relation 字段:', rels.map((x) => x.name).join(', ') || '无');
const suspicious = r.fields.filter((f) => /分类/.test(f.name));
console.log('名字含「分类」的字段:', suspicious.map((x) => x.name + '(' + x.type + ')').join(', ') || '无');
await browser.close();
