/**
 * FlowUs 调色板对比度核验（M0-T03 浅色 / M0-T14 深色）
 *
 * 色值来自真 FlowUs 实测（见 docs/基准/基准-色彩.md），不是设计稿抄的。
 * 深色板由 M0-T14 通过模拟 prefers-color-scheme: dark 实测得到。
 * 判定口径：WCAG 2.1 —— 正文 4.5:1，大字号（≥18.66px 粗体 或 ≥24px）3:1。
 *
 * 用法：
 *   node contrast.mjs            # 浅色
 *   node contrast.mjs --dark     # 深色
 *   node contrast.mjs --markdown
 *   node contrast.mjs --strict   # 有不达标时退出码 1
 */
const T_NORMAL = 4.5;
const T_LARGE = 3.0;
const MODE = process.argv.includes('--dark') ? 'dark' : 'light';

// ---- 实测色板 ----
const LIGHT = {
  primary: '#0285FF',        // active_color 基色 rgb(2,133,255)
  bgContent: '#FFFFFF',      // bg-white / bg-white1
  bgAside: '#F7F7F7',        // bg-aside 侧栏底
  textMain: '#37352F',       // text-t2 正文
  textSub: '#5F5E5B',        // text-grey2 / text-t2-medium 次级
  textTertiary: '#91918E',   // text-grey3 / text-t4-medium 三级（占位/禁用）
  textBlack: '#000000',      // text-black / text-h4 标题·选中
  borderDefault: '#E5E5E5',  // 出现 307 次，默认边框
  borderAside: '#F0F0F0',    // border-grey7 侧栏右边框
  borderStrong: '#E0E0E0',   // border-grey5
  hoverOverlay: '#000000',   // bg-black_006 = 黑 6%
  hoverAlpha: 0.06,
  selectOverlay: '#0285FF',  // bg-active_color_10 = 主色 10%
  selectAlpha: 0.10,
};

const DARK = {
  primary: '#0285FF',        // 主色在深色下不变（实测）
  bgContent: '#191919',      // bg-white1 → rgb(25,25,25)
  bgAside: '#202020',        // bg-aside  → rgb(32,32,32)
  textMain: '#D4D4D4',       // text-t2 / text-black → rgb(212,212,212)
  textSub: '#A0A0A0',        // text-grey2 / t2-medium → rgb(160,160,160)
  textTertiary: '#717171',   // text-grey3 / t4-medium → rgb(113,113,113)
  textBlack: '#D4D4D4',      // 深色下 "black" 也是 #D4D4D4（语义是"最强文字"）
  borderDefault: '#2E2E2E',  // grey6 → rgb(46,46,46)
  borderAside: '#2E2E2E',    // grey7 → rgb(46,46,46)
  borderStrong: '#363636',   // grey5 → rgb(54,54,54)
  hoverOverlay: '#FFFFFF',   // ★ 深色下变成白 6%
  hoverAlpha: 0.06,
  selectOverlay: '#0285FF',
  selectAlpha: 0.10,
};
const C = MODE === 'dark' ? DARK : LIGHT;

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (f, b) => {
  const L1 = lum(hex2rgb(f)), L2 = lum(hex2rgb(b));
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
};
// 把带透明度的前景/背景合成到实底上
const over = (fgHex, alpha, bgHex) => {
  const f = hex2rgb(fgHex), b = hex2rgb(bgHex);
  const mix = f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)));
  return '#' + mix.map((v) => v.toString(16).padStart(2, '0')).join('');
};
const toHex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

const BLACK = '#000000';
const HOVER = over(C.hoverOverlay, C.hoverAlpha, C.bgContent);   // 悬停底：浅色=黑6% / 深色=白6%
const SELECT = over(C.selectOverlay, C.selectAlpha, C.bgContent); // 选中底：主色 10% 叠在内容底上

const pairs = [
  ['正文 on 内容底', C.textMain, C.bgContent, T_NORMAL],
  ['正文 on 侧栏底', C.textMain, C.bgAside, T_NORMAL],
  ['正文 on 悬停底', C.textMain, HOVER, T_NORMAL],
  ['正文 on 选中底', C.textMain, SELECT, T_NORMAL],
  ['次级 on 内容底', C.textSub, C.bgContent, T_NORMAL],
  ['次级 on 侧栏底', C.textSub, C.bgAside, T_NORMAL],
  ['次级 on 悬停底', C.textSub, HOVER, T_NORMAL],
  ['次级 on 选中底', C.textSub, SELECT, T_NORMAL],
  ['三级 on 内容底', C.textTertiary, C.bgContent, T_NORMAL],
  ['三级 on 侧栏底', C.textTertiary, C.bgAside, T_NORMAL],
  ['黑标题 on 内容底', C.textBlack, C.bgContent, T_NORMAL],
  ['主色文字 on 内容底', C.primary, C.bgContent, T_NORMAL],
  ['主色文字 on 侧栏底', C.primary, C.bgAside, T_NORMAL],
  ['白字 on 主色（实心按钮）', '#FFFFFF', C.primary, T_NORMAL],
  ['白字 on 主色（大字号按钮）', '#FFFFFF', C.primary, T_LARGE],
  ['边框默认 vs 内容底（非文字，仅参考）', C.borderDefault, C.bgContent, 1],
  ['边框侧栏 vs 侧栏底（非文字，仅参考）', C.borderAside, C.bgAside, 1],
];

const rows = pairs.map(([label, fg, bg, need]) => {
  const r = ratio(fg, bg);
  return { label, fg, bg, need, ratio: r, pass: r >= need };
});

if (process.argv.includes('--markdown')) {
  console.log('| 组合 | 前景 | 背景 | 对比度 | 判定 |');
  console.log('| --- | --- | --- | --- | --- |');
  rows.forEach((x) => console.log(`| ${x.label} | \`${x.fg}\` | \`${x.bg}\` | ${x.ratio.toFixed(2)} | ${x.pass ? '达标' : '不达标'} |`));
} else {
  console.log('组合'.padEnd(34) + '前景'.padEnd(10) + '背景'.padEnd(10) + '对比度'.padEnd(8) + '阈值'.padEnd(6) + '判定');
  console.log('-'.repeat(84));
  rows.forEach((x) =>
    console.log(x.label.padEnd(34) + x.fg.padEnd(10) + x.bg.padEnd(10) + x.ratio.toFixed(2).padEnd(8) + String(x.need).padEnd(6) + (x.pass ? '达标' : '❌ 不达标'))
  );
  const textRows = rows.filter((r) => r.need > 1);
  const fails = textRows.filter((r) => !r.pass);
  const min = Math.min(...textRows.map((r) => r.ratio));
  console.log(`\n文字级组合 ${textRows.length} 个，最低 ${min.toFixed(2)}`);
  console.log(fails.length === 0 ? '全部达标' : `不达标 ${fails.length} 个：${fails.map((f) => f.label).join('、')}`);
}

// 默认退出码 0：不达标是"FlowUs 自身的事实"，不是本次交付缺陷；加 --strict 才用退出码表达
process.exit(process.argv.includes('--strict') && rows.filter((r) => r.need > 1 && !r.pass).length ? 1 : 0);
