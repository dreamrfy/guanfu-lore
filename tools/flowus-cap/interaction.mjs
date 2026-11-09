/**
 * 交互行为规格采集（M0-T07）
 * 抓：过渡/动画的时长与缓动、hover 才出现的元素、右键菜单有无。
 * 安全：绝不点击 *create* 类元素（会真的建页）。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t07';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// ---- 1. 过渡与动画（全量去重统计）----
R['1 过渡统计'] = await page.evaluate(() => {
  const groups = {};
  document.querySelectorAll('*').forEach((e) => {
    const cs = getComputedStyle(e);
    const d = cs.transitionDuration;
    const p = cs.transitionProperty;
    const tf = cs.transitionTimingFunction;
    if (!d || d === '0s') return;
    const key = `${p} | ${d} | ${tf}`;
    groups[key] = (groups[key] || 0) + 1;
  });
  return Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, n]) => ({ k, n }));
});

R['2 动画统计'] = await page.evaluate(() => {
  const groups = {};
  document.querySelectorAll('*').forEach((e) => {
    const cs = getComputedStyle(e);
    if (!cs.animationName || cs.animationName === 'none') return;
    const key = `${cs.animationName} | ${cs.animationDuration} | ${cs.animationTimingFunction}`;
    groups[key] = (groups[key] || 0) + 1;
  });
  return Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, n]) => ({ k, n }));
});

// ---- 3. @keyframes 名字 ----
R['3 keyframes'] = await page.evaluate(() => {
  const names = new Set();
  for (const sheet of document.styleSheets) {
    try {
      for (const r of sheet.cssRules) {
        if (r.type === CSSRule.KEYFRAMES_RULE) names.add(r.name);
      }
    } catch (e) { /* 跨域 */ }
  }
  return [...names].slice(0, 40);
});

// ---- 4. hover 才出现的元素（group-hover 模式）----
R['4 hover 才出现的元素'] = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('*').forEach((e) => {
    const c = String(e.className || '');
    if (!/group-hover:|hover:/.test(c)) return;
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    out.push({
      cls: c.slice(0, 110),
      testId: e.getAttribute('data-test-id'),
      nowVisible: r.width > 0 && r.height > 0,
      display: cs.display, opacity: cs.opacity, visibility: cs.visibility,
      rect: { w: Math.round(r.width), h: Math.round(r.height) },
    });
  });
  const seen = new Set();
  return out.filter((x) => { const k = x.cls + x.testId; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 25);
});

// ---- 5. 右键行为测试（侧栏页项 / 正文区）----
try {
  const row = page.locator('[data-test-id="aside-item-toc"]').nth(5);
  const box = await row.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT + '/p1-rightclick-sidebar.png' });
    R['5 侧栏右键'] = await page.evaluate(() => {
      const dd = document.querySelector('.next-modal-dropdown, [role="menu"]');
      return dd
        ? { opened: true, text: (dd.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 200) }
        : { opened: false, note: '未出现菜单' };
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
} catch (e) { R['5 侧栏右键'] = { error: e.message.split('\n')[0] }; }

// ---- 6. 正文区 hover 出块手柄 ----
try {
  const mid = await page.evaluate(() => {
    const el = document.querySelector('.next-space-page-content') || document.querySelector('.main-panel');
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + 200 };
  });
  await page.mouse.move(mid.x, mid.y);
  await page.waitForTimeout(900);
  await page.screenshot({ path: OUT + '/p2-hover-content.png' });
  R['6 正文 hover 出现的元素'] = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      if (r.width < 8 || r.width > 60 || r.height < 8 || r.height > 60) return;
      if (cs.opacity === '0') return;
      if (r.x > 200 && r.x < 730 && r.y > 90) {
        out.push({ tag: e.tagName, cls: String(e.className).slice(0, 70), testId: e.getAttribute('data-test-id'), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, opacity: cs.opacity });
      }
    });
    return out.slice(0, 12);
  });
} catch (e) { R['6'] = { error: e.message.split('\n')[0] }; }

fs.writeFileSync(OUT + '/interaction.json', JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1).slice(0, 7000));
await browser.close();
