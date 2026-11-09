import { chromium } from 'playwright-core';
import fs from 'node:fs';
const DOC = '1659bc9c-0ec3-4607-bfa1-061cdbfea9c6';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/' + DOC, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
// 取勾选态图标的完整 SVG（页面上此时应是勾选态）
const svgs = await page.evaluate(() => {
  const out = {};
  document.querySelectorAll('svg[data-icon]').forEach((s) => {
    const n = s.getAttribute('data-icon');
    if (/IcCheckbox/.test(n) && !out[n]) out[n] = s.outerHTML;
  });
  return out;
});
console.log('页面上找到的勾选框图标:', Object.keys(svgs));
for (const [n, html] of Object.entries(svgs)) {
  fs.writeFileSync('E:/VBcoding/bijiapp/docs/基准/图标/' + n + '.svg', html);
  console.log('  已保存', n + '.svg', html.length, 'B');
}
// ---- 三步彻底删页 ----
await page.locator('[data-test-id="delete-bar-delete"]').first().click({ force: true }).catch(() => {});
await page.waitForTimeout(2000);
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
if (btn) { await page.mouse.click(btn.x, btn.y); await page.waitForTimeout(3000); console.log('已点确认:', btn.t); }
const chk = await page.evaluate(async (id) => {
  const res = await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } });
  const j = await res.json().catch(() => null);
  return Object.keys(((j || {}).data || {}).blocks || {}).length;
}, DOC);
console.log('删除后该页块数:', chk, chk === 0 ? '→ 已彻底删除 ✓' : '→ 仍存在 ✗');
await browser.close();
