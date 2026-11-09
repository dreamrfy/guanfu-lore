import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t20';
const DOC = '1659bc9c-0ec3-4607-bfa1-061cdbfea9c6';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};
await page.goto('https://flowus.cn/' + DOC, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.keyboard.press('Escape');
await page.mouse.move(5, 5);
await page.waitForTimeout(1000);

const snap = () => page.evaluate(() => {
  const w = Array.from(document.querySelectorAll('div')).find((e) => String(e.className || '').includes('block-before-icon-mt') && e.getBoundingClientRect().x > 240);
  if (!w) return { error: 'no wrap' };
  const r = w.getBoundingClientRect();
  const svg = w.querySelector('svg');
  const path = svg ? svg.querySelector('path') : null;
  const block = w.parentElement && w.parentElement.parentElement;
  const tEl = block ? block.querySelector('[contenteditable="true"], span') : null;
  const tcs = tEl ? getComputedStyle(tEl) : null;
  return {
    wrap: { w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: Math.round(r.x), y: Math.round(r.y) },
    icon: svg ? svg.getAttribute('data-icon') : null,
    iconSize: svg ? Math.round(svg.getBoundingClientRect().width) : null,
    pathFill: path ? getComputedStyle(path).fill : null,
    pathD: path ? path.getAttribute('d').slice(0, 200) : null,
    svgCls: svg ? String(svg.getAttribute('class') || '') : null,
    textColor: tcs ? tcs.color : null,
    textDeco: tcs ? tcs.textDecorationLine : null,
    hasSvgInPath: svg ? svg.querySelectorAll('path').length : 0,
  };
});
R['1 未勾选'] = await snap();
const c = R['1 未勾选'].wrap;
await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2);
await page.waitForTimeout(800);
R['2 hover'] = await snap();
await page.screenshot({ path: OUT + '/f-hover.png' });
await page.mouse.click(c.x + c.w / 2, c.y + c.h / 2);
await page.waitForTimeout(2500);
await page.mouse.move(5, 5);
await page.waitForTimeout(1000);
R['3 勾选后'] = await snap();
await page.screenshot({ path: OUT + '/g-checked.png' });
fs.writeFileSync(OUT + '/checkbox3.json', JSON.stringify(R, null, 1));
for (const k of Object.keys(R)) {
  const v = R[k];
  console.log('=== ' + k + ' ===');
  if (v.error) { console.log('  ' + v.error); continue; }
  console.log(`  wrap ${v.wrap.w}x${v.wrap.h} @${v.wrap.x},${v.wrap.y} | icon=${v.icon} ${v.iconSize}px | pathFill=${v.pathFill} | 路径数=${v.hasSvgInPath}`);
  console.log(`  文字色=${v.textColor} 装饰=${v.textDeco}`);
  console.log(`  pathD=${v.pathD}`);
}
await browser.close();
