import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t06';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/m1-state.png' });
R['1 URL'] = page.url();

// 空页面类型选择器：抓所有可见文字行 + 尺寸
R['2 空页类型选择器'] = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('div,li,a,button').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 60 || r.width > 760 || r.height < 20 || r.height > 60) return;
    const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
    if (!t || t.length > 16 || e.children.length > 3) return;
    const cs = getComputedStyle(e);
    out.push({ t, rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, radius: cs.borderRadius, font: cs.fontSize + '/' + cs.lineHeight + '/w' + cs.fontWeight, color: cs.color, bg: cs.backgroundColor });
  });
  const seen = new Set();
  return out.filter((x) => !seen.has(x.t + x.rect.x + x.rect.y) && seen.add(x.t + x.rect.x + x.rect.y)).slice(0, 40);
});

// 提示行文案
R['3 提示行'] = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('*').forEach((e) => {
    const t = (e.innerText || '').trim();
    if (t === '按回车开始编辑，或从下方选择页面类型' && e.children.length === 0) {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      out.push({ t, rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, font: cs.fontSize + '/' + cs.lineHeight + '/w' + cs.fontWeight, color: cs.color });
    }
  });
  return out;
});

// 彻底删除（可能弹确认）
try {
  const before = await page.locator('[data-test-id="delete-bar-delete"]').count();
  R['4 删除前条数'] = before;
  if (before) {
    await page.locator('[data-test-id="delete-bar-delete"]').first().click({ force: true });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: OUT + '/m2-after-deleteclick.png' });
    const dlgs = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.next-modal-modal, [role="dialog"], .next-modal').forEach((e) => {
        const r = e.getBoundingClientRect();
        out.push({ cls: String(e.className).slice(0, 60), w: Math.round(r.width), h: Math.round(r.height), text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120) });
      });
      return out;
    });
    R['5 点击后弹层'] = dlgs;
    // 若有确认框，点其中的红色按钮
    if (dlgs.some((d) => /删除|确认/.test(d.text))) {
      const btn = page.getByText('删除', { exact: true }).last();
      await btn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000);
      R['5b'] = '已点确认';
    }
  }
  await page.waitForTimeout(1500);
  R['6 删除后横幅还在?'] = await page.locator('[data-test-id="delete-bar-delete"]').count();
  R['7 删除后 URL'] = page.url();
} catch (e) { R['4-7'] = { error: e.message.split('\n')[0] }; }

fs.writeFileSync(OUT + '/emptystate.json', JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1).slice(0, 5000));
await browser.close();
