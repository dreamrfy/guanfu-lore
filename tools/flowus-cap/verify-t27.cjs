const fs = require('fs');
const REPO = 'E:/VBcoding/bijiapp';
const b = JSON.parse(fs.readFileSync(REPO + '/docs/基准/证据/M0-T27/blocks3.json', 'utf8'));
const seq = b['3 块序列'];
const got = seq.map((x) => x.type);
const exp = [0, 1, 7, 7, 7, 7, 4, 5, 12, 9, 1, 25];
console.log('块序列 type:', seq.map((x) => x.type + (x.level !== null ? '/lv' + x.level : '')).join(' '));
console.log('与文档声称顺序一致:', JSON.stringify(got) === JSON.stringify(exp));

const lv = seq.filter((x) => x.type === 7).map((x) => x.level);
console.log('标题 level:', JSON.stringify(lv), '| 应为 [1,2,3,4]:', JSON.stringify(lv) === '[1,2,3,4]');

const empty = seq.find((x) => x.type === 1 && x.len === 0);
console.log('空段落存在:', !!empty);

const pairs = b['5 配对'];
const heights = {};
for (const p of pairs) {
  if (p.type === 7) heights['lv' + p.level] = p.h;
}
console.log('标题块高:', JSON.stringify(heights));
const dec = heights.lv1 > heights.lv2 && heights.lv2 >= heights.lv3 && heights.lv3 > heights.lv4;
console.log('标题块高递减:', dec);

const lay = JSON.parse(fs.readFileSync(REPO + '/docs/基准/证据/M0-T27/layout.json', 'utf8'));
// 只比"字号/行高/字重"，不比元素计数（计数受菜单开合影响，是测量噪声）
const tops = lay.steps.map((s) => String(s.top[0] && s.top[0][0]));
console.log('布局三档首项(字号/行高/字重):', tops.join(' | '));
const same = tops[0] === tops[1] && tops[1] === tops[2];
console.log('三档字号行高完全相同:', same);

const ok = JSON.stringify(got) === JSON.stringify(exp) && JSON.stringify(lv) === '[1,2,3,4]' && !!empty && dec && same;
console.log(ok ? '块序列/标题分级/空块/标题递减/布局无差异 全部与文档一致 OK' : '不一致 X');
process.exit(ok ? 0 : 1);
