/**
 * 深色主题决定性测试（M0-T14）
 * 用 CDP 模拟系统深色偏好（prefers-color-scheme: dark），对比关键元素的颜色是否改变。
 * 这是判定"该端有没有深色主题"的唯一硬证据：CSS 有媒体查询 ≠ 真的换肤。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t14';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// 采一组"肤色探针"：侧栏底、内容底、正文色、边框色
const probe = () => page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { bg: cs.backgroundColor, color: cs.color, border: cs.borderColor, w: Math.round(r.width) };
  };
  const aside = pick('.aside') || pick('[class*="aside"]');
  const sidebarEl = Array.from(document.querySelectorAll('div')).find((e) => {
    const r = e.getBoundingClientRect();
    return r.x === 0 && Math.round(r.width) === 228;
  });
  const cs = sidebarEl ? getComputedStyle(sidebarEl) : null;
  const rootCs = getComputedStyle(document.documentElement);
  const bodyCs = getComputedStyle(document.body);
  return {
    sidebar: cs ? { bg: cs.backgroundColor, border: cs.borderColor } : null,
    bodyBg: bodyCs.backgroundColor,
    bodyColor: bodyCs.color,
    rootColorScheme: rootCs.colorScheme,
    htmlClass: document.documentElement.className,
    prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    aside,
  };
});

const R = {};
R['1 浅色（默认）'] = await probe();
await page.screenshot({ path: OUT + '/b1-light.png' });

// 模拟系统深色
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await page.waitForTimeout(2500);
R['2 模拟系统深色后'] = await probe();
await page.screenshot({ path: OUT + '/b2-emulated-dark.png' });

// 变化判定
const a = R['1 浅色（默认）'], b = R['2 模拟系统深色后'];
const diff = {
  prefersDarkChanged: a.prefersDark !== b.prefersDark,
  bodyBgChanged: a.bodyBg !== b.bodyBg,
  bodyColorChanged: a.bodyColor !== b.bodyColor,
  sidebarBgChanged: (a.sidebar && b.sidebar) ? a.sidebar.bg !== b.sidebar.bg : null,
  htmlClassChanged: a.htmlClass !== b.htmlClass,
};
R['3 差异'] = diff;

// 恢复
await cdp.send('Emulation.setEmulatedMedia', { features: [] });
await page.waitForTimeout(1200);
R['4 恢复后'] = await probe();

fs.writeFileSync(OUT + '/dark-decisive.json', JSON.stringify(R, null, 1));
console.log('浅色:', JSON.stringify(a.sidebar), '| prefersDark=' + a.prefersDark, '| bodyBg=' + a.bodyBg);
console.log('模拟深色:', JSON.stringify(b.sidebar), '| prefersDark=' + b.prefersDark, '| bodyBg=' + b.bodyBg);
console.log('差异:', JSON.stringify(diff));
console.log('结论:', (diff.bodyBgChanged || diff.sidebarBgChanged || diff.bodyColorChanged || diff.htmlClassChanged)
  ? '★ 有反应 → 存在深色主题（系统驱动）'
  : '✗ 完全无反应 → 该端没有深色主题');
await browser.close();
