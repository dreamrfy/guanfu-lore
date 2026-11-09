import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t21';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape'); await page.waitForTimeout(700);

const row = page.locator('[data-test-id="aside-item-toc"]').nth(5);
await row.hover(); await page.waitForTimeout(800);
await row.locator('[data-test-id="aside-item-more"]').first().click({ force: true });
await page.waitForTimeout(1800);

// 每次重新取菜单项矩形，hover 左内侧 30px，读 elementFromPoint 向上找带背景层
const labels = ['添加到快速访问','拷贝副本','复制页面链接','重命名','移动到','删除','在侧边栏打开','在新窗口打开'];
const out = [];
for (const lb of labels) {
  const r = await page.evaluate((t) => {
    let best = null;
    document.querySelectorAll('.next-modal-dropdown div').forEach((e) => {
      if ((e.innerText || '').trim().replace(/\s+/g,' ') !== t) return;
      const b = e.getBoundingClientRect();
      if (b.height < 26 || b.height > 40 || b.width < 150) return;
      if (!best || b.width * b.height < best.w * best.h) best = { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    return best;
  }, lb);
  if (!r) { out.push({ t: lb, note: '未找到' }); continue; }
  const px = r.x + 30, py = r.y + r.h / 2;
  await page.mouse.move(1400, 600); await page.waitForTimeout(400);
  const before = await page.evaluate(({ x, y }) => {
    let n = document.elementFromPoint(x, y), best = null;
    for (let i = 0; i < 6 && n; i++) { const cs = getComputedStyle(n); if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') best = { bg: cs.backgroundColor, r: cs.borderRadius }; n = n.parentElement; }
    return best;
  }, { x: px, y: py });
  await page.mouse.move(px, py); await page.waitForTimeout(700);
  const after = await page.evaluate(({ x, y }) => {
    let n = document.elementFromPoint(x, y), best = null;
    for (let i = 0; i < 6 && n; i++) { const cs = getComputedStyle(n); if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') best = { bg: cs.backgroundColor, r: cs.borderRadius, color: cs.color }; n = n.parentElement; }
    return best;
  }, { x: px, y: py });
  out.push({ t: lb, before: before ? before.bg : null, after: after ? after.bg : null, radius: after ? after.r : null, changed: (before && after) ? before.bg !== after.bg : null });
}
R['① 逐项 hover（重取坐标）'] = out;
await page.screenshot({ path: OUT + '/c-hover2.png' });
await page.keyboard.press('Escape'); await page.waitForTimeout(900);

// ② 页面 ⋯ 面板里找禁用项（撤销/重做在无历史时应禁用）
await page.locator('[data-test-id="aside-item-toc"]').filter({ hasText: '归档历史材料' }).first().click({ force: true });
await page.waitForTimeout(4000);
await page.locator('[data-test-id="page-header-more"]').first().click({ force: true });
await page.waitForTimeout(1800);
R['② 页面⋯面板各行状态'] = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.next-modal-dropdown div, .next-modal div').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.height < 26 || r.height > 40 || r.width < 150) return;
    const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
    if (!t || t.length > 16 || e.children.length > 3) return;
    const cs = getComputedStyle(e);
    const parentCs = e.parentElement ? getComputedStyle(e.parentElement) : null;
    out.push({ t, opacity: cs.opacity, pOpacity: parentCs ? parentCs.opacity : null, color: cs.color, pColor: parentCs ? parentCs.color : null, cursor: cs.cursor, pCursor: parentCs ? parentCs.cursor : null });
  });
  const seen = new Set();
  return out.filter((o) => { if (seen.has(o.t)) return false; seen.add(o.t); return true; }).slice(0, 26);
});
await page.screenshot({ path: OUT + '/d-page-menu.png' });
fs.writeFileSync(OUT + '/menu-hover2.json', JSON.stringify(R, null, 1));
console.log('=== 逐项 hover（重取坐标）===');
(R['① 逐项 hover（重取坐标）'] || []).forEach((m) => console.log(`  ${(m.t||'').padEnd(10)} 常态=${String(m.before).padEnd(22)} hover=${String(m.after).padEnd(24)} 圆角=${m.radius} 变化=${m.changed}`));
console.log('=== 页面⋯面板（查禁用）===');
(R['② 页面⋯面板各行状态'] || []).forEach((o) => {
  const flag = (o.opacity !== '1' || (o.pOpacity && o.pOpacity !== '1') || o.cursor === 'default') ? '  ←疑禁用' : '';
  console.log(`  ${o.t.padEnd(12)} op=${o.opacity}/${o.pOpacity} cursor=${o.cursor}/${o.pCursor} color=${o.color}${flag}`);
});
await page.keyboard.press('Escape');
await browser.close();
