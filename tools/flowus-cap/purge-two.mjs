import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const ids = ['58dcd4bb-eb8c-4861-b9e5-9d60dd82b33b', '698a44a7-b324-4234-94ba-380e58f3638e'];
const R = {};
for (const id of ids) {
  await page.goto('https://flowus.cn/' + id, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  const hasBar = await page.locator('[data-test-id="delete-bar-delete"]').count();
  R['bar-' + id.slice(0, 8)] = hasBar;
  if (!hasBar) { R['skip-' + id.slice(0, 8)] = '无删除横幅（可能已彻底删除或在正常态）'; continue; }
  await page.locator('[data-test-id="delete-bar-delete"]').first().click({ force: true });
  await page.waitForTimeout(2000);
  // 确认框里点「确定」
  const btn = await page.evaluate(() => {
    let best = null;
    document.querySelectorAll('button,div,span').forEach((e) => {
      const t = (e.innerText || '').trim();
      if (t !== '确定' && t !== '删除') return;
      const r = e.getBoundingClientRect();
      if (r.width < 20 || r.height < 16) return;
      if (!best) best = { t, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    return best;
  });
  R['confirm-' + id.slice(0, 8)] = btn ? btn.t : '无确认框';
  if (btn) await page.mouse.click(btn.x, btn.y);
  await page.waitForTimeout(3500);
  R['after-' + id.slice(0, 8)] = await page.locator('[data-test-id="delete-bar-delete"]').count();
}
// 复核 API
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3500);
R['复核'] = await page.evaluate(async (arr) => {
  const out = {};
  for (const id of arr) {
    const res = await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } });
    const j = await res.json().catch(() => null);
    const blocks = (j && j.data && j.data.blocks) || {};
    const root = Object.values(blocks).find((b) => b && !b.parentId);
    out[id.slice(0, 8)] = { http: res.status, blocks: Object.keys(blocks).length, status: root ? root.status : null };
  }
  return out;
}, ids);
console.log(JSON.stringify(R, null, 1));
await browser.close();
