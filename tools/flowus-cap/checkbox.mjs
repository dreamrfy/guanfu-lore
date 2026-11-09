/**
 * 待办勾选框三态实测（M0-T20）
 * 用**斜杠菜单**造待办块（不再用 [] 快捷——M0-T17 已被它害过一次，触发了 AI）。
 * 造页 → 采「未勾选 / 已勾选 / hover」三态 → 三步彻底删页。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t20';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

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

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
R['0 建页前侧栏'] = await page.evaluate(() => document.querySelectorAll('[data-test-id="aside-item-toc"]').length);

// ① 建页
await page.locator('[data-test-id="aside-toc-header-create-by-private"]').first().click({ force: true });
await page.waitForTimeout(5000);
const docId = (page.url().match(/([0-9a-f-]{36})\s*$/) || [])[1];
R['1 docId'] = docId;

// ② 斜杠菜单造待办块
await page.mouse.click(900, 300);
await page.waitForTimeout(1000);
await page.keyboard.type('/', { delay: 80 });
await page.waitForTimeout(2200);
await page.screenshot({ path: OUT + '/a-slash-menu.png' });
R['2 斜杠菜单'] = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.next-modal, [role="menu"], [data-popper-placement]').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 100 || r.height < 60) return;
    out.push({ w: Math.round(r.width), h: Math.round(r.height), text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 500) });
  });
  const seen = new Set();
  return out.filter((o) => { const k = o.text.slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; });
});
R['3 点待办'] = await clickText('待办列表');
await page.waitForTimeout(2000);
await page.keyboard.type('待办事项示例', { delay: 30 });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/b-todo-created.png' });

// ③ 采三态
const probeCb = async (label) => {
  R[label] = await page.evaluate(() => {
    const out = [];
    // 找待办块里的可点小方块（宽高 14~24，有边框或背景）
    document.querySelectorAll('div,button,span,input').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 12 || r.width > 26 || r.height < 12 || r.height > 26) return;
      if (r.x < 240) return;
      const cs = getComputedStyle(e);
      out.push({
        tag: e.tagName, w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: Math.round(r.x), y: Math.round(r.y),
        bg: cs.backgroundColor, border: cs.borderWidth + ' ' + cs.borderColor, radius: cs.borderRadius,
        opacity: cs.opacity, cls: String(e.className).slice(0, 70),
        svg: e.querySelector('svg') ? (e.querySelector('svg').getAttribute('data-icon') || 'svg') : null,
        svgFill: e.querySelector('svg path') ? getComputedStyle(e.querySelector('svg path')).fill : null,
      });
    });
    return out.slice(0, 8);
  });
};

await page.mouse.move(5, 5);
await page.waitForTimeout(700);
await probeCb('4 未勾选');
// hover 到方块上
if (R['4 未勾选'].length) {
  const c = R['4 未勾选'][0];
  await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2);
  await page.waitForTimeout(900);
  await probeCb('5 hover');
  await page.screenshot({ path: OUT + '/c-hover.png' });
  await page.mouse.click(c.x + c.w / 2, c.y + c.h / 2);
  await page.waitForTimeout(1800);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(900);
  await probeCb('6 已勾选');
  await page.screenshot({ path: OUT + '/d-checked.png' });
}

fs.writeFileSync(OUT + '/checkbox.json', JSON.stringify(R, null, 1));
console.log('docId:', docId);
console.log('斜杠菜单:', JSON.stringify(R['2 斜杠菜单']).slice(0, 400));
for (const k of ['4 未勾选', '5 hover', '6 已勾选']) {
  console.log('=== ' + k + ' ===');
  (R[k] || []).forEach((c) => console.log(`  ${c.tag} ${c.w}x${c.h} @${c.x},${c.y} bg=${c.bg} border=${c.border} r=${c.radius} svg=${c.svg || '无'} fill=${c.svgFill || '-'} cls=${c.cls}`));
}
await browser.close();
