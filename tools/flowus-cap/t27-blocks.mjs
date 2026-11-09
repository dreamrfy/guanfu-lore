/**
 * 剩余块级排版 —— 造块（M0-T27 上半）
 * 用 Markdown 快捷造块（M0-T17 已验证 #/-/1./--- 可靠），**不碰斜杠菜单**。
 * 开头记侧栏基线；本轮不删页（下半还要用它测页面布局三档）。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t27';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
R['0 基线'] = await page.evaluate(() => Array.from(document.querySelectorAll('[data-test-id="aside-item-toc"]')).map((e) => (e.getAttribute('href') || '')).filter((h) => h.length > 5).length);
console.log('基线页数:', R['0 基线']);

// 建页
await page.locator('[data-test-id="aside-toc-header-create-by-private"]').first().click({ force: true });
await page.waitForTimeout(5500);
const DOC = (page.url().match(/([0-9a-f-]{36})\s*$/) || [])[1];
R['1 docId'] = DOC;
console.log('临时页:', DOC);

// 进入正文（空页顶部有个「按回车开始编辑」占位）
await page.mouse.click(900, 300);
await page.waitForTimeout(1200);

const lines = [
  ['段落', '这是一段正文样本'],
  ['h1', '# 标题一'],
  ['h2', '## 标题二'],
  ['h3', '### 标题三'],
  ['h4', '#### 标题四'],
  ['bullet', '- 项目项'],
  ['number', '1. 编号项'],
  ['quote', '> 引述样本'],
  ['divider', '---'],
  ['code', '```'],
];
R['2 输入'] = [];
for (const [k, txt] of lines) {
  try {
    await page.keyboard.type(txt, { delay: 40 });
    await page.waitForTimeout(1100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1100);
    R['2 输入'].push({ k, ok: true });
  } catch (e) { R['2 输入'].push({ k, err: e.message.split('\n')[0] }); }
}
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + '/a-blocks.png' });

const readBlocks = () => page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const root = Object.values(bs).find((b) => b && !b.parentId) || Object.values(bs)[0];
  const out = [];
  const walk = (bid) => {
    const b = bs[bid]; if (!b) return;
    const segs = (b.data && b.data.segments) || [];
    out.push({ type: b.type, level: b.data && b.data.level !== undefined && b.data.level !== null ? b.data.level : null, len: segs.reduce((n, s) => n + ((s && s.text) || '').length, 0) });
    (b.subNodes || []).forEach(walk);
  };
  if (root) walk(root.uuid);
  return out;
}, DOC);
const blocks = await readBlocks();
R['3 块序列'] = blocks;
console.log('块序列:');
blocks.forEach((b, i) => console.log(`  ${String(i).padStart(2)} type=${String(b.type).padEnd(4)} lv=${b.level === null ? '-' : b.level} len=${b.len}`));

// 几何：各块矩形（只记几何）
const rects = await page.evaluate(() => {
  const cands = [];
  document.querySelectorAll('div').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 600 || r.width > 720) return;
    if (Math.abs(r.x - 720) > 40) return;
    if (r.height < 6 || r.height > 300) return;
    if (r.y < 80) return;
    cands.push({ x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) });
  });
  const byY = {};
  cands.forEach((c) => { const k = Math.round(c.y); if (!byY[k] || c.w > byY[k].w) byY[k] = c; });
  return Object.values(byY).sort((a, b) => a.y - b.y);
});
R['4 矩形数'] = rects.length;
R['5 配对'] = [];
const n = Math.min(blocks.length, rects.length);
for (let i = 0; i < n; i++) R['5 配对'].push({ type: blocks[i].type, level: blocks[i].level, h: rects[i].h, x: rects[i].x });
console.log('DOM 矩形数:', rects.length, '| 配对:', n);
R['5 配对'].forEach((p) => console.log(`  type=${String(p.type).padEnd(4)} lv=${p.level === null ? '-' : p.level} h=${p.h} x=${p.x}`));

fs.writeFileSync(OUT + '/blocks3.json', JSON.stringify(R, null, 1));
await browser.close();
