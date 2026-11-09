import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];

// 找主题/外观相关入口
const hits = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('*').forEach((e) => {
    const t = (e.getAttribute('title') || '') + '|' + (e.getAttribute('aria-label') || '') + '|' + (e.innerText || '').slice(0, 30);
    if (/主题|外观|深色|夜间|模式|theme|dark|appearance/i.test(t)) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && e.children.length < 4) {
        out.push({ tag: e.tagName, t: t.replace(/\s+/g, ' ').slice(0, 50), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), testId: e.getAttribute('data-test-id') });
      }
    }
  });
  return out.slice(0, 25);
});
console.log('=== 主题相关元素 ===');
if (!hits.length) console.log('（当前页面没找到，可能需要先打开某个设置菜单）');
hits.forEach((h) => console.log(' ', JSON.stringify(h)));

// 看 body/html 上的 class 里有没有 dark
const cls = await page.evaluate(() => ({
  html: document.documentElement.className,
  body: (document.body.className || '').slice(0, 120),
  colorScheme: getComputedStyle(document.documentElement).colorScheme,
}));
console.log('=== 根节点 ===', JSON.stringify(cls));
await browser.close();
