/**
 * 多维表模型逆向（M0-T09）
 * 从 /api/docs/{id} 里挖 data.schema（字段定义）、collectionViews（视图）、记录（行）结构。
 * 隐私：只输出键名 / 类型 / 计数，任何选项名与单元格内容都不落地。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t09';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4500);

const R = await page.evaluate(async () => {
  const out = {
    docsScanned: 0,
    spacesRootKeys: null,
    dbBlocksFound: 0,
    fieldShapes: {},      // 字段定义：键组合 -> 次数
    fieldTypes: {},       // 字段 type 值 -> 次数
    fieldOptionsKeys: {}, // options 内部键
    viewTypes: {},        // 视图 type -> 次数
    viewFormatKeys: {},   // 视图 format 键
    viewShapes: {},       // 视图对象键组合
    recordBlockTypes: {}, // 记录（行）块的 type
    collectionPropsKeys: {},
    pagePropsKeys: {},
  };
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };

  // 1) 空间 root（拿页面树与视图条目）
  const spaceId = (await (await fetch('/api/users/me', { headers: { accept: 'application/json' } })).json());
  try {
    const me = spaceId.data || spaceId;
    const sid = me && (me.lastVisitSpaceId || (me.spaces && me.spaces[0] && me.spaces[0].id));
    if (sid) {
      const root = await (await fetch(`/api/spaces/${sid}/root`, { headers: { accept: 'application/json' } })).json();
      const d = root.data || root;
      out.spacesRootKeys = { sid, top: Object.keys(d) };
    }
  } catch (e) { out.spacesRootKeys = { error: String(e).slice(0, 60) }; }

  // 2) 逐篇文档找 schema
  const ids = Array.from(document.querySelectorAll('[data-test-id="aside-item-toc"]'))
    .map((e) => (e.getAttribute('href') || '').replace(/^\//, '')).filter((id) => /^[0-9a-f-]{36}$/.test(id));

  for (const id of ids) {
    let j;
    try { j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json(); } catch (e) { continue; }
    const d = j.data;
    if (!d) continue;
    out.docsScanned++;

    const views = d.collectionViews || {};
    Object.values(views).forEach((v) => {
      if (!v || typeof v !== 'object') return;
      bump(out.viewTypes, typeof v.type + ':' + String(v.type));
      if (v.format && typeof v.format === 'object') Object.keys(v.format).forEach((k) => bump(out.viewFormatKeys, k));
      const sk = Object.keys(v).sort().join(',');
      out.viewShapes[sk.slice(0, 200)] = (out.viewShapes[sk.slice(0, 200)] || 0) + 1;
    });

    Object.values(d.blocks || {}).forEach((b) => {
      if (!b || typeof b !== 'object') return;
      const data = b.data || {};
      const kind = typeof b.type + ':' + String(b.type);

      // 记录（行）：父块是数据库块的页面块
      if (b.type === 0 && b.parentId && d.blocks[b.parentId] && d.blocks[b.parentId].data && d.blocks[b.parentId].data.schema) {
        bump(out.recordBlockTypes, kind);
        if (data.collectionProperties) Object.keys(data.collectionProperties).length && bump(out.collectionPropsKeys, '存在 collectionProperties');
        if (data.properties) Object.keys(data.properties).forEach((k) => bump(out.collectionPropsKeys, 'prop:' + k));
        if (data.format && typeof data.format === 'object') Object.keys(data.format).forEach((k) => bump(out.pagePropsKeys, k));
      }

      const schema = data.schema;
      if (!schema || typeof schema !== 'object') return;
      out.dbBlocksFound++;
      Object.values(schema).forEach((f) => {
        if (!f || typeof f !== 'object') return;
        bump(out.fieldTypes, typeof f.type + ':' + String(f.type));
        const sk = Object.keys(f).sort().join(',');
        out.fieldShapes[sk.slice(0, 200)] = (out.fieldShapes[sk.slice(0, 200)] || 0) + 1;
        if (f.options && typeof f.options === 'object') Object.keys(f.options).forEach((k) => bump(out.fieldOptionsKeys, k));
      });
      if (data.collectionPageProperties) Object.keys(data.collectionPageProperties).length && bump(out.collectionPropsKeys, '存在 collectionPageProperties');
    });
  }
  return out;
});

fs.writeFileSync(OUT + '/db-model.json', JSON.stringify(R, null, 1));
console.log('扫描文档:', R.docsScanned, '| 含 schema 的块:', R.dbBlocksFound);
console.log('空间 root:', JSON.stringify(R.spacesRootKeys));
console.log('=== 字段类型（type 的 JS 类型:值）===');
Object.entries(R.fieldTypes).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('  x' + String(n).padStart(3) + '  ' + k));
console.log('=== 字段定义形状（键组合）===');
Object.entries(R.fieldShapes).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, n]) => console.log('  x' + n + '  ' + k));
console.log('=== 字段 options 内部键 ===');
console.log('  ' + Object.keys(R.fieldOptionsKeys).join(', '));
console.log('=== 视图类型 ===');
Object.entries(R.viewTypes).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('  x' + n + '  ' + k));
console.log('=== 视图对象键组合（前 6）===');
Object.entries(R.viewShapes).sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([k, n]) => console.log('  x' + n + '  ' + k));
console.log('=== 视图 format 键 ===', Object.keys(R.viewFormatKeys).join(', '));
console.log('=== 记录块类型 ===', JSON.stringify(R.recordBlockTypes));
console.log('=== 记录属性相关键 ===', Object.keys(R.collectionPropsKeys).join(', '));
console.log('=== 记录页 format 键 ===', Object.keys(R.pagePropsKeys).join(', '));
console.log('\n已写出:', OUT + '/db-model.json');
await browser.close();
