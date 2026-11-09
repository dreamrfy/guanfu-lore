/**
 * 字段类型 string 对照 —— 机制验证（M0-T26 第一步）
 * 建空页 → 在「空页面类型选择器」点「表格」→ 得到多维表页 → 加一列 → 用中文名 test-id 改类型 → 读接口看 string
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t26';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

const clickText = async (t) => {
  const r = await page.evaluate((txt) => {
    let best = null;
    document.querySelectorAll('div,span,button,li,a').forEach((e) => {
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
const dumpLayers = () => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.next-modal, [role="menu"], [data-popper-placement]').forEach((e) => {
    const b = e.getBoundingClientRect();
    if (b.width < 80 || b.height < 40) return;
    const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
    if (t) out.push({ w: Math.round(b.width), h: Math.round(b.height), text: t.slice(0, 400) });
  });
  const seen = new Set();
  return out.filter((o) => { const k = o.text.slice(0, 90); if (seen.has(k)) return false; seen.add(k); return true; });
});

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
R['0 基线'] = await page.evaluate(() => document.querySelectorAll('[data-test-id="aside-item-toc"]').length);

// ① 建页
await page.locator('[data-test-id="aside-toc-header-create-by-private"]').first().click({ force: true });
await page.waitForTimeout(5500);
R['1 docId'] = (page.url().match(/([0-9a-f-]{36})\s*$/) || [])[1];
await page.screenshot({ path: OUT + '/a-empty-page.png' });
R['2 空页选择器'] = await dumpLayers();
R['3 页面文字'] = await page.evaluate(() => (document.querySelector('.main-panel') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 300));

// ② 点「表格」
R['4 点表格'] = await clickText('表格');
await page.waitForTimeout(5000);
await page.screenshot({ path: OUT + '/b-table-page.png' });
R['5 建表后文字'] = await page.evaluate(() => (document.querySelector('.main-panel') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 300));

const readTypes = () => page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const out = { blocks: Object.keys(bs).length, fields: {}, views: {} };
  Object.values(bs).forEach((b) => {
    const d = b.data || {};
    if (d.schema) Object.entries(d.schema).forEach(([k, f]) => { out.fields[k] = { name: f.name, type: f.type }; });
  });
  const cv = (Object.values(bs).find((b) => b && !b.parentId) || {}).views;
  out.hasViews = !!cv;
  return out;
}, R['1 docId']);
R['6 建表后 schema'] = await readTypes();

fs.writeFileSync(OUT + '/mechanism.json', JSON.stringify(R, null, 1));
console.log('docId:', R['1 docId']);
console.log('空页选择器:', JSON.stringify(R['2 空页选择器']).slice(0, 300));
console.log('页面文字:', R['3 页面文字']);
console.log('点「表格」:', R['4 点表格']);
console.log('建表后文字:', R['5 建表后文字']);
console.log('schema:', JSON.stringify(R['6 建表后 schema']));
await browser.close();
