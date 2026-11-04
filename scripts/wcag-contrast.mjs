#!/usr/bin/env node
// WCAG 2.1 对比度核验脚本（可复跑）
//
// 用法: node scripts/wcag-contrast.mjs
// 退出码: 0 = 全部达标；1 = 有组合低于 4.5（禁用态除外）
//
// 覆盖范围（这是本次整改的重点）：
//   1) 静态底：bg.app / bg.sidebar / bg.content
//   2) 交互合成底：hover（4% 黑 / 深色 6% 白）与 selected（蓝色叠加）叠在上述底色上
//   3) 状态标签：底/字配对
//   4) 深色主题全部组合
// 旧版只测静态底，因此“交互态掉到 4.1”没被发现。

const THRESHOLD = 4.5;

const hex = (h) => {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
const linear = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminance = (rgb) => 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
const contrast = (fg, bg) => {
  const a = luminance(hex(fg));
  const b = luminance(hex(bg));
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
};
/** 半透明层叠在底色上后的实际颜色 */
const over = (fg, alpha, bg) => {
  const f = hex(fg);
  const b = hex(bg);
  return (
    "#" +
    f
      .map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0"))
      .join("")
  );
};

const LIGHT = {
  bgApp: "#f7f6f3",
  bgSidebar: "#fbfaf7",
  bgContent: "#ffffff",
  textPrimary: "#1f2937",
  textSecondary: "#5c6670",
  textPlaceholder: "#5c6670",
  textDisabled: "#9ca3af",
  primary: "#1d4ed8",
  onPrimary: "#ffffff",
};
const DARK = {
  bgApp: "#1f1f1e",
  bgSidebar: "#262625",
  bgContent: "#2a2a29",
  textPrimary: "#e5e5e3",
  textSecondary: "#a3a3a1",
  textPlaceholder: "#a3a3a1",
  textDisabled: "#6b6b69",
  primary: "#60a5fa",
  onPrimary: "#1f1f1e",
};

const STATUS_LIGHT = [
  ["saved/generated", "#e8f5e9", "#2e7d32"],
  ["reading", "#e3f2fd", "#1565c0"],
  ["processing", "#fff8e1", "#b45309"],
  ["failed", "#fdecea", "#c62828"],
  ["neutral", "#f0efec", "#616159"],
];
const STATUS_DARK = [
  ["saved/generated", "#1b3d1e", "#a5d6a7"],
  ["reading", "#0d2a3d", "#90caf9"],
  ["processing", "#3d2e0d", "#ffcc80"],
  ["failed", "#4d1a18", "#ef9a9a"],
  ["neutral", "#333332", "#b0b0ae"],
];

/** 生成某主题下的所有背景（静态 + 交互合成） */
function backgrounds(t, dark) {
  const hoverFg = dark ? "#ffffff" : "#000000";
  const selFg = dark ? "#60a5fa" : "#1d4ed8";
  const hoverAlpha = dark ? 0.06 : 0.04;
  const selAlpha = dark ? 0.12 : 0.1;
  const out = [
    ["bg.app", t.bgApp],
    ["bg.sidebar", t.bgSidebar],
    ["bg.content", t.bgContent],
  ];
  for (const [name, base] of [["app", t.bgApp], ["sidebar", t.bgSidebar], ["content", t.bgContent]]) {
    out.push(["hover-over-" + name, over(hoverFg, hoverAlpha, base)]);
    out.push(["selected-over-" + name, over(selFg, selAlpha, base)]);
  }
  return out;
}

let failures = 0;
const rows = [];

function evaluate(label, fg, bg, exempt = false) {
  const ratio = contrast(fg, bg);
  const pass = exempt || ratio >= THRESHOLD;
  if (!pass) failures += 1;
  rows.push({ label, fg, bg, ratio, pass, exempt });
}

for (const [themeName, tokens, dark] of [
  ["浅色", LIGHT, false],
  ["深色", DARK, true],
]) {
  const bgs = backgrounds(tokens, dark);
  for (const [bgName, bg] of bgs) {
    evaluate(`${themeName} · text.primary / ${bgName}`, tokens.textPrimary, bg);
    evaluate(`${themeName} · text.secondary / ${bgName}`, tokens.textSecondary, bg);
    evaluate(`${themeName} · primary / ${bgName}`, tokens.primary, bg);
    // 占位文字按普通文字要求（不套禁用豁免）：输入框可能出现在内容区/应用底，
    // 这里对全部背景一并核验，避免口径含糊。
    evaluate(`${themeName} · text.placeholder / ${bgName}`, tokens.textPlaceholder, bg);
    // 禁用态按 WCAG 对 inactive 控件豁免
    evaluate(`${themeName} · text.disabled / ${bgName}`, tokens.textDisabled, bg, true);
  }
  evaluate(`${themeName} · 主按钮文字 / primary`, tokens.onPrimary, tokens.primary);
}

for (const [label, bg, fg] of STATUS_LIGHT) evaluate(`浅色 · 状态标签 ${label}`, fg, bg);
for (const [label, bg, fg] of STATUS_DARK) evaluate(`深色 · 状态标签 ${label}`, fg, bg);

// 输出：只打印未豁免的组合（禁用态单独汇总）
console.log("组合".padEnd(46) + "前景".padEnd(10) + "背景".padEnd(10) + "对比度");
console.log("-".repeat(80));
for (const r of rows) {
  if (r.exempt) continue;
  const flag = r.pass ? "✓" : "✗";
  console.log(
    (r.label + " " + flag).padEnd(46) + r.fg.padEnd(10) + r.bg.padEnd(10) + r.ratio.toFixed(2)
  );
}

const exemptRows = rows.filter((r) => r.exempt);
const minExempt = Math.min(...exemptRows.map((r) => r.ratio));
console.log(`\n禁用态（WCAG 豁免，仅供参考）：最低 ${minExempt.toFixed(2)}`);

const checked = rows.filter((r) => !r.exempt);
const min = Math.min(...checked.map((r) => r.ratio));
console.log(`参与判定组合：${checked.length} 个，最低 ${min.toFixed(2)}，阈值 ${THRESHOLD}`);

if (failures > 0) {
  console.error(`\n❌ 有 ${failures} 个组合低于 ${THRESHOLD}`);
  process.exit(1);
}
console.log("\n✅ 全部达标");
