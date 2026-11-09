/**
 * 斜杠菜单全量枚举（M0-T22 上半）
 * 建临时页 → 输入 "/" → 滚动菜单逐屏采集 → 汇总全部项与快捷码。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t22';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// 建临时页
await page.locator('[data-test-id="aside-toc-header-create-by-private"]').first().click({ force: true });
await page.waitForTimeout(5000);
const docId = (page.url().match(/([0-9a-f-]{36})\s*$/) || [])[1];
console.log('临时页 docId:', docId);

// 输入 /
await page.mouse.click(900, 300);
await page.waitForTimeout(1000);
await page.keyboard.type('/', { delay: 90 });
await page.waitForTimeout(2500);

const dump = () => page.evaluate(() => {
  const panes = [];
  document.querySelectorAll('.next-modal, [role="menu"], [data-popper-placement]').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 100 || r.height < 60) return;
    const items = [];
    e.querySelectorAll('div,li,[role="menuitem"]').forEach((it) => {
      const ir = it.getBoundingClientRect();
      if (ir.height < 20 || ir.height > 60 || ir.width < 80) return;
      const t = (it.innerText || '').trim().replace(/\s+/g, ' ');
      if (!t || t.length > 30 || it.children.length > 4) return;
      items.push({ t, h: Math.round(ir.height), y: Math.round(ir.y) });
    });
    const seen = new Set();
    panes.push({
      w: Math.round(r.width), h: Math.round(r.height),
      items: items.filter((o) => { if (seen.has(o.t)) return false; seen.add(o.t); return true; }),
    });
  });
  return panes;
});

const screens = [];
for (let i = 0; i < 8; i++) {
  const panes = await dump();
  const pane = panes.sort((a, b) => b.items.length - a.items.length)[0];
  screens.push(pane ? pane.items.map((x) => x.t) : []);
  await page.screenshot({ path: OUT + `/menu-scroll-${i}.png` });
  // 在菜单里滚动
  const r = await page.evaluate(() => {
    const e = document.querySelector('.next-modal, [role="menu"], [data-popper-placement]');
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  if (!r) break;
  await page.mouse.move(r.x, r.y);
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(900);
}

// 汇总去重
const all = [];
const seen = new Set();
screens.forEach((s) => s.forEach((t) => { if (!seen.has(t)) { seen.add(t); all.push(t); } }));
const R = { docId, screens, allItems: all, uniqueCount: all.length };
fs.writeFileSync(OUT + '/slash-menu-all.json', JSON.stringify(R, null, 1));
console.log('采集屏数:', screens.length);
screens.forEach((s, i) => console.log(`  第${i}屏(${s.length}项): ${s.join(' | ')}`));
console.log('去重后共', all.length, '项');
await browser.close();
