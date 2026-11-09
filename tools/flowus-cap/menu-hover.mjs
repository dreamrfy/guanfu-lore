/**
 * 菜单项 hover / 禁用态实测（M0-T21）
 * 关键改进：用 document.elementFromPoint(鼠标坐标) 拿"真正在鼠标下的元素"，再向上找承载背景的那层。
 * 上次失败就是因为量了外层无背景的容器。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t21';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// ① 打开侧栏页项 ⋯ 菜单（8 项）
const row = page.locator('[data-test-id="aside-item-toc"]').nth(5);
await row.hover();
await page.waitForTimeout(800);
await row.locator('[data-test-id="aside-item-more"]').first().click({ force: true });
await page.waitForTimeout(1800);
await page.screenshot({ path: OUT + '/a-menu.png' });

// ② 列出菜单项坐标
const items = await page.evaluate(() => {
  const dd = document.querySelector('.next-modal-dropdown');
  if (!dd) return [];
  const out = [];
  dd.querySelectorAll('div,li,[role="menuitem"]').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.height < 26 || r.height > 40 || r.width < 150) return;
    const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
    if (!t || t.length > 20 || e.children.length > 3) return;
    const cs = getComputedStyle(e);
    if (cs.cursor !== 'pointer' && !String(e.className).includes('py-1.5')) return;
    out.push({ t, x: +(r.x + r.width / 2).toFixed(1), y: +(r.y + r.height / 2).toFixed(1), w: Math.round(r.width), h: Math.round(r.height) });
  });
  const seen = new Set();
  return out.filter((o) => { if (seen.has(o.t)) return false; seen.add(o.t); return true; });
});
R['① 菜单项'] = items;

// ③ 逐项 hover，用 elementFromPoint 量真实背景层
const measured = [];
for (const it of items) {
  await page.mouse.move(1400, 600);
  await page.waitForTimeout(400);
  const before = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    let n = el, best = null;
    for (let i = 0; i < 6 && n; i++) {
      const cs = getComputedStyle(n);
      if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') best = { bg: cs.backgroundColor, cls: String(n.className).slice(0, 50), r: cs.borderRadius };
      n = n.parentElement;
    }
    return best;
  }, it);
  await page.mouse.move(it.x, it.y);
  await page.waitForTimeout(600);
  const after = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    let n = el, best = null;
    for (let i = 0; i < 6 && n; i++) {
      const cs = getComputedStyle(n);
      if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') best = { bg: cs.backgroundColor, cls: String(n.className).slice(0, 50), r: cs.borderRadius, color: cs.color };
      n = n.parentElement;
    }
    return best;
  }, it);
  measured.push({ ...it, bgBefore: before ? before.bg : null, bgAfter: after ? after.bg : null, radius: after ? after.r : null, color: after ? after.color : null, changed: (before ? before.bg : null) !== (after ? after.bg : null) });
}
R['② 逐项 hover 结果'] = measured;
await page.screenshot({ path: OUT + '/b-hover.png' });

// ④ 禁用项：扫菜单里所有行，看 opacity / 颜色
R['③ 全部行状态'] = await page.evaluate(() => {
  const dd = document.querySelector('.next-modal-dropdown');
  if (!dd) return [];
  const out = [];
  dd.querySelectorAll('*').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.height < 26 || r.height > 40 || r.width < 150) return;
    const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
    if (!t || t.length > 20 || e.children.length > 3) return;
    const cs = getComputedStyle(e);
    out.push({ t, opacity: cs.opacity, color: cs.color, bg: cs.backgroundColor, cls: String(e.className).slice(0, 60) });
  });
  const seen = new Set();
  return out.filter((o) => { if (seen.has(o.t)) return false; seen.add(o.t); return true; });
});

fs.writeFileSync(OUT + '/menu-hover.json', JSON.stringify(R, null, 1));
console.log('=== 逐项 hover ===');
(measured || []).forEach((m) => console.log(`  ${m.t.padEnd(10)} 常态=${String(m.bgBefore).padEnd(22)} hover=${String(m.bgAfter).padEnd(24)} 圆角=${m.radius} 变化=${m.changed}`));
console.log('=== 全部行（查禁用态）===');
(R['③ 全部行状态'] || []).forEach((o) => console.log(`  ${o.t.padEnd(10)} opacity=${o.opacity} color=${o.color} bg=${o.bg}`));
await page.keyboard.press('Escape');
await browser.close();
