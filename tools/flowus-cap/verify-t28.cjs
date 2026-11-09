const fs = require('fs');
const REPO = 'E:/VBcoding/bijiapp';
const r = JSON.parse(fs.readFileSync(REPO + '/docs/基准/证据/M0-T28/block-types4.json', 'utf8'));
const steps = r.steps;
console.log('尝试目标数:', steps.length);
for (const s of steps) {
  console.log(`  ${s.label.padEnd(8)} 菜单${(s.menuItems && s.menuItems.length) || 0}项 testId=${s.hasTestId} 新增=${JSON.stringify(s.added)} 类型变=${JSON.stringify(s.changed)}`);
}
const found = {};
if (steps[0] && steps[0].added && steps[0].added.length) found['折叠列表'] = steps[0].added[0];
if (steps[1] && steps[1].changed && steps[1].changed.length) found['折叠标题'] = steps[1].changed[0].to;
if (steps[2] && steps[2].changed && steps[2].changed.length) found['简单表格'] = steps[2].changed[0].to;
const cells = steps[2] && steps[2].added ? steps[2].added.filter((t) => t === 28).length : 0;
console.log('映射:', JSON.stringify(found), '| 表格单元格 28 数量:', cells);

const noMenu = steps.filter((s) => s.menuItems && s.menuItems.length === 0).map((s) => s.label);
console.log('过滤后 0 项的目标:', noMenu.join(',') || '无');

const doc = fs.readFileSync(REPO + '/docs/基准/基准-块类型总表.md', 'utf8');
const claims = ['折叠列表', '折叠标题', '简单表格', '27', '38', '6'];
const miss = claims.filter((c) => !doc.includes(c));
console.log('总表缺失项:', miss.length ? miss.join(',') : '无');

const allNoTestId = steps.every((s) => s.hasTestId === false);
console.log('斜杠菜单项全都无 testId:', allNoTestId);

const ok = found['折叠列表'] === 6 && found['折叠标题'] === 38 && found['简单表格'] === 27 &&
  cells === 3 && miss.length === 0 && allNoTestId && noMenu.length === 4;
console.log(ok ? '三个新映射/单元格数/无testId/4个0项目标 全部与文档一致 OK' : '不一致 X');
process.exit(ok ? 0 : 1);
