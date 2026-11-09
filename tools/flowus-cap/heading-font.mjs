import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t24';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/11572688-3c81-4054-a204-37f948284708', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.keyboard.press('Escape');
await page.mouse.move(5, 5);
await page.waitForTimeout(900);

const r = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('div,span,h1,h2,h3,h4,p').forEach((e) => {
    const rr = e.getBoundingClientRect();
    if (rr.width < 20 || rr.height < 8 || rr.x < 240 || rr.x > 800) return;
    if (e.children.length > 1) return;
    const t = (e.innerText || '').trim();
    if (!t || t.length > 40) return;
    const cs = getComputedStyle(e);
    out.push({
      tag: e.tagName, w: Math.round(rr.width), h: Math.round(rr.height), x: Math.round(rr.x),
      fontSize: cs.fontSize, lineHeight: cs.lineHeight, fontWeight: cs.fontWeight,
      sample: t.slice(0, 10),
    });
  });
  // 按 fontSize 分组
  const g = {};
  out.forEach((o) => { const k = o.fontSize + '/' + o.lineHeight + '/w' + o.fontWeight; (g[k] = g[k] || []).push(o.h); });
  return { rows: out.slice(0, 30), groups: Object.fromEntries(Object.entries(g).map(([k, hs]) => [k, { n: hs.length, heights: [...new Set(hs)].sort((a, b) => a - b).slice(0, 6) }])) };
});
fs.writeFileSync(OUT + '/heading-font.json', JSON.stringify(r, null, 1));
console.log('=== 按 字号/行高/字重 分组（看标题到底多大）===');
Object.entries(r.groups).sort((a, b) => b[1].n - a[1].n).forEach(([k, v]) => console.log(`  ${k.padEnd(26)} n=${String(v.n).padStart(3)} 块高=${JSON.stringify(v.heights)}`));
console.log('=== 样本（前 12）===');
r.rows.slice(0, 12).forEach((o) => console.log(`  ${o.tag.padEnd(4)} ${String(o.h).padStart(4)}高 x=${o.x} ${o.fontSize}/${o.lineHeight}/w${o.fontWeight} [${o.sample}]`));
await browser.close();
