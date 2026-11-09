const fs = require('fs');
const P = 'E:/VBcoding/bijiapp/开发任务表-v3.0-FlowUs复刻版.md';
let t = fs.readFileSync(P, 'utf8');
const lines = t.split('\n');

// 找 M0-T13 那一行
const idx = lines.findIndex((l) => l.startsWith('| M0-T13 |'));
if (idx < 0) { console.log('X 未找到 M0-T13 行'); process.exit(1); }
const row13 = lines[idx];
console.log('原 T13 行:', row13.slice(0, 80) + '...');

// 新行：编号改 36，状态改成 TODO（可被领取），并明确"必须是 M0 最后一项"
const newRow = row13
  .replace('| M0-T13 |', '| M0-T36 |')
  .replace(/\| ⛔[^|]*\|$/, '| TODO（**M0 的最后一项**：等 M0-T35 完成后执行；它就是模块收口，会产出「📦 模块 M0 已完成 · 待用户验收」） |');

// 删掉原行
lines.splice(idx, 1);
// 找 M0-T35 行，插到它后面
const i35 = lines.findIndex((l) => l.startsWith('| M0-T35 |'));
if (i35 < 0) { console.log('X 未找到 M0-T35 行'); process.exit(1); }
lines.splice(i35 + 1, 0, newRow);

fs.writeFileSync(P, lines.join('\n'));
const out = lines.join('\n');
console.log('新 T36 行:', newRow.slice(0, 90) + '...');
console.log('T13 还残留:', out.includes('| M0-T13 |'));
console.log('T36 已就位:', out.includes('| M0-T36 |'));
// 打印 M0 任务编号顺序（最后 5 个）
const ids = (out.match(/^\| M0-T\d+ /gm) || []).map((s) => s.trim().split(' ')[1]);
console.log('M0 编号顺序(末 6):', ids.slice(-6).join(' → '), '| 总数:', ids.length);