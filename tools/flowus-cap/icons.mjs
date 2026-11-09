import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:\\dev\\tmp\\flowus-cap\\capture\\m0-t04';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];

const data = await page.evaluate(() => {
  const svgs = Array.from(document.querySelectorAll('svg'));
  const shapes = {};
  const samples = [];
  for (const s of svgs) {
    const r = s.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const vb = s.getAttribute('viewBox') || '';
    const sw = s.getAttribute('stroke-width') || getComputedStyle(s).strokeWidth;
    const st = s.getAttribute('stroke') || getComputedStyle(s).stroke;
    const fl = s.getAttribute('fill') || getComputedStyle(s).fill;
    const kids = s.querySelectorAll('path,circle,rect,line,polyline,g,ellipse').length;
    const key = `${Math.round(r.width)}x${Math.round(r.height)}|vb=${vb}|kids=${kids}|strokeW=${sw}`;
    shapes[key] = (shapes[key] || 0) + 1;
    if (samples.length < 6) {
      samples.push({ key, html: s.outerHTML.slice(0, 300) });
    }
  }
  // 也统计用背景图当图标的
  const bgIcons = [];
  document.querySelectorAll('*').forEach((e) => {
    const bi = getComputedStyle(e).backgroundImage;
    if (bi && bi !== 'none' && /svg|png|data:image/i.test(bi)) {
      const r = e.getBoundingClientRect();
      if (r.width > 4 && r.height > 4 && bgIcons.length < 12) {
        bgIcons.push({ w: Math.round(r.width), h: Math.round(r.height), img: bi.slice(0, 140) });
      }
    }
  });
  return { totalSvg: svgs.length, shapes, samples, bgIcons };
});

console.log('svg 元素总数:', data.totalSvg);
console.log('=== 图标形态分布（宽x高 | viewBox | 子节点数 | 描边宽）===');
Object.entries(data.shapes).sort((a, b) => b[1] - a[1]).slice(0, 18).forEach(([k, n]) => console.log('  ' + String(n).padStart(3) + '  ' + k));
console.log('=== 样本（前 6 个 svg 的外层结构）===');
data.samples.forEach((s, i) => console.log(`  [${i}] ${s.key}\n      ${s.html.replace(/\s+/g, ' ').slice(0, 220)}`));
console.log('=== 用背景图当图标的 ===');
data.bgIcons.slice(0, 8).forEach((b) => console.log(`  ${b.w}x${b.h}  ${b.img}`));

fs.writeFileSync(OUT + '\\icons.json', JSON.stringify(data, null, 1));
console.log('\n已写出:', OUT + '\\icons.json');
await browser.close();
