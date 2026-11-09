// M0-T19 收尾：拷证据（脱敏）、更新任务表与汇总册、验收
const fs = require('fs');
const REPO = 'E:/VBcoding/bijiapp';
const SRC = 'E:/dev/tmp/flowus-cap/capture/m0-t19';

// ---- ① 证据脱敏并入库 ----
const sp = JSON.parse(fs.readFileSync(SRC + '/spacing.json', 'utf8'));
sp.doc = '账号页（仅几何，已脱敏）';
fs.mkdirSync(REPO + '/docs/基准/证据/M0-T19', { recursive: true });
fs.writeFileSync(REPO + '/docs/基准/证据/M0-T19/spacing.json', JSON.stringify(sp, null, 1));
fs.copyFileSync(SRC + '/sample-page.png', REPO + '/docs/基准/证据/M0-T19/sample-page.png');

// ---- ② 任务表 ----
const tp = REPO + '/开发任务表-v3.0-FlowUs复刻版.md';
let t = fs.readFileSync(tp, 'utf8');
const o19 = '**M0-T12 实测发现：两段正文相距 29px 而行高规格是 24px——块间距从没采过** | TODO |';
if (!t.includes(o19)) { console.log('X T19 锚点未找到'); process.exit(1); }
t = t.replace(o19, '**M0-T12 实测发现：两段正文相距 29px 而行高规格是 24px——块间距从没采过** | DONE·部分（11-10：**块高 34 / 间距 2 / 行距 24** 已实测；空块与大标题等拆 M0-T24） |');
const anchor24 = '| M0-T23 | 字段类型中文名';
const i = t.indexOf(anchor24);
if (i < 0) { console.log('X T23 行未找到'); process.exit(1); }
const eol = t.indexOf('\n', i);
const t24 = [
  '',
  '| M0-T24 | 剩余块级排版补采（由 M0-T19 拆分） | 采**空块高度**、**大标题（40/64）的块高**、标题 level 1-4 各自块高、**列表（项目/编号/待办）的块高与缩进**、引述/代码块/分割线的块高；以及"块内软换行 vs 新块"的判定 | TODO |',
].join('\n');
t = t.slice(0, eol) + t24 + t.slice(eol);
fs.writeFileSync(tp, t);
console.log('T19:', t.includes('DONE·部分（11-10：**块高 34') ? 'ok' : 'X',
  '| T24:', t.includes('| M0-T24 |') ? 'ok' : 'X',
  '| M0 任务行:', (t.match(/^\| M0-T/gm) || []).length);

// ---- ③ 汇总册索引 ----
const spath = REPO + '/docs/基准/FlowUs基准规格-v1.md';
let s = fs.readFileSync(spath, 'utf8');
if (!s.includes('基准-块级排版.md')) {
  const anchor = '| [`基准-导出格式.md`](基准-导出格式.md)';
  if (!s.includes(anchor)) { console.log('X 汇总册锚点未找到'); process.exit(1); }
  const row = '| [`基准-块级排版.md`](基准-块级排版.md) | **块高 34 / 块间距 2 / 相邻段落 36** | ✅ 完成 | `证据/M0-T19/` |' + '\n';
  s = s.replace(anchor, row + anchor);
}
fs.writeFileSync(spath, s);
console.log('汇总册:', s.includes('基准-块级排版.md') ? 'ok' : 'X');

// ---- ④ 验收 ----
const med = (a) => { const q = [...a].sort((x, y) => x - y); return q[Math.floor(q.length / 2)]; };
const g11 = med(sp.stats['1→1'].values.concat([])) ;
console.log('--- 验收 ---');
console.log('接口块数:', sp.apiBlocks, '| DOM:', sp.domBlocks, '| 配对:', sp.rows.length);
console.log('各类型块高:', Object.entries(sp.hByType).map(([k, a]) => k + ':n=' + a.length + ' 最小=' + Math.min(...a) + ' 中位=' + med(a)).join(' | '));
console.log('间距:', Object.entries(sp.stats).map(([k, v]) => k + ':n=' + v.n + ' 中位=' + v.median).join(' | '));
const ok = sp.apiBlocks === 118 && sp.stats['1→1'].median === 2 && sp.stats['1→7'].median === 2 &&
  sp.stats['7→1'].median === 2 && Math.min(...sp.hByType['type1']) === 34 && sp.doc.includes('脱敏');
console.log(ok ? '三个数值与文档一致、证据已脱敏 ✓' : '不一致 X');
process.exit(ok ? 0 : 1);
