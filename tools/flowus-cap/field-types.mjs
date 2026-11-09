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

// 点「分类」列头
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

R['1 点更换类型'] = await clickText('更换类型');
await page.waitForTimeout(2200);
await page.screenshot({ path: OUT + '/g-field-types.png' });

R['2 浮层'] = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.next-modal, [role="menu"], [data-popper-placement]').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 60 || r.height < 40) return;
    const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
    if (t) out.push({ w: Math.round(r.width), h: Math.round(r.height), text: t.slice(0, 800) });
  });
  const seen = new Set();
  return out.filter((o) => { const k = o.text.slice(0, 120); if (seen.has(k)) return false; seen.add(k); return true; });
});

// 逐项量尺寸与图标
R['3 类型项清单'] = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.next-modal div, [role="menu"] div, [data-popper-placement] div').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.height < 26 || r.height > 44 || r.width < 100 || r.width > 260) return;
    const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
    if (!t || t.length > 12 || e.children.length > 3) return;
    const cs = getComputedStyle(e);
    const svg = e.querySelector('svg'), img = e.querySelector('img');
    out.push({
      t, h: Math.round(r.height), w: Math.round(r.width),
      radius: cs.borderRadius, font: cs.fontSize + '/' + cs.lineHeight,
      icon: svg ? (svg.getAttribute('data-icon') || 'svg') : (img ? 'img' : null),
      iconCls: svg ? String(svg.getAttribute('class') || '').slice(0, 50) : null,
    });
  });
  const seen = new Set();
  return out.filter((o) => { if (seen.has(o.t)) return false; seen.add(o.t); return true; }).slice(0, 40);
});
fs.writeFileSync(OUT + '/field-types.json', JSON.stringify(R, null, 1));
console.log('=== 浮层 ===');
(R['2 浮层'] || []).forEach((l) => console.log('  [' + l.w + 'x' + l.h + '] ' + l.text.slice(0, 600)));
console.log('=== 类型项（' + (R['3 类型项清单'] || []).length + ' 个）===');
(R['3 类型项清单'] || []).forEach((it) => console.log('  ' + it.t.padEnd(10) + ' ' + it.w + 'x' + it.h + ' r=' + it.radius + ' ' + it.font + ' icon=' + (it.icon || '无')));
await page.keyboard.press('Escape');
await browser.close();
