/**
 * 造待办块定 type（M0-T32 第①项）
 * 只打 `/`（不输过滤词）→ 从完整菜单里找到「待办列表」行 → 按坐标点 → 读 type。
 * 顺带做第⑥项：复核「学习进度」仍为 8 字段。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t32';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
R['0 基线'] = await page.evaluate(() => document.querySelectorAll('[data-test-id="aside-item-toc"]').length);

await page.locator('[data-test-id="aside-toc-header-create-by-private"]').first().click({ force: true });
await page.waitForTimeout(5500);
const DOC = (page.url().match(/([0-9a-f-]{36})\s*$/) || [])[1];
R['1 docId'] = DOC;
console.log('临时页:', DOC);
await page.mouse.click(900, 300);
await page.waitForTimeout(1300);
await page.keyboard.type('/', { delay: 90 });
await page.waitForTimeout(2500);

// 列菜单行 + 找「待办列表」
const rows = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.next-modal, [role="menu"], [data-popper-placement]').forEach((pane) => {
    const pb = pane.getBoundingClientRect();
    if (pb.width < 100 || pb.height < 60) return;
    pane.querySelectorAll('div,li,[role="menuitem"]').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.height < 22 || r.height > 50 || r.width < 90) return;
      const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
      if (!t || t.length > 26 || e.children.length > 3) return;
      out.push({ t, x: +(r.x + r.width / 2).toFixed(1), y: +(r.y + r.height / 2).toFixed(1), w: Math.round(r.width), h: Math.round(r.height) });
    });
  });
  const seen = new Set();
  return out.filter((o) => { const k = o.t + o.y; if (seen.has(k)) return false; seen.add(k); return true; });
});
R['2 菜单行'] = rows.map((r) => r.t);
console.log('菜单行:', JSON.stringify(R['2 菜单行']));

const todo = rows.find((r) => r.t.indexOf('待办列表') === 0) || rows.find((r) => r.t.includes('待办'));
R['3 目标行'] = todo || null;
if (todo) {
  await page.mouse.click(todo.x, todo.y);
  await page.waitForTimeout(2500);
  await page.keyboard.type('DDD待办唯一文本', { delay: 35 });
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: OUT + '/after-todo.png' });

const blocks = await page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const root = Object.values(bs).find((b) => b && !b.parentId) || Object.values(bs)[0];
  const out = [];
  const walk = (bid) => {
    const b = bs[bid]; if (!b) return;
    const segs = (b.data && b.data.segments) || [];
    out.push({ type: b.type, level: b.data && b.data.level !== undefined && b.data.level !== null ? b.data.level : null, text: segs.map((s) => (s && s.text) || '').join('').slice(0, 20) });
    (b.subNodes || []).forEach(walk);
  };
  if (root) walk(root.uuid);
  return out;
}, DOC);
R['4 块序列'] = blocks;
console.log('=== 块序列 ===');
blocks.forEach((b, i) => console.log(`  ${i} type=${String(b.type).padEnd(4)} lv=${b.level === null ? '-' : b.level} [${b.text}]`));

// ⑥ 复核学习进度
R['5 学习进度'] = await page.evaluate(async () => {
  const j = await (await fetch('/api/docs/0e207dcb-a6fe-40d8-8867-af42cf465a72', { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const out = [];
  Object.values(bs).forEach((b) => { const d = b.data || {}; if (d.schema) Object.entries(d.schema).forEach(([k, f]) => out.push({ name: f.name, type: f.type })); });
  return out;
});
console.log('学习进度字段数:', R['5 学习进度'].length, '|', R['5 学习进度'].map((f) => f.name + ':' + f.type).join(' '));

fs.writeFileSync(OUT + '/todo-type.json', JSON.stringify(R, null, 1));
await browser.close();
