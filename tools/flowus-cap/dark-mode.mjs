/**
 * 深色主题存在性判定（M0-T14）
 * 不靠点菜单猜，直接查三处硬证据：
 *  ① CSS 里有没有 .dark / [data-theme] / prefers-color-scheme 这类深色选择器
 *  ② JS 包里有没有"深色/暗色/主题"相关字符串
 *  ③ 运行时有没有主题开关的注册痕迹（localStorage / 根节点属性 / media query）
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

const R = {};

// ---- ① CSS 深色选择器扫描 ----
R['1 CSS 深色选择器'] = await page.evaluate(() => {
  const hits = { darkClass: [], dataTheme: [], prefersDark: [], themeVar: [] };
  let totalRules = 0, scanned = 0, blocked = 0;
  const scan = (rules) => {
    if (!rules) return;
    for (const r of rules) {
      totalRules++;
      const sel = r.selectorText || '';
      if (/\.dark\b|\.dark-|dark:/i.test(sel)) hits.darkClass.push(sel.slice(0, 120));
      if (/\[data-theme|\[theme=/i.test(sel)) hits.dataTheme.push(sel.slice(0, 120));
      if (r.media && /prefers-color-scheme/i.test(r.media.mediaText)) hits.prefersDark.push(r.media.mediaText.slice(0, 100));
      if (r.cssRules) scan(r.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try { scan(sheet.cssRules); scanned++; } catch (e) { blocked++; }
  }
  hits.darkClass = [...new Set(hits.darkClass)].slice(0, 12);
  hits.dataTheme = [...new Set(hits.dataTheme)].slice(0, 12);
  hits.prefersDark = [...new Set(hits.prefersDark)].slice(0, 8);
  return { ...hits, sheetsScanned: scanned, sheetsBlocked: blocked, totalRules };
});

// ---- ③ 运行时痕迹 ----
R['2 运行时'] = await page.evaluate(() => ({
  htmlClass: document.documentElement.className,
  htmlAttrs: Array.from(document.documentElement.attributes).map((a) => a.name + '=' + a.value).slice(0, 10),
  bodyClass: document.body.className || '(空)',
  colorScheme: getComputedStyle(document.documentElement).colorScheme,
  supportsDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  localStorageKeys: (() => { const k = []; for (let i = 0; i < localStorage.length; i++) k.push(localStorage.key(i)); return k; })(),
}));

// ---- ② JS 包关键词扫描 ----
R['3 JS 关键词'] = await page.evaluate(async () => {
  const kws = ['深色模式', '深色主题', '暗色', '夜间模式', '浅色模式', '切换主题', '主题色', 'darkMode', 'dark_mode', 'colorScheme', 'themeMode', 'setTheme'];
  const out = {};
  const scripts = Array.from(document.querySelectorAll('script[src]')).map((s) => s.src).filter((s) => s.startsWith(location.origin));
  out.scriptCount = scripts.length;
  for (const kw of kws) out[kw] = 0;
  let fetched = 0, failed = 0;
  for (const src of scripts.slice(0, 40)) {
    try {
      const t = await (await fetch(src)).text();
      fetched++;
      for (const kw of kws) { if (t.includes(kw)) out[kw]++; }
    } catch (e) { failed++; }
  }
  out.fetched = fetched; out.failed = failed;
  return out;
});

// ---- 顺手：头像菜单（个人设置）全文，确认有没有外观项 ----
try {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await page.mouse.click(53 + 16, 54 + 16);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: OUT + '/a1-avatar-menu.png' });
  R['4 头像菜单'] = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, ' ');
    const m = t.match(/(\{[^}]{0,10}\}|主题|外观|深色|浅色|夜间)[^ ]{0,10}/g);
    return { hasThemeWord: /主题|外观|深色|浅色|夜间/.test(t), matches: m ? [...new Set(m)].slice(0, 8) : [], snippet: t.slice(0, 300) };
  });
  await page.keyboard.press('Escape');
} catch (e) { R['4'] = { error: e.message.split('\n')[0] }; }

fs.writeFileSync(OUT + '/dark-mode-probe.json', JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1).slice(0, 3500));
await browser.close();
