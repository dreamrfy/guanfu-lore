/**
 * 多维表字段/视图类型枚举（M0-T18）
 * 不建表、不改数据：在现有多维表上打开"列头菜单"与"视图菜单"，把类型清单成套掏出来。
 * 安全：只点列头 / 创建▾ / 视图▾ 这类**查看入口**；绝不点「删除」「清空」等破坏性项。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t18';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

const dumpLayers = async (label) => {
  const layers = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.next-modal, [role="menu"], [role="dialog"], .next-modal-dropdown, [data-popper-placement]').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 60 || r.height < 30) return;
      const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
      if (!t) return;
      out.push({ w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), text: t.slice(0, 700) });
    });
    // 同一内容去重
    const seen = new Set();
    return out.filter((o) => { const k = o.text.slice(0, 120); if (seen.has(k)) return false; seen.add(k); return true; });
  });
  R[label] = layers;
  return layers;
};

const rectOf = (t) => page.evaluate((txt) => {
  let best = null;
  document.querySelectorAll('span,div,li,a,button,label').forEach((e) => {
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

// ---- ① 打开多维表页 ----
await page.locator('[data-test-id="aside-item-toc"]').filter({ hasText: '无标题多维表格' }).first().click({ force: true });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
await page.screenshot({ path: OUT + '/a-table.png' });

// ---- ② 表结构骨架（视图栏 / 列头 / 行） ----
R['① 表结构'] = await page.evaluate(() => {
  const out = { texts: [], headers: [], actionBtns: [] };
  const main = document.querySelector('.main-panel') || document.body;
  out.texts = main.innerText.replace(/\s+/g, ' ').slice(0, 500);
  // 列头：表格首行里高度约 32-40 的水平块
  document.querySelectorAll('div,th').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.height >= 28 && r.height <= 44 && r.width >= 80 && r.width <= 320 && r.y > 90 && r.y < 220) {
      const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
      if (t && t.length < 20 && e.children.length <= 3) out.headers.push({ t, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) });
    }
  });
  document.querySelectorAll('[data-test-id]').forEach((e) => {
    const id = e.getAttribute('data-test-id');
    if (/table|column|field|view|record|cell/i.test(id)) {
      const r = e.getBoundingClientRect();
      if (r.width > 0) out.actionBtns.push({ id, t: (e.innerText || '').trim().slice(0, 16), x: Math.round(r.x), y: Math.round(r.y) });
    }
  });
  out.headers = out.headers.slice(0, 12);
  out.actionBtns = out.actionBtns.slice(0, 20);
  return out;
});

// ---- ③ 点第一个列头 → 列头菜单 → 字段类型清单 ----
try {
  const h = R['① 表结构'].headers.find((x) => x.w >= 100);
  if (h) {
    await page.mouse.click(h.x + 40, h.y + 16);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: OUT + '/b-col-menu.png' });
    await dumpLayers('② 列头菜单');
    // 尝试进入"编辑属性/类型"子层
    for (const probe of ['编辑属性', '更改类型', '字段类型', '属性类型']) {
      if (await clickAt(probe)) {
        await page.waitForTimeout(1800);
        await page.screenshot({ path: OUT + '/c-' + probe + '.png' });
        await dumpLayers('③ 类型清单（' + probe + '）');
        break;
      }
    }
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
} catch (e) { R['③'] = e.message.split('\n')[0]; }

// ---- ④ 视图类型清单（视图栏 创建▾ / 表格▾）----
try {
  for (const probe of ['创建', '表格', '+']) {
    const r = await rectOf(probe);
    if (!r) continue;
    await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
    await page.waitForTimeout(1800);
    const layers = await dumpLayers('④ 视图菜单（点了 ' + probe + '）');
    if (layers.some((l) => /看板|画廊|日历|时间轴|列表|收集表|表格/.test(l.text) && l.text.length > 8)) {
      await page.screenshot({ path: OUT + '/d-view-menu.png' });
      break;
    }
    await page.keyboard.press('Escape'); await page.waitForTimeout(700);
  }
} catch (e) { R['④'] = e.message.split('\n')[0]; }

fs.writeFileSync(OUT + '/db-types.json', JSON.stringify(R, null, 1));
console.log('=== 表结构 ===');
console.log('  正文前 200 字:', (R['① 表结构'].texts || '').slice(0, 200));
console.log('  列头:', JSON.stringify(R['① 表结构'].headers));
console.log('  含 table/column/view 的 test-id:', JSON.stringify(R['① 表结构'].actionBtns));
for (const k of Object.keys(R)) {
  if (k.startsWith('②') || k.startsWith('③') || k.startsWith('④')) {
    console.log('=== ' + k + ' ===');
    (R[k] || []).forEach((l) => console.log('  [' + l.w + 'x' + l.h + '] ' + l.text.slice(0, 400)));
  }
}
await browser.close();
