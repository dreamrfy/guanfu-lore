/**
 * 块类型映射实测（M0-T17 + M0-T20）
 * 故意建一篇含"每样块类型一个"的测试文档 → 读接口拿到每个块的 type → 产出映射表 → 删页。
 *
 * 安全：本任务**有意**建页（这是唯一允许主动建页的任务）；建页后必删（delete-bar-delete + 确认）。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t17';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = {};

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

R['0 建页前侧栏'] = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-test-id="aside-item-toc"]')).map((e) => (e.innerText || '').trim())
);

// ---- ① 建测试页（点「私人」分区头的 +）----
try {
  await page.locator('[data-test-id="aside-toc-header-create-by-private"]').first().click({ force: true });
  await page.waitForTimeout(5000);
} catch (e) { R['1 建页'] = '失败: ' + e.message.split('\n')[0]; }
R['1 建页后 URL'] = page.url();
const docId = (page.url().match(/([0-9a-f-]{36})\s*$/) || [])[1];
R['2 docId'] = docId;
await page.screenshot({ path: OUT + '/a-new-page.png' });

// ---- ② 逐块输入 ----
const blocks = [
  { key: '段落', type: '正文段落一' },
  { key: '标题1', type: '# 标题一' },
  { key: '标题2', type: '## 标题二' },
  { key: '标题3', type: '### 标题三' },
  { key: '标题4', type: '#### 标题四' },
  { key: '项目列表', type: '- 项目列表项' },
  { key: '编号列表', type: '1. 编号列表项' },
  { key: '待办', type: '[] 待办项' },
  { key: '引述', type: '> 引述文字' },
  { key: '分割线', type: '---' },
];
try {
  await page.keyboard.press('End');
  // 标题先留空，直接进正文
  for (const b of blocks) {
    await page.keyboard.type(b.type, { delay: 25 });
    await page.waitForTimeout(700);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    R['输入-' + b.key] = 'ok';
  }
  await page.keyboard.type('收尾段落');
  await page.waitForTimeout(2500);
} catch (e) { R['3 输入'] = e.message.split('\n')[0]; }
await page.screenshot({ path: OUT + '/b-filled.png' });

// ---- ③ 读接口，逐块拿 type 与 data ----
await page.waitForTimeout(2500);
const api = await page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const d = j.data || {};
  const blocks = d.blocks || {};
  const root = Object.values(blocks).find((b) => b && !b.parentId) || Object.values(blocks)[0];
  const out = { total: Object.keys(blocks).length, order: [], checklist: [] };
  // 按 subNodes 递归展平，保留真实顺序
  const walk = (id, depth) => {
    const b = blocks[id];
    if (!b) return;
    const segs = (b.data && b.data.segments) || [];
    out.order.push({
      type: b.type,
      typeOf: typeof b.type,
      level: b.data ? b.data.level : undefined,
      segCount: segs.length,
      textLen: segs.reduce((n, s) => n + ((s && s.text) || '').length, 0),
      ownKeys: Object.keys(b).sort(),
      dataKeys: b.data ? Object.keys(b.data).sort() : [],
      enhancerKeys: (segs[0] && segs[0].enhancer) ? Object.keys(segs[0].enhancer).sort() : null,
      segType: segs[0] ? segs[0].type : null,
      depth,
    });
    (b.subNodes || []).forEach((c) => walk(c, depth + 1));
  };
  walk(root ? root.uuid : Object.keys(blocks)[0], 0);
  return out;
}, docId);
R['4 接口块序列'] = api;

fs.writeFileSync(OUT + '/block-map.json', JSON.stringify(R, null, 1));
console.log('建页 URL:', R['1 建页后 URL']);
console.log('块总数:', api.total);
console.log('=== 块序列（按文档顺序）===');
api.order.forEach((b, i) => {
  console.log(
    `  ${String(i).padStart(2)}  type=${String(b.type).padEnd(4)} level=${b.level === undefined ? '-' : b.level} seg=${b.segCount} 字数=${b.textLen} segType=${b.segType} enhancer=${b.enhancerKeys ? b.enhancerKeys.join('|') : '无'}`
  );
});
console.log('\n=== 逐块 data 键（便于识别块名）===');
api.order.forEach((b, i) => console.log(`  ${String(i).padStart(2)}  type=${b.type}  dataKeys=[${b.dataKeys.join(',')}]`));
await browser.close();
