/**
 * 剩余块类型数字对照（M0-T25）
 * 干净页 + 斜杠菜单快捷码，**一次只造一个块**，每造一块立刻读接口做差集，把新块的 type 对上。
 * 纪律：开头记侧栏基线 → 结尾三步删页 → 核对基线恢复。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t25';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

const sideIds = () => page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-test-id="aside-item-toc"]'))
    .map((e) => (e.getAttribute('href') || '').replace(/^\//, ''))
    .filter((x) => /^[0-9a-f-]{36}$/.test(x))
);

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// ① 基线
R['0 基线'] = [...new Set(await sideIds())];
console.log('基线页数:', R['0 基线'].length);

// ② 建页
await page.locator('[data-test-id="aside-toc-header-create-by-private"]').first().click({ force: true });
await page.waitForTimeout(5000);
const docId = (page.url().match(/([0-9a-f-]{36})\s*$/) || [])[1];
R['1 docId'] = docId;
console.log('临时页:', docId);

const readBlocks = () => page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const root = Object.values(bs).find((b) => b && !b.parentId) || Object.values(bs)[0];
  const list = [];
  const walk = (bid) => {
    const b = bs[bid]; if (!b) return;
    const d = b.data || {};
    list.push({ uuid: bid, type: b.type, level: d.level === undefined ? null : d.level, keys: Object.keys(d).sort().join(',') });
    (b.subNodes || []).forEach(walk);
  };
  if (root) walk(root.uuid);
  return list;
}, docId);

// ③ 进入正文
await page.mouse.click(900, 260);
await page.waitForTimeout(1200);

let prev = await readBlocks();
console.log('初始块:', prev.map((b) => b.type).join(','));

const codes = [
  ['引述文字', '/yswz'],
  ['代码片段', '/dmpd'],
  ['折叠列表', '/zdlb'],
  ['折叠标题1', '/zdbt1'],
  ['简单表格', '/jdbg'],
  ['分割线', '/fgx'],
  ['项目列表', '/xmlb'],
  ['编号列表', '/bhlb'],
  ['思维导图', '/swdt'],
];
R['2 逐块结果'] = [];
for (const [label, code] of codes) {
  try {
    await page.keyboard.press('End');
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    await page.keyboard.type(code, { delay: 55 });
    await page.waitForTimeout(1700);
    await page.keyboard.press('Enter'); // 选中第一个匹配
    await page.waitForTimeout(1600);
    const now = await readBlocks();
    const prevIds = new Set(prev.map((b) => b.uuid));
    const added = now.filter((b) => !prevIds.has(b.uuid));
    R['2 逐块结果'].push({ label, code, added: added.map((a) => ({ type: a.type, level: a.level, keys: a.keys })), total: now.length });
    prev = now;
    await page.waitForTimeout(600);
  } catch (e) {
    R['2 逐块结果'].push({ label, code, err: e.message.split('\n')[0] });
  }
}
await page.screenshot({ path: OUT + '/blocks-created.png' });
R['3 最终块序列'] = prev.map((b) => ({ type: b.type, level: b.level }));

fs.writeFileSync(OUT + '/block-types3.json', JSON.stringify(R, null, 1));
console.log('=== 逐块结果 ===');
R['2 逐块结果'].forEach((x) => {
  if (x.err) { console.log('  ' + x.label.padEnd(8) + ' 出错 ' + x.err); return; }
  const t = x.added.map((a) => 'type=' + a.type + (a.level === null ? '' : '/lv' + a.level)).join(' + ') || '(无新块)';
  console.log('  ' + x.label.padEnd(8) + x.code.padEnd(9) + ' → ' + t);
});
console.log('最终块序列:', R['3 最终块序列'].map((b) => b.type).join(','));
await browser.close();
