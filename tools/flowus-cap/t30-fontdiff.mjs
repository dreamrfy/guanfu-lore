/**
 * 16/24 vs 16/26 成因排查（M0-T30 第②项）
 * 对比两页的「页面字体」与「页面布局」设置，看是否不同。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t30';
fs.mkdirSync(OUT, { recursive: true });
const DOCS = [
  { id: '8c1a13be-007d-4250-9c30-ecf7723fbfba', label: '归档历史材料(16/24)' },
  { id: '11572688-3c81-4054-a204-37f948284708', label: '账号(16/26)' },
];
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4500);

for (const d of DOCS) {
  await page.goto('https://flowus.cn/' + d.id, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.keyboard.press('Escape');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(900);
  const more = page.locator('[data-test-id="page-header-more"]').first();
  if (await more.count()) { await more.click({ force: true }); await page.waitForTimeout(1800); }
  // 抓菜单里"字体/布局"相关片段 + 勾选项
  const info = await page.evaluate(() => {
    const pane = document.querySelector('.next-modal-dropdown') || document.querySelector('.next-modal');
    const text = pane ? pane.innerText.replace(/\s+/g, ' ').slice(0, 600) : '';
    // 找带勾的项（SVG data-icon=IcCheck 或 aria-checked）
    const checked = [];
    if (pane) {
      pane.querySelectorAll('*').forEach((e) => {
        const svg = e.querySelector(':scope > svg');
        if (!svg) return;
        const icon = svg.getAttribute('data-icon') || svg.getAttribute('class') || '';
        if (!/check|Check|checkmark/i.test(String(icon))) return;
        const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
        if (t && t.length < 20) checked.push(t);
      });
    }
    return { text, checked };
  });
  R[d.label] = info;
  console.log('=== ' + d.label + ' ===');
  console.log('  勾选项:', JSON.stringify(info.checked));
  console.log('  菜单片段:', info.text.slice(0, 260));
  await page.screenshot({ path: OUT + '/font-' + d.id.slice(0, 8) + '.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
}
fs.writeFileSync(OUT + '/font-layout.json', JSON.stringify(R, null, 1));
await browser.close();
