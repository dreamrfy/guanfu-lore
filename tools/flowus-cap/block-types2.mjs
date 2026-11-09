import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t22';
const DOC = 'f246e3b4-05a4-4720-81ac-3b968774593b';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

await page.goto('https://flowus.cn/' + DOC, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// 点进正文
await page.mouse.click(900, 300);
await page.waitForTimeout(1200);
await page.keyboard.press('Control+End');
await page.waitForTimeout(800);

// 用快捷码造块：输入 /code 后回车选第一个匹配
const codes = [
  ['引述', '/yswz'],
  ['代码', '/dmpd'],
  ['折叠', '/zdlb'],
  ['表格', '/jdbg'],
  ['分割线', '/fgx'],
  ['项目列表', '/xmlb'],
  ['编号列表', '/bhlb'],
];
for (const [label, code] of codes) {
  try {
    await page.keyboard.press('Enter'); // 新空块
    await page.waitForTimeout(600);
    await page.keyboard.type(code, { delay: 60 });
    await page.waitForTimeout(1600);
    await page.keyboard.press('Enter'); // 选中第一个匹配项
    await page.waitForTimeout(1400);
    await page.keyboard.type('样本' + label, { delay: 30 });
    await page.waitForTimeout(900);
    R[label] = 'ok';
  } catch (e) { R[label] = 'err: ' + e.message.split('\n')[0]; }
}
await page.waitForTimeout(2000);
await page.screenshot({ path: OUT + '/blocks.png' });

// 读接口拿块类型
const blocks = await page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const root = Object.values(bs).find((b) => b && !b.parentId) || Object.values(bs)[0];
  const out = [];
  const walk = (bid) => {
    const b = bs[bid]; if (!b) return;
    const segs = (b.data && b.data.segments) || [];
    out.push({ type: b.type, level: b.data ? b.data.level : null, txt: segs.map((s) => (s && s.text) || '').join('').slice(0, 14), dataKeys: b.data ? Object.keys(b.data).sort().join(',') : '' });
    (b.subNodes || []).forEach(walk);
  };
  if (root) walk(root.uuid);
  return out;
}, DOC);
R['块序列'] = blocks;
fs.writeFileSync(OUT + '/block-types2.json', JSON.stringify(R, null, 1));
console.log('输入结果:', JSON.stringify(Object.fromEntries(Object.entries(R).filter(([k]) => k !== '块序列'))));
console.log('块数:', blocks.length);
blocks.forEach((b, i) => console.log(`  ${String(i).padStart(2)} type=${String(b.type).padEnd(4)} lv=${b.level === null ? '-' : b.level} [${b.txt}] data=${b.dataKeys}`));
await browser.close();
