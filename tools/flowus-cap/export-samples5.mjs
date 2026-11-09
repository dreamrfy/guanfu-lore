import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t10';
const DL = OUT + '/downloads';
fs.mkdirSync(DL, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const cdp = await ctx.newCDPSession(page);
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL.replace(/\//g, '\\') });
page.on('download', async (d) => {
  const f = DL + '/' + d.suggestedFilename();
  try { await d.saveAs(f); console.log('>>> 已保存:', d.suggestedFilename()); } catch (e) { console.log('>>> saveAs 失败', e.message.slice(0, 60)); }
});

const R = {};
const rectOf = (t) => page.evaluate((txt) => {
  let best = null;
  document.querySelectorAll('span,div,li,a,button').forEach((e) => {
    if ((e.innerText || '').trim() !== txt) return;
    const r = e.getBoundingClientRect();
    if (r.width < 10 || r.height < 8) return;
    if (!best || r.width * r.height < best.w * best.h) best = { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  return best;
}, t);
const clickAt = async (t) => { const r = await rectOf(t); if (!r) return false; await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); return true; };

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4500);
await page.keyboard.press('Escape'); await page.waitForTimeout(600);
await page.locator('[data-test-id="aside-item-toc"]').filter({ hasText: '归档历史材料' }).first().click({ force: true });
await page.waitForTimeout(4000);

for (const fmt of ['Markdown & CSV', 'PDF', 'Word']) {
  await page.keyboard.press('Escape'); await page.waitForTimeout(1200);
  await page.locator('[data-test-id="page-header-more"]').first().click({ force: true });
  await page.waitForTimeout(1600);
  await clickAt('导出页面');
  await page.waitForTimeout(2200);
  R['选格式-' + fmt] = await clickAt(fmt);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT + '/u-' + fmt.replace(/[^\w]/g, '_') + '-dialog.png' });
  // 采确认对话框规格
  R['对话框-' + fmt] = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.next-modal').forEach((e) => {
      const r = e.getBoundingClientRect();
      const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
      if (r.width < 150 || r.height < 80) return;
      out.push({ w: Math.round(r.width), h: Math.round(r.height), text: t.slice(0, 160) });
    });
    return out;
  });
  // 点最后的「导出」按钮（取最靠下/最靠右的那个「导出」）
  const ok = await page.evaluate(() => {
    let best = null;
    document.querySelectorAll('button,div,span').forEach((e) => {
      if ((e.innerText || '').trim() !== '导出') return;
      const r = e.getBoundingClientRect();
      if (r.width < 20 || r.height < 16) return;
      if (!best || r.y > best.y) best = { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
    });
    return best;
  });
  R['点导出-' + fmt] = !!ok;
  if (ok) { await page.mouse.click(ok.x, ok.y); }
  await page.waitForTimeout(15000);
  R['文件-' + fmt] = fs.existsSync(DL) ? fs.readdirSync(DL) : [];
}

await page.waitForTimeout(10000);
R['最终文件'] = fs.existsSync(DL) ? fs.readdirSync(DL).map((f) => ({ f, size: fs.statSync(DL + '/' + f).size })) : [];
fs.writeFileSync(OUT + '/export-final2.json', JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1).slice(0, 4000));
await browser.close();
