import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t06';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
R['1 当前 URL'] = page.url();

// 采删除恢复横幅的规格
R['2 删除横幅'] = await page.evaluate(() => {
  const out = [];
  ['delete-bar-restore', 'delete-bar-delete'].forEach((id) => {
    const e = document.querySelector(`[data-test-id="${id}"]`);
    if (!e) { out.push({ id, error: '未找到' }); return; }
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    out.push({
      id, text: (e.innerText || '').trim(),
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      bg: cs.backgroundColor, color: cs.color, radius: cs.borderRadius, padding: cs.padding,
      border: cs.borderWidth + ' ' + cs.borderColor, font: cs.fontSize + '/' + cs.lineHeight + '/w' + cs.fontWeight,
    });
  });
  // 横幅容器
  const bar = document.querySelector('.delete-bar') || (document.querySelector('[data-test-id="delete-bar-restore"]') || {}).parentElement;
  if (bar) {
    const cs = getComputedStyle(bar);
    const r = bar.getBoundingClientRect();
    out.push({ id: '横幅容器', cls: String(bar.className).slice(0, 70), rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, bg: cs.backgroundColor, color: cs.color, font: cs.fontSize + '/' + cs.lineHeight });
  }
  return out;
});
await page.screenshot({ path: OUT + '/k1-delete-bar.png' });

// 彻底删除
try {
  const del = page.locator('[data-test-id="delete-bar-delete"]').first();
  await del.click({ force: true, timeout: 8000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: OUT + '/k2-confirm.png' });
  // 二次确认
  const confirm = page.getByText('删除', { exact: true }).last();
  const box = await confirm.boundingBox().catch(() => null);
  if (box) { await confirm.click({ force: true }); await page.waitForTimeout(2500); }
  R['3 彻底删除'] = box ? '已点 + 二次确认' : '已点（无二次确认框）';
} catch (e) { R['3 彻底删除'] = '失败: ' + e.message.split('\n')[0]; }

await page.waitForTimeout(1500);
R['4 删除后 URL'] = page.url();
R['5 删除后侧栏'] = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-test-id="aside-item-toc"]')).map((e) => (e.innerText || '').trim().replace(/\s+/g, ' '))
);
// 回收站里还有没有
R['6 回收站检查'] = await page.evaluate(async () => '需人工看（无接口）');

fs.writeFileSync(OUT + '/cleanup.json', JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1));
await browser.close();
