import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t31';
const DOC = '4bd10a96-3320-4057-ac9b-9df013cceaa8';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/' + DOC, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6500);
await page.keyboard.press('Escape');
await page.mouse.move(5, 5);
await page.waitForTimeout(900);

const r = await page.evaluate(() => {
  // 找到 "AAA段落唯一文本" 的叶子，然后沿父链逐层记录 fontSize/lineHeight/height
  let leaf = null;
  document.querySelectorAll('div,span,p').forEach((e) => {
    const t = (e.innerText || '').trim();
    if (!t.startsWith('AAA段落唯一文本')) return;
    const rr = e.getBoundingClientRect();
    if (rr.width < 10 || rr.height < 6 || rr.x < 240) return;
    if (!leaf || rr.width * rr.height < leaf.w * leaf.h) leaf = { el: e, w: rr.width, h: rr.height };
  });
  if (!leaf) return { error: '未找到锚点' };
  const chain = [];
  let n = leaf.el;
  for (let i = 0; i < 7 && n; i++) {
    const cs = getComputedStyle(n);
    const rr = n.getBoundingClientRect();
    chain.push({
      level: i,
      tag: n.tagName,
      cls: String(n.className).slice(0, 60),
      fs: cs.fontSize,
      lh: cs.lineHeight,
      h: Math.round(rr.height),
      w: Math.round(rr.width),
      x: Math.round(rr.x),
    });
    n = n.parentElement;
  }
  return { chain };
});
console.log(JSON.stringify(r, null, 1));
fs.writeFileSync(OUT + '/line-height-chain.json', JSON.stringify(r, null, 1));
await browser.close();
