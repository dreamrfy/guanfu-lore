/**
 * 通用组件规格采集（M0-T05）
 * 抓按钮 / 下拉菜单 / 弹层 / 开关 / 提示条 / 侧栏项多状态的尺寸与样式。
 * 用法：node components.mjs [--out <目录>]
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const oi = process.argv.indexOf('--out');
const OUT = oi > -1 ? process.argv[oi + 1] : 'E:\\dev\\tmp\\flowus-cap\\capture\\m0-t05';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];

const STYLE = (el) => {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
    bg: cs.backgroundColor,
    color: cs.color,
    radius: cs.borderRadius,
    border: cs.borderWidth + ' ' + cs.borderStyle + ' ' + cs.borderColor,
    shadow: cs.boxShadow === 'none' ? null : cs.boxShadow,
    padding: cs.padding,
    margin: cs.margin,
    font: cs.fontSize + ' / ' + cs.lineHeight + ' / w' + cs.fontWeight,
    display: cs.display,
    gap: cs.gap,
    zIndex: cs.zIndex,
    transition: cs.transitionDuration,
  };
};

const results = {};
async function snap(label, locator) {
  try {
    const el = await locator.elementHandle({ timeout: 5000 });
    if (!el) throw new Error('未找到元素');
    results[label] = await el.evaluate(STYLE);
  } catch (e) {
    results[label] = { error: e.message.split('\n')[0] };
  }
}

// ---------- A. 侧栏页项三态 ----------
const pageItem = page.locator('[data-test-id="aside-item-toc"]').nth(1);
try {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  await snap('A1 侧栏页项 · 常态', pageItem);
  await pageItem.hover();
  await page.waitForTimeout(500);
  await snap('A2 侧栏页项 · hover', pageItem);
  await page.screenshot({ path: OUT + '\\a2-sidebar-hover.png' });
} catch (e) { results['A 侧栏页项'] = { error: e.message.split('\n')[0] }; }

// ---------- B. 系统提示条 + 按钮 ----------
try {
  const bar = page.locator('div').filter({ hasText: /^空间容量已用完/ }).first();
  await snap('B1 提示条容器', bar);
  const btn = page.getByText('立即升级', { exact: true }).first();
  await snap('B2 提示条按钮 · 常态', btn);
  await btn.hover();
  await page.waitForTimeout(400);
  await snap('B3 提示条按钮 · hover', btn);
} catch (e) { results['B 提示条'] = { error: e.message.split('\n')[0] }; }

// ---------- C. 空间设置弹层 ----------
try {
  await page.keyboard.press('Escape');
  await page.getByText('空间名', { exact: false }).first().waitFor({ timeout: 3000 }).catch(() => {});
  await page.getByText('两相欢的空间', { exact: false }).first().click({ force: true });
  await page.waitForTimeout(1200);
  await page.getByText('空间设置', { exact: true }).first().click({ force: true });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT + '\\c1-space-settings.png' });

  const modal = await page.evaluate(() => {
    // 找最大的、居中的、带背景和圆角的浮层
    let best = null;
    document.querySelectorAll('div').forEach((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      if (r.width < 300 || r.height < 200) return;
      if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
      if (cs.backgroundColor === 'rgba(0, 0, 0, 0)') return;
      if (!best || r.width * r.height > best.area) {
        best = {
          area: r.width * r.height,
          rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
          bg: cs.backgroundColor, radius: cs.borderRadius, shadow: cs.boxShadow === 'none' ? null : cs.boxShadow,
          padding: cs.padding, zIndex: cs.zIndex, cls: String(e.className).slice(0, 80),
        };
      }
    });
    return best;
  });
  results['C1 弹层容器'] = modal || { error: '没找到浮层' };

  await snap('C2 弹层标题区(空间头像行)', page.getByText('空间头像', { exact: true }).first());
  await snap('C3 设置行-空间名', page.getByText('空间域名', { exact: true }).first());
  await snap('C4 弹层按钮-保存', page.getByText('保存', { exact: true }).first());
  await snap('C5 弹层按钮-取消', page.getByText('取消', { exact: true }).first());
  await snap('C6 只读标签-免费版', page.getByText('免费版', { exact: true }).first());

  // 开关（分享页通知提醒 右侧）
  const sw = await page.evaluate(() => {
    const cands = [];
    document.querySelectorAll('[role="switch"], input[type="checkbox"], button').forEach((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      if (r.width >= 24 && r.width <= 80 && r.height >= 14 && r.height <= 40) {
        cands.push({ tag: e.tagName, role: e.getAttribute('role'), rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, bg: cs.backgroundColor, radius: cs.borderRadius, border: cs.borderColor });
      }
    });
    return cands.slice(0, 10);
  });
  results['C7 开关候选'] = sw;
} catch (e) { results['C 弹层'] = { error: e.message.split('\n')[0] }; }

// ---------- D. 顶部工具条 + 下拉菜单 ----------
try {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT + '\\d0-before-menu.png' });

  // 右上角 ⋯：在 x>1800, y<48 范围内
  const dots = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.y >= 4 && r.y <= 44 && r.x >= 1750 && r.width >= 20 && r.width <= 40) {
        out.push({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    return out;
  });
  results['D0 右上角候选'] = dots;
  if (dots.length) {
    const d = dots[Math.floor(dots.length / 2)];
    await page.mouse.click(d.x + d.w / 2, d.y + d.h / 2);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT + '\\d1-menu.png' });
    const menu = await page.evaluate(() => {
      let best = null;
      document.querySelectorAll('div,ul').forEach((e) => {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        if (r.width < 80 || r.width > 400 || r.height < 60) return;
        if (cs.backgroundColor === 'rgba(0, 0, 0, 0)') return;
        if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
        if (!best || r.height * r.width > best.area) {
          best = { area: r.width * r.height, rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, bg: cs.backgroundColor, radius: cs.borderRadius, shadow: cs.boxShadow === 'none' ? null : cs.boxShadow, padding: cs.padding, cls: String(e.className).slice(0, 70) };
        }
      });
      return best;
    });
    results['D1 下拉菜单容器'] = menu || { error: '没找到菜单' };
    // 菜单项（找菜单里高度一致的行）
    const items = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('div').forEach((e) => {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        if (r.height >= 24 && r.height <= 44 && r.width >= 100 && r.width <= 360 && r.x > 800) {
          const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
          if (t && t.length < 24 && e.children.length <= 3) {
            out.push({ t, rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, radius: cs.borderRadius, padding: cs.padding, font: cs.fontSize + '/' + cs.lineHeight, color: cs.color });
          }
        }
      });
      return out.slice(0, 14);
    });
    results['D2 菜单项'] = items;
  }
} catch (e) { results['D 菜单'] = { error: e.message.split('\n')[0] }; }

fs.writeFileSync(OUT + '\\components.json', JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1));
console.log('\n已写出:', OUT + '\\components.json');
await page.keyboard.press('Escape');
await browser.close();
