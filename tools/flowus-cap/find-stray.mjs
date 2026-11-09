import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t22';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
await page.getByText('查看更多', { exact: false }).first().click({ force: true }).catch(() => {});
await page.waitForTimeout(2000);

// 逐个页面对照：标题 + 创建时间
const info = await page.evaluate(async () => {
  const rows = Array.from(document.querySelectorAll('[data-test-id="aside-item-toc"]'));
  const out = [];
  for (const r of rows) {
    const id = (r.getAttribute('href') || '').replace(/^\//, '');
    const name = (r.innerText || '').trim();
    if (!/^[0-9a-f-]{36}$/.test(id)) continue;
    try {
      const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
      const bs = (j.data || {}).blocks || {};
      const root = Object.values(bs).find((b) => b && !b.parentId) || Object.values(bs)[0];
      out.push({ id, name, blocks: Object.keys(bs).length, createdAt: root ? root.createdAt : null, parentId: root ? root.parentId : null, status: root ? root.status : null });
    } catch (e) { out.push({ id, name, err: 1 }); }
  }
  return out;
});
console.log('侧栏页数:', info.length);
info.forEach((x) => {
  const t = x.createdAt ? new Date(x.createdAt).toLocaleString('zh-CN', { hour12: false }) : '-';
  console.log(`  ${(x.name || '').padEnd(12)} ${x.id.slice(0, 8)} 块=${String(x.blocks).padStart(3)} 建于=${t}`);
});
// 找今天新建的「无标题」
const today = new Date();
const stray = info.filter((x) => {
  if (!x.createdAt) return false;
  const d = new Date(x.createdAt);
  return x.name === '无标题' && d.toDateString() === today.toDateString();
});
console.log('\n今天新建的「无标题」候选:', stray.map((s) => s.id + '(' + s.id.slice(0, 8) + ')').join(', ') || '无');
fs.writeFileSync(OUT + '/sidebar-check.json', JSON.stringify({ info, stray }, null, 1));
await browser.close();
