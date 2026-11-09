/**
 * 三种视图的 string 实测（M0-T30 第⑦项）
 * 对 画廊/目录/收集表：建空页 → 点空页类型选择器里的该项 → 读 collectionViews[].type → 三步删页。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t30';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = { results: [] };

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
const readViews = (id) => page.evaluate(async (doc) => {
  const j = await (await fetch('/api/docs/' + doc, { headers: { accept: 'application/json' } })).json();
  const cv = (j.data || {}).collectionViews || {};
  return Object.values(cv).map((v) => ({ type: v.type, title: v.title }));
}, id);
const deletePage = async (id) => {
  await page.goto('https://flowus.cn/' + id, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const more = page.locator('[data-test-id="page-header-more"]').first();
  if (await more.count()) { await more.click({ force: true }); await page.waitForTimeout(1600); }
  await clickText('删除');
  await page.waitForTimeout(2000);
  const c1 = await page.evaluate(() => {
    let best = null;
    document.querySelectorAll('button,div,span').forEach((e) => {
      const t = (e.innerText || '').trim();
      if (t !== '确定' && t !== '删除') return;
      const r = e.getBoundingClientRect();
      if (r.width < 20 || r.height < 16) return;
      if (!best) best = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    return best;
  });
  if (c1) { await page.mouse.click(c1.x, c1.y); await page.waitForTimeout(2500); }
  const bar = await page.locator('[data-test-id="delete-bar-delete"]').count();
  if (bar) {
    await page.locator('[data-test-id="delete-bar-delete"]').first().click({ force: true });
    await page.waitForTimeout(2000);
    const c2 = await page.evaluate(() => {
      let best = null;
      document.querySelectorAll('button,div,span').forEach((e) => {
        const t = (e.innerText || '').trim();
        if (t !== '确定' && t !== '删除') return;
        const r = e.getBoundingClientRect();
        if (r.width < 20 || r.height < 16) return;
        if (!best) best = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      return best;
    });
    if (c2) { await page.mouse.click(c2.x, c2.y); await page.waitForTimeout(2500); }
  }
  const left = await page.evaluate(async (doc) => {
    const j = await (await fetch('/api/docs/' + doc, { headers: { accept: 'application/json' } })).json().catch(() => null);
    return Object.keys(((j || {}).data || {}).blocks || {}).length;
  }, id);
  return left;
};

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
R['0 基线'] = await page.evaluate(() => document.querySelectorAll('[data-test-id="aside-item-toc"]').length);
console.log('基线页数:', R['0 基线']);

for (const label of ['画廊', '目录', '收集表']) {
  const step = { label };
  try {
    await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await page.locator('[data-test-id="aside-toc-header-create-by-private"]').first().click({ force: true });
    await page.waitForTimeout(5500);
    const id = (page.url().match(/([0-9a-f-]{36})\s*$/) || [])[1];
    step.docId = id;
    step.clicked = await clickText(label);
    await page.waitForTimeout(5000);
    step.views = await readViews(id);
    await page.screenshot({ path: OUT + '/v-' + label + '.png' });
    step.deletedLeft = await deletePage(id);
    console.log(`${label.padEnd(4)} 点=${step.clicked} 视图=${JSON.stringify(step.views)} 删后块=${step.deletedLeft}`);
  } catch (e) {
    step.err = e.message.split('\n')[0];
    console.log(`${label.padEnd(4)} 出错: ${step.err}`);
  }
  R.results.push(step);
  await page.waitForTimeout(800);
}
R['9 最终基线'] = await page.evaluate(() => document.querySelectorAll('[data-test-id="aside-item-toc"]').length);
fs.writeFileSync(OUT + '/view-strings.json', JSON.stringify(R, null, 1));
console.log('最终侧栏页数:', R['9 最终基线'], '（应与基线', R['0 基线'], '一致）');
await browser.close();
