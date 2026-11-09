import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t22';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape'); await page.waitForTimeout(700);
// 用已存在的临时页（上一步建的），避免再建一页
await page.locator('[data-test-id="aside-item-toc"]').nth(5).click({ force: true });
await page.waitForTimeout(4000);
await page.mouse.click(900, 300);
await page.waitForTimeout(1000);
await page.keyboard.type('/', { delay: 90 });
await page.waitForTimeout(2500);

const r = await page.evaluate(() => {
  let best = null;
  document.querySelectorAll('.next-modal, [role="menu"], [data-popper-placement]').forEach((e) => {
    const b = e.getBoundingClientRect();
    if (b.width < 100 || b.height < 60) return;
    const t = (e.innerText || '').trim();
    if (!best || t.length > best.len) best = { len: t.length, w: Math.round(b.width), h: Math.round(b.height), text: t };
  });
  // 逐行拆
  const lines = best ? best.text.split('\n').map((s) => s.trim()).filter(Boolean) : [];
  return { w: best ? best.w : null, h: best ? best.h : null, raw: best ? best.text : '', lines };
});
fs.writeFileSync(OUT + '/slash-menu-full.json', JSON.stringify(r, null, 1));
console.log('面板:', r.w + 'x' + r.h, '| 行数:', r.lines.length);
console.log('=== 全部行（含分组与快捷码）===');
r.lines.forEach((l, i) => console.log(`  ${String(i).padStart(2)}  ${l}`));
await page.keyboard.press('Escape');
await browser.close();
