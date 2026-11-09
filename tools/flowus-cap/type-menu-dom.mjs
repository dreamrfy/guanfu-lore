import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t23';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
await page.locator('[data-test-id="aside-item-toc"]').filter({ hasText: '无标题多维表格' }).first().click({ force: true });
await page.waitForTimeout(5500);
await page.keyboard.press('Escape');
await page.waitForTimeout(800);

// 点「分类」列头 → 更换类型
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
console.log('点更换类型:', await clickText('更换类型'));
await page.waitForTimeout(2200);

// 把类型菜单里每一项的完整属性掏出来（找 type 值线索）
const items = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.next-modal div, [role="menu"] div, [data-popper-placement] div').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.height < 26 || r.height > 44 || r.width < 100 || r.width > 260) return;
    const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
    if (!t || t.length > 12 || e.children.length > 3) return;
    // 收集该元素及其子元素的全部属性
    const attrs = {};
    const collect = (n) => {
      for (const a of n.attributes || []) {
        if (/^(class|style|width|height)$/.test(a.name)) continue;
        attrs[a.name] = a.value.slice(0, 60);
      }
    };
    collect(e);
    e.querySelectorAll('*').forEach(collect);
    out.push({ t, attrs, cls: String(e.className).slice(0, 80), html: e.outerHTML.replace(/\s+/g, ' ').slice(0, 260) });
  });
  const seen = new Set();
  return out.filter((o) => { if (seen.has(o.t)) return false; seen.add(o.t); return true; });
});
fs.writeFileSync(OUT + '/type-menu-dom.json', JSON.stringify(items, null, 1));
console.log('类型菜单项数:', items.length);
items.forEach((i) => {
  const at = Object.keys(i.attrs).filter((k) => !/^data-(radix|state)/.test(k));
  console.log(`  ${i.t.padEnd(8)} 属性=[${at.map((k) => k + '=' + i.attrs[k]).join(' ; ').slice(0, 130)}]`);
});
await page.keyboard.press('Escape');
await browser.close();
