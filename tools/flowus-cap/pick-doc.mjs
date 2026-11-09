import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
const r = await page.evaluate(async () => {
  const ids = Array.from(document.querySelectorAll('[data-test-id="aside-item-toc"]')).map((e) => (e.getAttribute('href') || '').replace(/^\//, '')).filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const names = Array.from(document.querySelectorAll('[data-test-id="aside-item-toc"]')).map((e) => (e.innerText || '').trim());
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    try {
      const j = await (await fetch('/api/docs/' + ids[i], { headers: { accept: 'application/json' } })).json();
      const bs = (j.data || {}).blocks || {};
      const t = {};
      Object.values(bs).forEach((b) => { if (b && typeof b.type === 'number') t[b.type] = (t[b.type] || 0) + 1; });
      out.push({ name: names[i], id: ids[i], total: Object.keys(bs).length, types: t });
    } catch (e) { out.push({ name: names[i], id: ids[i], err: 1 }); }
  }
  return out;
});
r.forEach((x) => console.log(`  ${(x.name || '').padEnd(12)} ${x.id.slice(0, 8)} 共${String(x.total).padStart(3)}块  ${JSON.stringify(x.types)}`));
const textDoc = r.filter((x) => (x.types['1'] || 0) > 0).sort((a, b) => (b.types['1'] || 0) - (a.types['1'] || 0))[0];
console.log('\n段落(type=1)最多的是:', JSON.stringify(textDoc));
await browser.close();
