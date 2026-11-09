/**
 * 字段类型 string 对照 —— 逐个换类型（M0-T26 第二步）
 * 在隔离测试表上，把「分类」列的 type 依次改成各类型，每次读接口记 string。
 * 定位全部用 [data-test-id="<中文名>"]（M0-T23 已证实可用）。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t26';
const DOC = '2ba0f24d-6108-4a8c-87d1-740a00fc6979';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = { doc: DOC, steps: [] };

const readField = () => page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const out = [];
  Object.values(bs).forEach((b) => {
    const d = b.data || {};
    if (d.schema) Object.entries(d.schema).forEach(([k, f]) => out.push({ id: k, name: f.name, type: f.type }));
  });
  return out;
}, DOC);

// 打开「分类」列头菜单 → 更换类型 → 点目标类型（全用 text 点击，坐标每次重取）
const clickTextStrict = async (t, scopeSel) => {
  const r = await page.evaluate(({ txt, sc }) => {
    const root = sc ? document.querySelector(sc) : document;
    if (!root) return null;
    let best = null;
    root.querySelectorAll('div,span,button,li').forEach((e) => {
      if ((e.innerText || '').trim() !== txt) return;
      const b = e.getBoundingClientRect();
      if (b.width < 8 || b.height < 8) return;
      if (!best || b.width * b.height < best.w * best.h) best = { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    return best;
  }, { txt: t, sc: scopeSel || null });
  if (!r) return false;
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  return true;
};

const openColumnMenu = async () => {
  // 点「分类」列头
  const h = await page.evaluate(() => {
    let best = null;
    document.querySelectorAll('div,span,th').forEach((e) => {
      if ((e.innerText || '').trim() !== '分类') return;
      const r = e.getBoundingClientRect();
      if (r.width < 10 || r.x < 240 || e.children.length > 2) return;
      if (!best) best = { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    return best;
  });
  if (!h) return false;
  await page.mouse.click(h.x + 30, h.y + h.h / 2);
  await page.waitForTimeout(1600);
  return true;
};

const targets = ['数字', '勾选框', '人员', '文件媒体', '邮箱', '电话', '公式', '关联', '汇总', '创建人', '编辑时间', '编辑人', '单选'];

await page.goto('https://flowus.cn/' + DOC, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6500);
await page.keyboard.press('Escape');
await page.waitForTimeout(900);

for (const t of targets) {
  const before = await readField();
  const beforeType = (before.find((f) => f.name === '分类') || {}).type;
  try {
    await openColumnMenu();
    const okMenu = await clickTextStrict('更换类型');
    await page.waitForTimeout(1800);
    // 点目标类型（用 data-test-id 更稳）
    let clicked = false;
    const el = page.locator(`[data-test-id="${t}"]`).first();
    if (await el.count()) { await el.click({ force: true, timeout: 5000 }).catch(() => {}); clicked = true; }
    if (!clicked) clicked = await clickTextStrict(t);
    await page.waitForTimeout(2200);
    // 可能有确认/配置弹窗，Escape 掉
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);
    const after = await readField();
    const afterType = (after.find((f) => f.name === '分类') || {}).type;
    R.steps.push({ target: t, menuOk: okMenu, clicked, beforeType, afterType, changed: beforeType !== afterType });
    console.log(`${t.padEnd(6)} menu=${okMenu} click=${clicked}  ${beforeType} → ${afterType}  ${beforeType !== afterType ? '✓' : '（未变）'}`);
  } catch (e) {
    R.steps.push({ target: t, err: e.message.split('\n')[0] });
    console.log(`${t.padEnd(6)} 出错: ${e.message.split('\n')[0]}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
}
fs.writeFileSync(OUT + '/field-type-strings.json', JSON.stringify(R, null, 1));
await page.screenshot({ path: OUT + '/c-after-types.png' });
await browser.close();
