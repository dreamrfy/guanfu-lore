/**
 * 剩余组件状态补采（M0-T16）
 * 覆盖：侧栏页项「选中态」（与 hover 干净分离）、菜单项 hover/禁用态、
 *       块手柄与「添加评论」的位置与触发区间、键盘焦点环。
 * 安全：只点查看类元素，绝不点 *create* / *delete*。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t16';
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
    outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor,
    boxShadow: cs.boxShadow === 'none' ? null : cs.boxShadow.slice(0, 70),
    opacity: cs.opacity, cursor: cs.cursor,
  };
};

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// ---------- ① 侧栏页项：常态 / hover / 选中（干净分离） ----------
const item = page.locator('[data-test-id="aside-item-toc"]').nth(1);
await page.mouse.move(1400, 500); // 先离开侧栏
await page.waitForTimeout(600);
R['①1 常态'] = await item.evaluate(styleOf);
await item.hover();
await page.waitForTimeout(700);
R['①2 hover'] = await item.evaluate(styleOf);

// 选中态：点一下，然后把鼠标移开再量（这是上次没做干净的一步）
await item.click({ force: true });
await page.waitForTimeout(3500);
await page.mouse.move(1400, 500);
await page.waitForTimeout(1200);
R['①3 选中·鼠标已移开'] = await item.evaluate(styleOf);
// 再取一个"未选中"的做对照
const other = page.locator('[data-test-id="aside-item-toc"]').nth(3);
R['①4 未选中对照'] = await other.evaluate(styleOf);
await page.screenshot({ path: OUT + '/a-sidebar-selected.png' });

// ---------- ② 菜单项 hover / 禁用态 ----------
try {
  await item.hover();
  await page.waitForTimeout(900);
  await item.locator('[data-test-id="aside-item-more"]').first().click({ force: true });
  await page.waitForTimeout(1800);
  const items = await page.evaluate(() => {
    const dd = document.querySelector('.next-modal-dropdown');
    if (!dd) return null;
    const out = [];
    dd.querySelectorAll('div,li,button,a').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.height < 26 || r.height > 40 || r.width < 150) return;
      const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
      if (!t || t.length > 20 || e.children.length > 3) return;
      const cs = getComputedStyle(e);
      out.push({
        t, x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        bg: cs.backgroundColor, color: cs.color, radius: cs.borderRadius,
        opacity: cs.opacity, cursor: cs.cursor,
        cls: String(e.className).slice(0, 60),
      });
    });
    return out.slice(0, 12);
  });
  R['②1 菜单项（常态全量）'] = items;
  if (items && items.length) {
    // hover 第二项
    await page.mouse.move(items[1].x + 40, items[1].y + items[1].h / 2);
    await page.waitForTimeout(900);
    R['②2 菜单项 hover'] = await page.evaluate((y) => {
      let found = null;
      document.querySelectorAll('.next-modal-dropdown div, .next-modal-dropdown li').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (Math.abs(r.y - y) < 3 && r.height > 26 && r.height < 40) {
          const cs = getComputedStyle(e);
          found = { y: +r.y.toFixed(1), bg: cs.backgroundColor, color: cs.color, radius: cs.borderRadius, cls: String(e.className).slice(0, 60) };
        }
      });
      return found;
    }, items[1].y);
    await page.screenshot({ path: OUT + '/b-menu-hover.png' });
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
} catch (e) { R['②'] = { error: e.message.split('\n')[0] }; }

// ---------- ③ 块手柄 / 添加评论：扫 hover 触发区间 ----------
try {
  await page.locator('[data-test-id="aside-item-toc"]').filter({ hasText: '归档历史材料' }).first().click({ force: true });
  await page.waitForTimeout(4000);
  const col = await page.evaluate(() => {
    // 找内容列左边界
    let best = null;
    document.querySelectorAll('*').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.y > 150 && r.y < 400 && r.width > 600 && r.width < 800 && (!best || r.width < best.w)) best = { x: Math.round(r.x), w: Math.round(r.width), y: Math.round(r.y) };
    });
    return best;
  });
  R['③0 内容列'] = col;
  const probes = [];
  if (col) {
    for (const dx of [-60, -40, -24, -12, 0, 12, 24]) {
      const x = col.x + dx;
      await page.mouse.move(x, col.y + 120);
      await page.waitForTimeout(800);
      const seen = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('svg,button,[role="button"]').forEach((e) => {
          const r = e.getBoundingClientRect();
          if (r.width < 8 || r.width > 48 || r.height < 8 || r.height > 48) return;
          if (r.x < 600 || r.x > 760) return;
          const cs = getComputedStyle(e);
          if (cs.opacity === '0' || cs.visibility === 'hidden') return;
          out.push({ tag: e.tagName, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), icon: e.getAttribute('data-icon'), cls: String(e.className).slice(0, 46) });
        });
        return out.slice(0, 5);
      });
      probes.push({ dx, x: Math.round(x), seenCount: seen.length, seen });
    }
  }
  R['③1 hover 扫描（内容列左缘 ±）'] = probes;
  await page.screenshot({ path: OUT + '/c-block-hover.png' });
} catch (e) { R['③'] = { error: e.message.split('\n')[0] }; }

// ---------- ④ 键盘焦点环 ----------
try {
  await page.mouse.move(1400, 600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const rings = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return {
        tag: el.tagName, testId: el.getAttribute('data-test-id'),
        outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor,
        boxShadow: cs.boxShadow === 'none' ? null : cs.boxShadow.slice(0, 60),
        radius: cs.borderRadius,
        rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
      };
    });
    if (r) rings.push(r);
  }
  R['④ 焦点环序列'] = rings;
  await page.screenshot({ path: OUT + '/d-focus-ring.png' });
} catch (e) { R['④'] = { error: e.message.split('\n')[0] }; }

fs.writeFileSync(OUT + '/states.json', JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1).slice(0, 5000));
await browser.close();
