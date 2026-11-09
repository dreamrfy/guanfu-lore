import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:\\dev\\tmp\\flowus-cap\\capture\\m0-t05';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

const styleOf = (el) => {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
    bg: cs.backgroundColor, color: cs.color, radius: cs.borderRadius,
    border: cs.borderWidth + ' ' + cs.borderColor,
    shadow: cs.boxShadow === 'none' ? null : cs.boxShadow,
    padding: cs.padding, font: cs.fontSize + '/' + cs.lineHeight + '/w' + cs.fontWeight,
  };
};

// ---- 1. 弹层面板（空间设置）----
try {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await page.getByText('两相欢的空间', { exact: false }).first().click({ force: true });
  await page.waitForTimeout(1200);
  await page.getByText('空间设置', { exact: true }).first().click({ force: true });
  await page.waitForTimeout(2500);

  R['1 弹层遮罩'] = await page.evaluate(() => {
    const m = document.querySelector('.next-modal-modal');
    if (!m) return { error: '未找到 .next-modal-modal' };
    const cs = getComputedStyle(m);
    const r = m.getBoundingClientRect();
    return { rect: { w: r.width, h: r.height }, bg: cs.backgroundColor, cls: String(m.className).slice(0, 80) };
  });

  R['2 弹层面板'] = await page.evaluate(() => {
    const mask = document.querySelector('.next-modal-modal');
    if (!mask) return { error: 'no mask' };
    // 遮罩的直接子层里，找带白底的那个
    const cands = [];
    mask.querySelectorAll('div').forEach((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      if (r.width > 500 && r.height > 300 && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') cands.push(e);
    });
    const el = cands[0];
    if (!el) return { error: '面板未找到' };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      bg: cs.backgroundColor, radius: cs.borderRadius, padding: cs.padding,
      shadow: cs.boxShadow === 'none' ? null : cs.boxShadow, cls: String(el.className).slice(0, 90),
    };
  });

  // ---- 2. 开关 / 勾选框 ----
  R['3 开关与勾选'] = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const isSwitchLike = r.width >= 28 && r.width <= 56 && r.height >= 16 && r.height <= 30 && cs.borderRadius !== '0px';
      const isBox = r.width >= 14 && r.width <= 22 && r.height >= 14 && r.height <= 22 && cs.borderWidth !== '0px';
      if (!isSwitchLike && !isBox) return;
      if (r.y < 100 || r.x < 600) return;
      out.push({
        kind: isSwitchLike ? 'switch?' : 'box?',
        tag: e.tagName, role: e.getAttribute('role'),
        rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        bg: cs.backgroundColor, radius: cs.borderRadius, border: cs.borderWidth + ' ' + cs.borderColor,
        kids: e.children.length,
      });
    });
    return out.slice(0, 12);
  });
  await page.screenshot({ path: OUT + '\\e1-modal.png' });
} catch (e) { R['1-3'] = { error: e.message.split('\n')[0] }; }

// ---- 3. 侧栏项选中态 + 下拉菜单 ----
try {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  const item = page.locator('[data-test-id="aside-item-toc"]').nth(1);
  await item.click({ force: true });
  await page.waitForTimeout(2500);
  R['4 侧栏页项 · 选中'] = await item.evaluate(styleOf);

  // hover 出 ⋯ 再点开下拉菜单
  await item.hover();
  await page.waitForTimeout(800);
  const row = await item.boundingBox();
  await page.screenshot({ path: OUT + '\\f1-row-hover.png' });
  const btns = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, [role="button"]').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.x > 150 && r.x < 230 && r.y > 100 && r.height >= 16 && r.height <= 32) out.push({ x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), html: e.outerHTML.slice(0, 70) });
    });
    return out;
  });
  R['5 行内操作按钮'] = btns;
  if (btns.length) {
    const b = btns[btns.length - 1];
    await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT + '\\f2-dropdown.png' });
    R['6 下拉菜单'] = await page.evaluate(() => {
      let best = null;
      document.querySelectorAll('div,ul,[role="menu"]').forEach((e) => {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        if (r.width < 120 || r.width > 320 || r.height < 80 || r.height > 500) return;
        if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'rgb(247, 247, 247)') return;
        if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
        if (!best || r.width * r.height > best.area) {
          best = {
            area: r.width * r.height,
            rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
            bg: cs.backgroundColor, radius: cs.borderRadius, padding: cs.padding,
            shadow: cs.boxShadow === 'none' ? null : cs.boxShadow, cls: String(e.className).slice(0, 80),
          };
        }
      });
      return best || { error: '未找到菜单' };
    });
    R['7 菜单项'] = await page.evaluate((menu) => {
      if (!menu || menu.error) return [];
      const box = { x: menu.rect.x, y: menu.rect.y, w: menu.rect.w, h: menu.rect.h };
      const out = [];
      document.querySelectorAll('div').forEach((e) => {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        if (r.x < box.x - 4 || r.x > box.x + box.w || r.y < box.y - 4 || r.y > box.y + box.h) return;
        if (r.height < 24 || r.height > 44 || r.width < box.w * 0.6) return;
        const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
        if (!t || t.length > 20) return;
        out.push({ t, rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, radius: cs.borderRadius, padding: cs.padding, font: cs.fontSize + '/' + cs.lineHeight, color: cs.color });
      });
      return out.slice(0, 16);
    }, R['6 下拉菜单']);
  }
} catch (e) { R['4-7'] = { error: e.message.split('\n')[0] }; }

fs.writeFileSync(OUT + '\\components2.json', JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1));
await page.keyboard.press('Escape');
await browser.close();
