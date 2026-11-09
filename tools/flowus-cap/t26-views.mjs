import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t26';
const DOC = '2ba0f24d-6108-4a8c-87d1-740a00fc6979';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};
await page.goto('https://flowus.cn/' + DOC, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6500);
await page.keyboard.press('Escape');
await page.waitForTimeout(900);

const readViews = () => page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const d = (j.data || {});
  const cv = d.collectionViews || {};
  return Object.values(cv).map((v) => ({ type: v.type, title: v.title }));
}, DOC);

R['0 初始视图'] = await readViews();
console.log('初始视图:', JSON.stringify(R['0 初始视图']));

// 视图栏里找「创建」
const btn = await page.evaluate(() => {
  let best = null;
  document.querySelectorAll('div,span,button').forEach((e) => {
    if ((e.innerText || '').trim() !== '创建') return;
    const r = e.getBoundingClientRect();
    if (r.width < 8 || r.y > 400) return;
    if (!best || r.width * r.height < best.w * best.h) best = { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  return best;
});
R['1 找到创建按钮'] = !!btn;
if (btn) {
  await page.mouse.click(btn.x + btn.w / 2, btn.y + btn.h / 2);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: OUT + '/d-view-create.png' });
  R['2 创建菜单'] = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.next-modal, [role="menu"], [data-popper-placement]').forEach((e) => {
      const b = e.getBoundingClientRect();
      if (b.width < 80 || b.height < 40) return;
      const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
      if (t) out.push({ w: Math.round(b.width), h: Math.round(b.height), text: t.slice(0, 300) });
    });
    const seen = new Set();
    return out.filter((o) => { const k = o.text.slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; });
  });
  // 尝试点「画廊」
  for (const label of ['画廊', '目录', '收集表']) {
    const r = await page.evaluate((t) => {
      let best = null;
      document.querySelectorAll('div,span,button,li').forEach((e) => {
        if ((e.innerText || '').trim() !== t) return;
        const b = e.getBoundingClientRect();
        if (b.width < 8 || b.height < 8) return;
        if (!best || b.width * b.height < best.w * best.h) best = { x: b.x, y: b.y, w: b.width, h: b.height };
      });
      return best;
    }, label);
    if (!r) { R['3-' + label] = '未找到'; continue; }
    await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
    await page.waitForTimeout(2500);
    R['3-' + label] = await readViews();
    // 重开创建菜单
    if (btn) { await page.mouse.click(btn.x + btn.w / 2, btn.y + btn.h / 2); await page.waitForTimeout(1600); }
  }
}
R['9 最终视图'] = await readViews();
fs.writeFileSync(OUT + '/view-types.json', JSON.stringify(R, null, 1));
console.log('创建菜单:', JSON.stringify(R['2 创建菜单']).slice(0, 400));
console.log('最终视图:', JSON.stringify(R['9 最终视图']));
await browser.close();
