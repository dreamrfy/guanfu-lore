import { chromium } from 'playwright-core';
const DOC = 'bdb41a2a-d683-43cc-8525-eae9ebd18187';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const clickText = async (t) => {
  const r = await page.evaluate((txt) => {
    let best = null;
    document.querySelectorAll('div,span,button,li').forEach((e) => {
      if ((e.innerText || '').trim() !== txt) return;
      const b = e.getBoundingClientRect();
      if (b.width < 8 || b.height < 8) return;
      if (!best || b.width * b.height < best.w * best.h) best = { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    return best;
  }, t);
  if (!r) return false;
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  return true;
};
await page.goto('https://flowus.cn/' + DOC, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.keyboard.press('Escape'); await page.waitForTimeout(600);

// 第一步：页面 ⋯ → 删除
await page.locator('[data-test-id="page-header-more"]').first().click({ force: true });
await page.waitForTimeout(1800);
console.log('菜单里点删除:', await clickText('删除'));
await page.waitForTimeout(2200);
// 确认框
const c1 = await page.evaluate(() => {
  let best = null;
  document.querySelectorAll('.next-modal button, .next-modal div, button').forEach((e) => {
    const t = (e.innerText || '').trim();
    if (t !== '确定' && t !== '删除') return;
    const r = e.getBoundingClientRect();
    if (r.width < 20 || r.height < 16) return;
    if (!best) best = { t, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  return best;
});
if (c1) { await page.mouse.click(c1.x, c1.y); await page.waitForTimeout(2500); console.log('确认删除:', c1.t); }

// 第二步：彻底删除
const bar = await page.locator('[data-test-id="delete-bar-delete"]').count();
console.log('删除横幅存在:', bar);
if (bar) {
  await page.locator('[data-test-id="delete-bar-delete"]').first().click({ force: true });
  await page.waitForTimeout(2200);
  const c2 = await page.evaluate(() => {
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
  if (c2) { await page.mouse.click(c2.x, c2.y); await page.waitForTimeout(3000); console.log('彻底删除确认:', c2.t); }
}
const chk = await page.evaluate(async (id) => {
  const res = await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } });
  const j = await res.json().catch(() => null);
  const bs = ((j || {}).data || {}).blocks || {};
  const root = Object.values(bs).find((b) => b && !b.parentId);
  return { blocks: Object.keys(bs).length, status: root ? root.status : null };
}, DOC);
console.log('复核:', JSON.stringify(chk), chk.blocks === 0 ? '→ 已彻底删除 ✓' : '→ 仍存在 ✗');
const side = await page.evaluate(() => Array.from(document.querySelectorAll('[data-test-id="aside-item-toc"]')).map((e) => (e.innerText || '').trim()));
console.log('侧栏项目数:', side.length, '| 列表:', side.join(' / '));
await browser.close();
