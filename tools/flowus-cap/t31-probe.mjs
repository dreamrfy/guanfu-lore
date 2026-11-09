/**
 * M0-T31：一次解决三件事
 *  ③ 复核 type=12：造一个**待办**块（用 T28 验证过的「/=过滤+坐标点选」法），看它是不是 12
 *  ④ 复核 type=25：在代码块里**真写两行代码**，再读 type
 *  ① 块高精测：给每个块加**唯一文本**，按文本锚点定位（不再按 DOM 顺序猜）
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t31';
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
await page.waitForTimeout(1200);

const readBlocks = () => page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const root = Object.values(bs).find((b) => b && !b.parentId) || Object.values(bs)[0];
  const out = [];
  const walk = (bid) => {
    const b = bs[bid]; if (!b) return;
    const segs = (b.data && b.data.segments) || [];
    out.push({ uuid: bid, type: b.type, level: b.data && b.data.level !== undefined && b.data.level !== null ? b.data.level : null, text: segs.map((s) => (s && s.text) || '').join('') });
    (b.subNodes || []).forEach(walk);
  };
  if (root) walk(root.uuid);
  return out;
}, DOC);
const menuItems = () => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.next-modal, [role="menu"], [data-popper-placement]').forEach((pane) => {
    const pb = pane.getBoundingClientRect();
    if (pb.width < 100 || pb.height < 60) return;
    pane.querySelectorAll('div,li,[role="menuitem"]').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.height < 22 || r.height > 50 || r.width < 80) return;
      const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
      if (!t || t.length > 24 || e.children.length > 3) return;
      out.push({ t, x: +(r.x + r.width / 2).toFixed(1), y: +(r.y + r.height / 2).toFixed(1) });
    });
  });
  const seen = new Set();
  return out.filter((o) => { const k = o.t + o.y; if (seen.has(k)) return false; seen.add(k); return true; });
});

// 块 1：普通段落（唯一文本锚点）
await page.keyboard.type('AAA段落唯一文本', { delay: 35 });
await page.waitForTimeout(1200);
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
// 块 2：引述
await page.keyboard.type('> BBB引述唯一文本', { delay: 35 });
await page.waitForTimeout(1300);
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
// 块 3：代码块（真写两行）
await page.keyboard.type('```', { delay: 60 });
await page.waitForTimeout(1500);
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
await page.keyboard.type('code_line_1', { delay: 30 });
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
await page.keyboard.type('code_line_2', { delay: 30 });
await page.waitForTimeout(1200);
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
// 块 4：待办（斜杠菜单过滤+点选）
await page.keyboard.press('Enter');
await page.waitForTimeout(900);
await page.keyboard.type('/待办列表', { delay: 60 });
await page.waitForTimeout(2200);
const items = await menuItems();
R['2 待办菜单项'] = items.map((i) => i.t);
const todo = items.find((i) => i.t.includes('待办')) || items[0];
if (todo) { await page.mouse.click(todo.x, todo.y); await page.waitForTimeout(2200); }
R['3 点了'] = todo ? todo.t : null;
await page.keyboard.type('CCC待办唯一文本', { delay: 35 });
await page.waitForTimeout(2000);
await page.screenshot({ path: OUT + '/blocks.png' });

const blocks = await readBlocks();
R['4 块序列'] = blocks.map((b) => ({ type: b.type, level: b.level, text: b.text.slice(0, 22) }));
console.log('=== 块序列 ===');
blocks.forEach((b, i) => console.log(`  ${i} type=${String(b.type).padEnd(4)} lv=${b.level === null ? '-' : b.level} [${b.text.slice(0, 22)}]`));

// 按唯一文本锚点量块高
R['5 锚点测量'] = await page.evaluate(() => {
  const anchors = ['AAA段落唯一文本', 'BBB引述唯一文本', 'CCC待办唯一文本', 'code_line_1'];
  const out = [];
  for (const a of anchors) {
    let leaf = null;
    document.querySelectorAll('div,span,p').forEach((e) => {
      const t = (e.innerText || '').trim();
      if (!t.startsWith(a)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 10 || r.height < 6 || r.x < 240) return;
      if (!leaf || r.width * r.height < leaf.w * leaf.h) leaf = { el: e, x: r.x, y: r.y, w: r.width, h: r.height };
    });
    if (!leaf) { out.push({ anchor: a, found: false }); continue; }
    // 向上找到块容器（高度明显更大的一层）
    let n = leaf.el, blockRect = null;
    for (let i = 0; i < 5 && n; i++) {
      const rr = n.getBoundingClientRect();
      if (rr.height > leaf.h + 4 && rr.width > 300) { blockRect = { w: Math.round(rr.width), h: Math.round(rr.height), x: Math.round(rr.x), y: Math.round(rr.y) }; break; }
      n = n.parentElement;
    }
    const cs = getComputedStyle(leaf.el);
    out.push({ anchor: a, found: true, leafH: Math.round(leaf.h), leafW: Math.round(leaf.w), x: Math.round(leaf.x), fs: cs.fontSize, lh: cs.lineHeight, block: blockRect });
  }
  return out;
});
console.log('=== 锚点测量 ===');
R['5 锚点测量'].forEach((m) => console.log(`  ${m.anchor.padEnd(16)} found=${m.found} leafH=${m.leafH || '-'} x=${m.x || '-'} ${m.fs || ''}/${m.lh || ''} block=${JSON.stringify(m.block)}`));

fs.writeFileSync(OUT + '/t31.json', JSON.stringify(R, null, 1));
await browser.close();
