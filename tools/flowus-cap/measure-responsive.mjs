import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const cdp = await ctx.newCDPSession(page);

const probe = () => page.evaluate(() => {
  const out = { sidebars: [], candidates: [], tabBar: null };
  const els = Array.from(document.querySelectorAll('*'));
  for (const e of els) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.x === 0 && r.width >= 180 && r.width <= 320 && r.height > 400) {
      out.sidebars.push({ w: +r.width.toFixed(1), bg: cs.backgroundColor, bd: cs.borderRightWidth, testId: e.getAttribute('data-test-id'), cls: String(e.className).slice(0, 40) });
    }
    if (r.height === 48 && r.width > 500 && r.y === 0) out.tabBar = { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) };
    if (r.y > 90 && r.x > 150 && r.width > 300 && r.width < 1400 && r.height > 20 && r.height < 400) {
      out.candidates.push(Math.round(r.width));
    }
  }
  const count = {};
  out.candidates.forEach((w) => (count[w] = (count[w] || 0) + 1));
  out.topWidths = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w, n]) => w + '(' + n + ')');
  delete out.candidates;
  out.innerW = window.innerWidth;
  return out;
});

for (const [w, h] of [[1280, 800], [1440, 900], [1600, 900], [1920, 945], [2560, 1300]]) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await page.waitForTimeout(1200);
  const r = await probe();
  const sb = r.sidebars.map((s) => s.w + (parseFloat(s.bd) ? '+b' + s.bd : '')).join(' / ');
  console.log(
    `视口 ${String(r.innerW).padStart(4)} | 侧栏(x=0 候选) [${sb}] | 标签条 x=${r.tabBar ? r.tabBar.x : '?'} w=${r.tabBar ? r.tabBar.w : '?'} | 内容列: ${r.topWidths.join(', ')}`
  );
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
await browser.close();
