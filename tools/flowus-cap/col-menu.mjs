import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t18';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4500);
await page.keyboard.press('Escape'); await page.waitForTimeout(600);
await page.locator('[data-test-id="aside-item-toc"]').filter({ hasText: '无标题多维表格' }).first().click({ force: true });
await page.waitForTimeout(5500);
await page.keyboard.press('Escape'); await page.waitForTimeout(800);

const findText = (t) => page.evaluate((txt) => {
  const out = [];
  document.querySelectorAll('div,span,th').forEach((e) => {
    if ((e.innerText || '').trim() !== txt) return;
    const r = e.getBoundingClientRect();
    if (r.width < 10 || r.height < 10 || r.x < 240) return;
    if (e.children.length > 2) return;
    out.push({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
  });
  return out;
}, t);

for (const col of ['分类', '标题']) {
  const hits = await findText(col);
  R['找到-' + col] = hits;
  if (!hits.length) continue;
  const h = hits[0];
  await page.mouse.click(h.x + Math.min(30, h.w / 2), h.y + h.h / 2);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: OUT + '/e-col-' + col + '.png' });
  const layers = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.next-modal, [role="menu"], [data-popper-placement]').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 60 || r.height < 30) return;
      const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
      if (t) out.push({ w: Math.round(r.width), h: Math.round(r.height), text: t.slice(0, 500) });
    });
    const seen = new Set();
    return out.filter((o) => { const k = o.text.slice(0, 100); if (seen.has(k)) return false; seen.add(k); return true; });
  });
  R['菜单-' + col] = layers;
  // 试着进「编辑属性」看字段类型清单
  const probe = await page.evaluate(() => {
    let best = null;
    document.querySelectorAll('div,span,button,li').forEach((e) => {
      const t = (e.innerText || '').trim();
      if (t !== '编辑属性' && t !== '更改类型' && t !== '编辑字段') return;
      const r = e.getBoundingClientRect();
      if (r.width < 10) return;
      best = { t, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    return best;
  });
  if (probe) {
    await page.mouse.click(probe.x, probe.y);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: OUT + '/f-types-' + col + '.png' });
    R['类型清单-' + col] = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.next-modal, [role="menu"], [data-popper-placement]').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width < 60 || r.height < 40) return;
        const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
        if (t) out.push({ w: Math.round(r.width), h: Math.round(r.height), text: t.slice(0, 600) });
      });
      const seen = new Set();
      return out.filter((o) => { const k = o.text.slice(0, 100); if (seen.has(k)) return false; seen.add(k); return true; });
    });
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(900);
  await page.keyboard.press('Escape'); await page.waitForTimeout(900);
}
fs.writeFileSync(OUT + '/col-menu.json', JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1));
await browser.close();
