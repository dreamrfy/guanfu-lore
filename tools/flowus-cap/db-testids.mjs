import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t23';
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

const collect = () => page.evaluate(() => {
  const out = {};
  document.querySelectorAll('[data-test-id]').forEach((e) => {
    const id = e.getAttribute('data-test-id');
    const r = e.getBoundingClientRect();
    out[id] = out[id] || { n: 0, visible: false, sample: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 18) };
    out[id].n++;
    if (r.width > 0 && r.height > 0) out[id].visible = true;
  });
  return out;
});

const base = await collect();
// 打开列头菜单，再扫一次（含菜单内 test-id）
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
let withMenu = {};
if (h) {
  await page.mouse.click(h.x + 30, h.y + h.h / 2);
  await page.waitForTimeout(1800);
  withMenu = await collect();
  // 再进「更换类型」
  const r = await page.evaluate(() => {
    let best = null;
    document.querySelectorAll('[data-test-id="更换类型"]').forEach((e) => {
      const b = e.getBoundingClientRect();
      if (b.width < 10) return;
      best = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    return best;
  });
  if (r) { await page.mouse.click(r.x, r.y); await page.waitForTimeout(2200); }
  withMenu = await collect();
  await page.screenshot({ path: OUT + '/db-testids.png' });
  await page.keyboard.press('Escape');
}

const all = { ...base, ...withMenu };
const ids = Object.keys(all).sort();
const R = { total: ids.length, table: ids.filter((i) => /[一-龥]/.test(i)), english: ids.filter((i) => !/[一-龥]/.test(i)), detail: all };
fs.writeFileSync(OUT + '/db-testids.json', JSON.stringify(R, null, 1));
console.log('test-id 总数:', ids.length, '| 中文名 test-id:', R.table.length, '| 英文 test-id:', R.english.length);
console.log('=== 中文名 test-id（M4 可直接用来定位）===');
console.log(R.table.join(' | '));
console.log('=== 英文 test-id ===');
console.log(R.english.join(' | '));
await browser.close();
