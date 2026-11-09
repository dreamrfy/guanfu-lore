/**
 * 深色主题全量采集（M0-T14）
 * 模拟系统深色后，按 capture.mjs 同款口径抓元素几何与计算样式，供 palette.mjs 反推深色板。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t14/dark';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
await page.mouse.move(5, 5);
await page.waitForTimeout(600);

// 打开一篇普通页，保证文档区也被采到
await page.locator('[data-test-id="aside-item-toc"]').filter({ hasText: '归档历史材料' }).first().click({ force: true });
await page.waitForTimeout(4500);
await page.keyboard.press('Escape');
await page.mouse.move(5, 5);
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/dark-page.png' });

const data = await page.evaluate(() => {
  const SKIP = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'TITLE', 'BR'];
  const out = [];
  const walk = (el) => {
    if (out.length >= 1200) return;
    if (el.nodeType !== 1 || SKIP.includes(el.tagName)) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    out.push({
      cls: String(el.className || '').slice(0, 140) || null,
      testId: el.getAttribute('data-test-id') || null,
      own: '',
      txt: '',
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      style: {
        color: cs.color, background: cs.backgroundColor, borderColor: cs.borderColor,
        fontSize: cs.fontSize, lineHeight: cs.lineHeight, fontWeight: cs.fontWeight,
        borderRadius: cs.borderRadius, boxShadow: cs.boxShadow,
        fontFamily: cs.fontFamily,
      },
    });
    for (const c of el.children) walk(c);
  };
  walk(document.body);
  const rootCs = getComputedStyle(document.documentElement);
  const bodyCs = getComputedStyle(document.body);
  return {
    elements: out,
    root: { colorScheme: rootCs.colorScheme, bg: bodyCs.backgroundColor, color: bodyCs.color },
  };
});

fs.writeFileSync(OUT + '/elements.json', JSON.stringify({ count: data.elements.length, elements: data.elements }, null, 1));
fs.writeFileSync(OUT + '/meta.json', JSON.stringify({
  mode: 'dark(emulated prefers-color-scheme)',
  capturedAt: new Date().toISOString(),
  url: page.url(),
  root: data.root,
  elementCount: data.elements.length,
}, null, 1));
console.log('深色采集完成：元素', data.elements.length, '| root:', JSON.stringify(data.root));
await cdp.send('Emulation.setEmulatedMedia', { features: [] });
await browser.close();
