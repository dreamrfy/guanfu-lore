import { chromium } from 'playwright-core';
import fs from 'node:fs';

const OUT = 'E:\\dev\\tmp\\flowus-cap';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}\\07-relaunch-check.png` });

const t = (await page.evaluate(() => document.body.innerText)).slice(0, 800);
console.log('URL:', page.url());
console.log('TITLE:', await page.title());
const onLogin = /欢迎回来|欢迎来到 FlowUs|使用验证码登录/.test(t);
console.log('是否停在登录页:', onLogin);
console.log('---TEXT---');
console.log(t);
await browser.close();
