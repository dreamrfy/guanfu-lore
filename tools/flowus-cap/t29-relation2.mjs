import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t29';
const DOC = '17dffeec-1330-4836-a29f-394c585743a5';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};
await page.goto('https://flowus.cn/' + DOC, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6500);
await page.keyboard.press('Escape');
await page.waitForTimeout(900);

const readSchema = () => page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const out = [];
  Object.values(bs).forEach((b) => {
    const d = b.data || {};
    if (d.schema) Object.entries(d.schema).forEach(([k, f]) => out.push({ name: f.name, type: f.type, keys: Object.keys(f).sort().join(',') }));
  });
  return out;
}, DOC);

const clickText = async (t) => {
  const r = await page.evaluate((txt) => {
    let best = null;
    document.querySelectorAll('div,span,button,li').forEach((e) => {
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

// 重走：列头 → 更换类型 → 关联 → 选一个集合
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
await clickText('更换类型');
await page.waitForTimeout(1800);
const rel = page.locator('[data-test-id="关联"]').first();
if (await rel.count()) await rel.click({ force: true });
await page.waitForTimeout(2800);
R['1 选择集合浮层'] = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.next-modal, [data-popper-placement], [role="dialog"]').forEach((e) => {
    const b = e.getBoundingClientRect();
    if (b.width < 100 || b.height < 60) return;
    out.push({ w: Math.round(b.width), h: Math.round(b.height), text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 200) });
  });
  const seen = new Set();
  return out.filter((o) => { const k = o.text.slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; });
});
await page.screenshot({ path: OUT + '/b-pick-collection.png' });
// 选「学习进度」
R['2 选集合'] = await clickText('学习进度');
await page.waitForTimeout(3500);
await page.screenshot({ path: OUT + '/c-after-pick.png' });
R['3 选后浮层'] = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.next-modal, [data-popper-placement], [role="dialog"]').forEach((e) => {
    const b = e.getBoundingClientRect();
    if (b.width < 100 || b.height < 40) return;
    const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
    if (t) out.push({ w: Math.round(b.width), h: Math.round(b.height), text: t.slice(0, 300) });
  });
  const seen = new Set();
  return out.filter((o) => { const k = o.text.slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; });
});
R['4 schema'] = await readSchema();
R['5 有确认按钮'] = await clickText('确定');
await page.waitForTimeout(2500);
R['6 最终 schema'] = await readSchema();
console.log('选集合:', R['2 选集合']);
console.log('选后浮层:', JSON.stringify(R['3 选后浮层']).slice(0, 400));
console.log('schema:', JSON.stringify(R['4 schema']));
console.log('最终 schema:', JSON.stringify(R['6 最终 schema']));
fs.writeFileSync(OUT + '/relation2.json', JSON.stringify(R, null, 1));
await browser.close();
