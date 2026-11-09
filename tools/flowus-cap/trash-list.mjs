import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t06';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4500);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// 点侧栏底部「回收站」
await page.getByText('回收站', { exact: true }).first().click({ force: true });
await page.waitForTimeout(3500);
await page.screenshot({ path: OUT + '/n1-trash.png' });

const r = await page.evaluate(() => {
  const rows = [];
  document.querySelectorAll('[data-test-id="trash-item-restore"], [data-test-id="trash-item-delete"]').forEach((e) => {
    const rr = e.closest('div[class*="flex"]') || e.parentElement;
    const t = (rr ? rr.innerText : '').trim().replace(/\s+/g, ' ').slice(0, 60);
    rows.push({ btn: e.getAttribute('data-test-id'), text: t });
  });
  return {
    url: location.href,
    title: document.title,
    mainText: (document.querySelector('.main-panel') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 700),
    trashRows: rows,
    testIds: Array.from(new Set(Array.from(document.querySelectorAll('[data-test-id]')).map((e) => e.getAttribute('data-test-id')))),
  };
});
console.log('URL:', r.url);
console.log('TITLE:', r.title);
console.log('--- 主区文字 ---');
console.log(r.mainText);
console.log('--- 回收站行 ---');
console.log(JSON.stringify(r.trashRows, null, 1));
console.log('--- test-ids ---');
console.log(r.testIds.join(', '));
await browser.close();
