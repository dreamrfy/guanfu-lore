import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t29';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);

const r = await page.evaluate(async () => {
  const id = '0e207dcb-a6fe-40d8-8867-af42cf465a72';
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const perBlock = [];
  Object.entries(bs).forEach(([uuid, b]) => {
    const d = b.data || {};
    if (!d.schema) return;
    perBlock.push({
      uuid: uuid.slice(0, 8),
      blockType: b.type,
      fieldCount: Object.keys(d.schema).length,
      fields: Object.values(d.schema).map((f) => ({ name: f.name, type: f.type })),
    });
  });
  return { totalBlocks: Object.keys(bs).length, schemaBlocks: perBlock.length, perBlock };
});
fs.writeFileSync(OUT + '/learning-progress-per-block.json', JSON.stringify(r, null, 1));
console.log('总块数:', r.totalBlocks, '| 含 schema 的块:', r.schemaBlocks);
r.perBlock.forEach((b, i) => {
  console.log(`块${i} (${b.uuid}, blockType=${b.blockType}) 字段${b.fieldCount}个:`);
  b.fields.forEach((f) => console.log(`    ${f.name} : ${f.type}`));
});
await browser.close();
