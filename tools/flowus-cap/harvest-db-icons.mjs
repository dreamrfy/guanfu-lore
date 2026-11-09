import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t18/icons';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];

const found = new Map();
const harvest = async (surface) => {
  const items = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('svg[data-icon]').forEach((s) => {
      const r = s.getBoundingClientRect();
      if (r.width < 4) return;
      out.push({ name: s.getAttribute('data-icon'), html: s.outerHTML, w: Math.round(r.width), h: Math.round(r.height) });
    });
    return out;
  });
  for (const it of items) {
    const cur = found.get(it.name);
    if (cur) { if (!cur.surfaces.includes(surface)) cur.surfaces.push(surface); }
    else found.set(it.name, { html: it.html, surfaces: [surface], w: it.w, h: it.h });
  }
  return items.length;
};

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4500);
await page.keyboard.press('Escape'); await page.waitForTimeout(600);
await page.locator('[data-test-id="aside-item-toc"]').filter({ hasText: '无标题多维表格' }).first().click({ force: true });
await page.waitForTimeout(5500);
await page.keyboard.press('Escape'); await page.waitForTimeout(800);
await harvest('表格页');

const clickText = async (t) => {
  const r = await page.evaluate((txt) => {
    let best = null;
    document.querySelectorAll('div,span,button,li').forEach((e) => {
      if ((e.innerText || '').trim() !== txt) return;
      const b = e.getBoundingClientRect();
      if (b.width < 10 || b.height < 8) return;
      if (!best || b.width * b.height < best.w * best.h) best = { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    return best;
  }, t);
  if (!r) return false;
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  return true;
};

// 列头菜单
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
console.log('列头菜单图标:', await harvest('列头菜单'));
await clickText('更换类型');
await page.waitForTimeout(2200);
console.log('字段类型菜单图标:', await harvest('字段类型菜单'));
await page.screenshot({ path: OUT + '/types.png' });

const manifest = [];
for (const [name, v] of found) {
  const safe = name.replace(/[^A-Za-z0-9_-]/g, '_');
  fs.writeFileSync(`${OUT}/${safe}.svg`, v.html);
  manifest.push({ name, file: safe + '.svg', surfaces: v.surfaces, size: v.w + 'x' + v.h });
}
manifest.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(OUT + '/manifest.json', JSON.stringify({ count: manifest.length, icons: manifest }, null, 1));
console.log('本次共收（去重）:', found.size);
console.log(manifest.map((m) => m.name).join(', '));
await page.keyboard.press('Escape');
await browser.close();
