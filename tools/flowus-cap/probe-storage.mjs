import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const r = await page.evaluate(() => {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  const themeish = {};
  keys.forEach((k) => { if (/theme|dark|mode|appearance|color|skin/i.test(k)) themeish[k] = String(localStorage.getItem(k)).slice(0, 120); });
  return { count: keys.length, themeish, allKeys: keys.slice(0, 40) };
});
console.log('localStorage 键数:', r.count);
console.log('主题相关键:', JSON.stringify(r.themeish, null, 1));
console.log('全部键名:', r.allKeys.join(', '));
await browser.close();
