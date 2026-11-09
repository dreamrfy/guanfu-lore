/**
 * FlowUs 自研图标集 Ic* 批量导出（M0-T15）
 * 逐个打开会露出图标的面板/弹层，把 [data-icon] 的 SVG 全量收下来。
 * 安全：只点 ⋯（更多）/ 导出页面 / 空间设置，绝不点任何 *create*。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t15';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];

const found = new Map(); // name -> {html, surfaces:[], w, h}
const harvest = async (surface) => {
  const items = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('svg[data-icon]').forEach((s) => {
      const r = s.getBoundingClientRect();
      if (r.width < 4) return;
      out.push({
        name: s.getAttribute('data-icon'),
        html: s.outerHTML,
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    });
    return out;
  });
  for (const it of items) {
    const cur = found.get(it.name);
    if (cur) {
      if (!cur.surfaces.includes(surface)) cur.surfaces.push(surface);
      if (it.w > cur.w) { cur.w = it.w; cur.h = it.h; }
    } else {
      found.set(it.name, { html: it.html, surfaces: [surface], w: it.w, h: it.h });
    }
  }
  return items.length;
};

const rectOf = (t) => page.evaluate((txt) => {
  let best = null;
  document.querySelectorAll('span,div,li,a,button').forEach((e) => {
    if ((e.innerText || '').trim() !== txt) return;
    const r = e.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    if (!best || r.width * r.height < best.w * best.h) best = { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  return best;
}, t);
const clickAt = async (t) => { const r = await rectOf(t); if (!r) return false; await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); return true; };

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
const R = {};

// ① 基础外壳
R['① 外壳'] = await harvest('外壳');

// ② 侧栏 hover（露出行内 ⋯ / ＋）
try {
  await page.locator('[data-test-id="aside-item-toc"]').nth(1).hover();
  await page.waitForTimeout(900);
  R['② 侧栏hover'] = await harvest('侧栏hover');
  // ③ 行内菜单
  await page.locator('[data-test-id="aside-item-toc"]').nth(1)
    .locator('[data-test-id="aside-item-more"]').first().click({ force: true });
  await page.waitForTimeout(1600);
  R['③ 行内菜单'] = await harvest('行内菜单');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
} catch (e) { R['②-③'] = e.message.split('\n')[0]; }

// ④ 页面 ⋯ 长面板（图标最密集）
try {
  await page.locator('[data-test-id="aside-item-toc"]').filter({ hasText: '归档历史材料' }).first().click({ force: true });
  await page.waitForTimeout(3500);
  await page.locator('[data-test-id="page-header-more"]').first().click({ force: true });
  await page.waitForTimeout(1800);
  R['④ 页面⋯面板'] = await harvest('页面⋯面板');
  // ⑤ 导出格式子菜单
  await clickAt('导出页面');
  await page.waitForTimeout(2000);
  R['⑤ 导出子菜单'] = await harvest('导出子菜单');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
} catch (e) { R['④-⑤'] = e.message.split('\n')[0]; }

// ⑥ 空间设置弹层
try {
  await page.getByText('两相欢的空间', { exact: false }).first().click({ force: true });
  await page.waitForTimeout(1300);
  await page.getByText('空间设置', { exact: true }).first().click({ force: true });
  await page.waitForTimeout(2600);
  R['⑥ 空间设置'] = await harvest('空间设置');
  await page.screenshot({ path: OUT + '/icons-settings.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
} catch (e) { R['⑥'] = e.message.split('\n')[0]; }

// 写盘
const manifest = [];
for (const [name, v] of found) {
  const safe = name.replace(/[^A-Za-z0-9_-]/g, '_');
  fs.writeFileSync(`${OUT}/${safe}.svg`, v.html);
  manifest.push({ name, file: safe + '.svg', surfaces: v.surfaces, renderedSize: v.w + 'x' + v.h, bytes: v.html.length });
}
manifest.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(OUT + '/icons-manifest.json', JSON.stringify({ count: manifest.length, icons: manifest }, null, 1));

console.log('各界面收到数量:', JSON.stringify(R));
console.log('图标总数（去重）:', found.size);
manifest.forEach((m) => console.log('  ' + m.name.padEnd(26) + (m.renderedSize || '').padEnd(9) + m.bytes + 'B  [' + m.surfaces.join('/') + ']'));
await browser.close();
