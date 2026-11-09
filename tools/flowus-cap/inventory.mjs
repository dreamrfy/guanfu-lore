/**
 * 界面清单枚举（M0-T06）
 * 把当前页面上所有可点入口 / 浮层类名 / data-test-id 全量抓下来，给"界面清单"做实证底稿。
 * 用法：node inventory.mjs [--out <json>]
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const oi = process.argv.indexOf('--out');
const OUT = oi > -1 ? process.argv[oi + 1] : 'E:/dev/tmp/flowus-cap/capture/m0-t06/inventory.json';
fs.mkdirSync(OUT.replace(/[/\\][^/\\]+$/, ''), { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

const data = await page.evaluate(() => {
  const testIds = {};
  document.querySelectorAll('[data-test-id]').forEach((e) => {
    const id = e.getAttribute('data-test-id');
    const r = e.getBoundingClientRect();
    testIds[id] = testIds[id] || { count: 0, sample: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 24), visible: false };
    testIds[id].count++;
    if (r.width > 0 && r.height > 0) testIds[id].visible = true;
  });

  // 浮层/弹层类名前缀统计
  const layerCls = {};
  document.querySelectorAll('*').forEach((e) => {
    const c = String(e.className || '');
    if (!c) return;
    c.split(/\s+/).forEach((t) => {
      if (/^(next-|lucide$)/.test(t) || /modal|dropdown|popover|tooltip|dialog|menu|drawer|sheet/i.test(t)) {
        layerCls[t] = (layerCls[t] || 0) + 1;
      }
    });
  });

  // 侧栏里所有可见文字项（按 y 排序）
  const side = [];
  document.querySelectorAll('#root *, body > div *').forEach(() => {});
  document.querySelectorAll('[data-test-id^="aside"]').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 10) return;
    const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
    if (t && t.length < 30) side.push({ t, y: Math.round(r.y), id: e.getAttribute('data-test-id') });
  });
  side.sort((a, b) => a.y - b.y);

  // 顶栏可点元素
  const top = [];
  document.querySelectorAll('*').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.y >= 0 && r.y <= 48 && r.x >= 228 && r.width >= 16 && r.width <= 120 && r.height >= 16 && r.height <= 48) {
      const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
      const al = e.getAttribute('aria-label');
      if (t || al) top.push({ t: t.slice(0, 20), aria: al, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
    }
  });

  return {
    url: location.href,
    title: document.title,
    testIds,
    layerClasses: Object.entries(layerCls).sort((a, b) => b[1] - a[1]).slice(0, 40),
    sidebar: side.slice(0, 40),
    topbar: top.slice(0, 20),
  };
});

fs.writeFileSync(OUT, JSON.stringify(data, null, 1));
console.log('页面:', data.title, '|', data.url);
console.log('=== data-test-id 全量（' + Object.keys(data.testIds).length + ' 个）===');
Object.entries(data.testIds).sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, v]) =>
  console.log('  ' + (v.visible ? '可见' : '隐藏') + ' x' + String(v.count).padStart(2) + '  ' + k.padEnd(38) + (v.sample || ''))
);
console.log('=== 浮层/组件类名 ===');
data.layerClasses.forEach(([k, n]) => console.log('  ' + String(n).padStart(3) + '  ' + k));
console.log('=== 侧栏文字项 ===');
data.sidebar.forEach((s) => console.log('  y=' + String(s.y).padStart(4) + '  ' + (s.t || '(空)').padEnd(14) + ' ' + (s.id || '')));
console.log('=== 顶栏元素 ===');
data.topbar.forEach((t) => console.log('  x=' + t.x + ' ' + t.w + 'x' + t.h + '  ' + (t.t || t.aria || '(无字)')));
console.log('\n已写出:', OUT);
await browser.close();
