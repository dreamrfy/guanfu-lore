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
await page.locator('[data-test-id="aside-item-toc"]').nth(5).click({ force: true });
await page.waitForTimeout(4000);
await page.mouse.click(900, 300);
await page.waitForTimeout(1000);
await page.keyboard.type('/', { delay: 90 });
await page.waitForTimeout(2500);

const grab = (step) => page.evaluate((st) => {
  let pane = null;
  document.querySelectorAll('.next-modal, [role="menu"], [data-popper-placement]').forEach((e) => {
    const b = e.getBoundingClientRect();
    if (b.width < 100 || b.height < 60) return;
    if (!pane || b.height > pane.h) pane = { el: e, h: Math.round(b.height), w: Math.round(b.width) };
  });
  if (!pane) return null;
  let scroller = null;
  pane.el.querySelectorAll('*').forEach((e) => {
    const cs = getComputedStyle(e);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 10) scroller = e;
  });
  if (!scroller) pane.el.querySelectorAll('*').forEach((e) => { if (!scroller && e.scrollHeight > e.clientHeight + 10) scroller = e; });
  if (scroller) scroller.scrollTop = st * 240;
  const lines = pane.el.innerText.split('\n').map((x) => x.trim()).filter(Boolean);
  return {
    w: pane.w,
    h: pane.h,
    hasScroller: !!scroller,
    scrollTop: scroller ? scroller.scrollTop : 0,
    scrollHeight: scroller ? scroller.scrollHeight : null,
    clientHeight: scroller ? scroller.clientHeight : null,
    lines,
  };
}, step);

const screens = [];
for (let i = 0; i < 12; i++) {
  const s = await grab(i);
  if (!s) break;
  screens.push(s);
  if (s.scrollHeight && s.scrollTop + s.clientHeight >= s.scrollHeight) break;
  await page.waitForTimeout(450);
}

const names = [];
const codes = [];
const seenN = new Set();
for (const s of screens) {
  for (const l of s.lines) {
    if (/^\/\S+$/.test(l)) { codes.push(l); continue; }
    if (!seenN.has(l)) { seenN.add(l); names.push(l); }
  }
}
const R = { screens, names, codes: [...new Set(codes)] };
fs.writeFileSync(OUT + '/slash-scroll.json', JSON.stringify(R, null, 1));
console.log('滚动屏数:', screens.length, '| 可滚动:', screens[0] && screens[0].hasScroller, '| scrollHeight:', screens[0] && screens[0].scrollHeight, '| clientHeight:', screens[0] && screens[0].clientHeight);
screens.forEach((s, i) => console.log(`  屏${i} top=${s.scrollTop}: ${s.lines.join(' | ').slice(0, 260)}`));
console.log('\n去重名称(' + names.length + '): ' + names.join(' | '));
console.log('快捷码(' + R.codes.length + '): ' + R.codes.join(' '));
await page.keyboard.press('Escape');
await browser.close();
