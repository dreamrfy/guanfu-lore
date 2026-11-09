/**
 * 从元素几何数据里反推 FlowUs 的调色板（M0-T03 用）
 *
 * FlowUs 不用 CSS 变量，配色是编译进 Tailwind 工具类的（bg-aside / text-t1 / border-grey7 …）。
 * 所以从「class 名 → 计算样式」反推，才能拿到"语义名 → 色值"的对应关系。
 *
 * 用法：node palette.mjs <elements.json 路径> [--out <json 输出路径>]
 */
import fs from 'node:fs';

const src = process.argv[2];
if (!src) { console.error('用法: node palette.mjs <elements.json> [--out <json>]'); process.exit(1); }
const outIdx = process.argv.indexOf('--out');
const outPath = outIdx > -1 ? process.argv[outIdx + 1] : null;

const data = JSON.parse(fs.readFileSync(src, 'utf8'));
const els = data.elements || [];

const PREFIX = { bg: 'background', text: 'color', border: 'borderColor', fill: 'background', ring: 'borderColor', divide: 'borderColor' };
// 这些后缀是排版/布局工具类，不是颜色
const NOT_COLOR = new Set(['left', 'right', 'center', 'justify', 'start', 'end', 'ellipsis', 'clip', 'wrap', 'nowrap', 'balance', 'pretty', 'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl']);
const map = {}; // token -> { kind, values: {value: count}, sampleClass }

const norm = (v) => {
  if (!v) return null;
  if (v === 'rgba(0, 0, 0, 0)' || v === 'none' || v === 'transparent') return null;
  return v.replace(/,\s+/g, ',');
};

for (const e of els) {
  const cls = e.cls || '';
  const st = e.style || {};
  for (const raw of cls.split(/\s+/)) {
    const m = /^(bg|text|border|fill|ring|divide)-(.+)$/.exec(raw);
    if (!m) continue;
    const kind = m[1];
    const name = m[2].replace(/\/\d+$/, ''); // 去掉 /50 之类的透明度后缀
    if (NOT_COLOR.has(name)) continue;
    const val = norm(st[PREFIX[kind]]);
    if (!val) continue;
    const key = kind + '-' + name;
    map[key] = map[key] || { kind, name, values: {}, sampleClass: raw };
    map[key].values[val] = (map[key].values[val] || 0) + 1;
  }
}

// 纯色值频次（不依赖 class，兜底看整体用色）
const freq = {};
for (const e of els) {
  const st = e.style || {};
  for (const k of ['background', 'color', 'borderColor']) {
    const v = norm(st[k]);
    if (!v) continue;
    freq[k] = freq[k] || {};
    freq[k][v] = (freq[k][v] || 0) + 1;
  }
}

const report = { source: src, elementCount: els.length, tokens: {}, byValueFreq: {} };
const conflicts = [];
for (const [key, v] of Object.entries(map)) {
  const vals = Object.entries(v.values).sort((a, b) => b[1] - a[1]);
  report.tokens[key] = { kind: v.kind, value: vals[0][0], hits: vals[0][1], variants: vals.length - 1, sampleClass: v.sampleClass };
  if (vals.length > 1) conflicts.push(`${key}: ${vals.map((x) => x[0] + '(' + x[1] + ')').join(' vs ')}`);
}
for (const [k, o] of Object.entries(freq)) {
  report.byValueFreq[k] = Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 25);
}

console.log('=== 语义 token（class → 色值）===');
const group = {};
for (const [k, v] of Object.entries(report.tokens)) (group[v.kind] = group[v.kind] || []).push([k, v]);
for (const kind of ['bg', 'text', 'border', 'fill', 'ring', 'divide']) {
  if (!group[kind]) continue;
  console.log(`\n[${kind}]`);
  group[kind].sort((a, b) => b[1].hits - a[1].hits).forEach(([k, v]) => {
    console.log(`  ${k.padEnd(28)} ${String(v.value).padEnd(26)} hits=${v.hits}${v.variants ? ' ⚠变体' + v.variants : ''}`);
  });
}
if (conflicts.length) {
  console.log('\n=== 一 token 多值（需要按上下文区分，多是 hover/选中态）===');
  conflicts.slice(0, 25).forEach((c) => console.log('  ' + c));
}
console.log('\n=== 出现最多的色值（不依赖 class）===');
for (const [k, arr] of Object.entries(report.byValueFreq)) {
  console.log(`  ${k}: ${arr.slice(0, 10).map(([v, n]) => v + '(' + n + ')').join(', ')}`);
}
console.log(`\ntoken 总数: ${Object.keys(report.tokens).length} | 元素: ${els.length}`);

if (outPath) { fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); console.log('已写出:', outPath); }
