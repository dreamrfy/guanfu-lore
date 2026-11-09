/**
 * 页面布局三档实测（M0-T27 下半）
 * 在同一临时页上切「页面布局 紧密/默认/宽松」，量正文的 fontSize / lineHeight / 块高。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t27';
const DOC = 'dff2f20e-4915-427d-820c-d6fbc0b0fb1a';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = { steps: [] };

await page.goto('https://flowus.cn/' + DOC, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6500);
await page.keyboard.press('Escape');
await page.mouse.move(5, 5);
await page.waitForTimeout(900);

// 量正文（取第一个 16px 的文本元素）
const measure = () => page.evaluate(() => {
  const out = { samples: [] };
  document.querySelectorAll('div,span').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 40 || r.height < 8 || r.x < 240) return;
    if (e.children.length > 1) return;
    const t = (e.innerText || '').trim();
    if (!t || t.length > 30) return;
    const cs = getComputedStyle(e);
    out.samples.push({ fs: cs.fontSize, lh: cs.lineHeight, fw: cs.fontWeight, h: Math.round(r.height), w: Math.round(r.width) });
  });
  // 取出现最多的 (fs/lh)
  const cnt = {};
  out.samples.forEach((s) => { const k = s.fs + '/' + s.lh + '/w' + s.fw; cnt[k] = (cnt[k] || 0) + 1; });
  out.top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return out.top;
});

const clickText = async (t) => {
  const r = await page.evaluate((txt) => {
    let best = null;
    document.querySelectorAll('div,span,button,li').forEach((e) => {
      if ((e.innerText || '').trim() !== txt) return;
      const b = e.getBoundingClientRect();
      if (b.width < 8 || b.height < 8) return;
      if (!best || b.width * b.height < best.w * best.h) best = { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    return best;
  }, t);
  if (!r) return false;
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  return true;
};

R['0 切换前'] = await measure();

for (const mode of ['紧密', '宽松', '默认']) {
  // 打开页面 ⋯
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const more = page.locator('[data-test-id="page-header-more"]').first();
  if (await more.count()) { await more.click({ force: true }); await page.waitForTimeout(1700); }
  // 点「页面布局」（可能要先点一次展开子层）
  const ok1 = await clickText('页面布局');
  await page.waitForTimeout(1600);
  const ok2 = await clickText(mode);
  await page.waitForTimeout(2200);
  const m = await measure();
  R.steps.push({ mode, clickedLayoutMenu: ok1, clickedMode: ok2, top: m });
  console.log(`${mode}: menu=${ok1} mode=${ok2} → ${JSON.stringify(m)}`);
  await page.screenshot({ path: OUT + '/b-layout-' + mode + '.png' });
}

fs.writeFileSync(OUT + '/layout.json', JSON.stringify(R, null, 1));
console.log('\n切换前:', JSON.stringify(R['0 切换前']));
await browser.close();
