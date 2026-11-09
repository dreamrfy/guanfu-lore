import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t05';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

const row = page.locator('[data-test-id="aside-item-toc"]').nth(5);
await row.hover();
await page.waitForTimeout(900);
await row.locator('[data-test-id="aside-item-more"]').first().click({ force: true });
await page.waitForTimeout(2000);
await page.screenshot({ path: OUT + '/i1-menu.png' });

const r = await page.evaluate(() => {
  const dd = document.querySelector('.next-modal-dropdown');
  if (!dd) return { error: 'no dropdown' };
  const b = dd.getBoundingClientRect();
  const out = {
    wrap: { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) },
    panels: [],
    items: [],
  };
  dd.querySelectorAll('*').forEach((e) => {
    const cs = getComputedStyle(e);
    const q = e.getBoundingClientRect();
    if (q.width < 150 || q.height < 100) return;
    out.panels.push({
      rect: { w: +q.width.toFixed(1), h: +q.height.toFixed(1) },
      bg: cs.backgroundColor, radius: cs.borderRadius, padding: cs.padding,
      border: cs.borderWidth + ' ' + cs.borderColor,
      shadow: cs.boxShadow === 'none' ? null : cs.boxShadow.slice(0, 64),
    });
  });
  const seen = new Set();
  dd.querySelectorAll('div,li,button,a').forEach((e) => {
    const cs = getComputedStyle(e);
    const q = e.getBoundingClientRect();
    if (q.height < 24 || q.height > 44 || q.width < 150) return;
    const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
    if (!t || t.length > 20 || e.children.length > 3 || seen.has(t)) return;
    seen.add(t);
    out.items.push({
      t, y: +q.y.toFixed(1), h: +q.height.toFixed(1), w: +q.width.toFixed(1),
      radius: cs.borderRadius, padding: cs.padding,
      font: cs.fontSize + '/' + cs.lineHeight + '/w' + cs.fontWeight, color: cs.color,
    });
  });
  out.items = out.items.slice(0, 14);
  return out;
});
console.log(JSON.stringify(r, null, 1));
fs.writeFileSync(OUT + '/menu.json', JSON.stringify(r, null, 1));
await page.keyboard.press('Escape');
await browser.close();
