import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t10';
const DL = OUT + '/dl-md';
fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const cdp = await ctx.newCDPSession(page);
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL.replace(/\//g, '\\') });

const rectOf = (t) => page.evaluate((txt) => {
  let best = null;
  document.querySelectorAll('span,div,li,a,button').forEach((e) => {
    if ((e.innerText || '').trim() !== txt) return;
    const r = e.getBoundingClientRect();
    if (r.width < 10 || r.height < 8) return;
    if (!best || r.width * r.height < best.w * best.h) best = { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  return best;
}, t);
const clickAt = async (t) => { const r = await rectOf(t); if (!r) return false; await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); return true; };

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4500);
await page.keyboard.press('Escape'); await page.waitForTimeout(700);
await page.locator('[data-test-id="aside-item-toc"]').filter({ hasText: '归档历史材料' }).first().click({ force: true });
await page.waitForTimeout(4000);

await page.locator('[data-test-id="page-header-more"]').first().click({ force: true });
await page.waitForTimeout(1700);
await clickAt('导出页面');
await page.waitForTimeout(2200);
await clickAt('Markdown & CSV');
await page.waitForTimeout(2500);
// 勾上「导出子页面」「按目录导出」，采到更完整的结构
await clickAt('按目录导出').catch(() => {});
await page.waitForTimeout(800);
const okBtn = await page.evaluate(() => {
  let best = null;
  document.querySelectorAll('button,div,span').forEach((e) => {
    if ((e.innerText || '').trim() !== '导出') return;
    const r = e.getBoundingClientRect();
    if (r.width < 20 || r.height < 16) return;
    if (!best || r.y > best.y) best = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  return best;
});
if (okBtn) await page.mouse.click(okBtn.x, okBtn.y);
await page.waitForTimeout(15000);
await page.screenshot({ path: OUT + '/v-md-export.png' });
console.log('下载目录:', fs.readdirSync(DL));
await browser.close();
