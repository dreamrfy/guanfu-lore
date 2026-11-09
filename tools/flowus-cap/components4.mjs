import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:\\dev\\tmp\\flowus-cap\\capture\\m0-t05';
const R = {};
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];

const boxOf = (e) => {
  const cs = getComputedStyle(e);
  const r = e.getBoundingClientRect();
  return {
    rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
    bg: cs.backgroundColor, radius: cs.borderRadius, padding: cs.padding,
    border: cs.borderWidth + ' ' + cs.borderColor,
    shadow: cs.boxShadow === 'none' ? null : cs.boxShadow,
    pos: cs.position, z: cs.zIndex, cls: String(e.className).slice(0, 70),
    txt: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30),
  };
};

// ---- A. 行内下拉菜单：不做颜色过滤，把所有浮层都列出来 ----
try {
  const row = page.locator('[data-test-id="aside-item-toc"]').nth(5);
  await row.hover();
  await page.waitForTimeout(800);
  await row.locator('[data-test-id="aside-item-more"]').first().click({ force: true });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: OUT + '\\h1-row-menu.png' });
  R['A 浮层候选'] = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach((e) => {
      const cs = getComputedStyle(e);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
      const r = e.getBoundingClientRect();
      if (r.width < 100 || r.width > 420 || r.height < 80 || r.height > 620) return;
      out.push({
        rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        bg: cs.backgroundColor, radius: cs.borderRadius, padding: cs.padding,
        border: cs.borderWidth + ' ' + cs.borderColor,
        shadow: cs.boxShadow === 'none' ? null : cs.boxShadow.slice(0, 70),
        cls: String(e.className).slice(0, 70),
        txt: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      });
    });
    return out.sort((a, b) => a.rect.x - b.rect.x).slice(0, 10);
  });
  // 菜单项：取浮层里高度 28-40 的行
  R['B 菜单项'] = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('div').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.height < 26 || r.height > 40 || r.width < 90 || r.width > 320) return;
      const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
      if (!t || t.length > 22 || e.children.length > 3) return;
      const cs = getComputedStyle(e);
      out.push({ t, y: +r.y.toFixed(1), x: +r.x.toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1), radius: cs.borderRadius, padding: cs.padding, font: cs.fontSize + '/' + cs.lineHeight + '/w' + cs.fontWeight, color: cs.color });
    });
    return out.slice(0, 18);
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
} catch (e) { R['A-B'] = { error: e.message.split('\n')[0] }; }

// ---- C. 输入框 + 勾选框（空间设置里）----
try {
  await page.getByText('两相欢的空间', { exact: false }).first().click({ force: true });
  await page.waitForTimeout(1200);
  await page.getByText('空间设置', { exact: true }).first().click({ force: true });
  await page.waitForTimeout(2500);
  R['C 输入框'] = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input, textarea').forEach((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      if (r.width < 40) return;
      out.push({
        tag: e.tagName, type: e.type, ph: e.placeholder || null,
        rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        bg: cs.backgroundColor, radius: cs.borderRadius, border: cs.borderWidth + ' ' + cs.borderColor,
        padding: cs.padding, font: cs.fontSize + '/' + cs.lineHeight, color: cs.color,
      });
    });
    return out.slice(0, 10);
  });
  R['D 勾选框候选'] = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input[type="checkbox"], [role="checkbox"], .next-checkbox').forEach((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      out.push({ tag: e.tagName, cls: String(e.className).slice(0, 50), rect: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, radius: cs.borderRadius, border: cs.borderWidth + ' ' + cs.borderColor, bg: cs.backgroundColor });
    });
    return out.slice(0, 8);
  });
  await page.screenshot({ path: OUT + '\\h2-modal-full.png' });
} catch (e) { R['C-D'] = { error: e.message.split('\n')[0] }; }

fs.writeFileSync(OUT + '\\components4.json', JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1).slice(0, 6000));
await page.keyboard.press('Escape');
await browser.close();
