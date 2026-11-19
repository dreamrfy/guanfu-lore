/**
 * 设计令牌守卫：禁止组件层直接写死颜色值。
 *
 * 规则（依据 docs/复刻/14-前端设计规范-总纲.md §1「禁止组件直接写十六进制」）：
 *  - 颜色一律引用 var(--gf-*)；
 *  - 原始色值只允许出现在 styles/tokens.css 与 styles/index.css 的令牌定义里；
 *  - 组件代码（.ts/.tsx）里不允许出现十六进制色或 rgb()/rgba()/hsl()。
 *
 * 例外目录：src/styles（令牌定义本身）、src/design（设计系统代码与生成物）
 *
 * 用法: node tools/check-tokens.mjs
 * 接在 npm run check 里，作为 lint 式关卡。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const SRC = join(here, "..", "src");

/** 允许写死颜色的顶层目录（相对 src） */
const ALLOWED = new Set(["styles", "design"]);

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const violations = [];
for (const file of walk(SRC)) {
  const rel = relative(SRC, file).replace(/\\/g, "/");
  if (ALLOWED.has(rel.split("/")[0])) continue;

  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    if (COLOR_LITERAL.test(line)) violations.push(`${rel}:${i + 1}  ${trimmed.slice(0, 100)}`);
  });
}

if (violations.length) {
  console.error(`✗ 组件里出现了 ${violations.length} 处写死的颜色值，请改用 var(--gf-*)：`);
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}

// 令牌完整性
const tokens = readFileSync(join(SRC, "styles", "tokens.css"), "utf8");
const REQUIRED = [
  "--gf-bg-app",
  "--gf-bg-sidebar",
  "--gf-bg-surface",
  "--gf-bg-hover",
  "--gf-text-primary",
  "--gf-text-secondary",
  "--gf-text-tertiary",
  "--gf-text-inverse",
  "--gf-border",
  "--gf-primary",
  "--gf-accent",
  "--gf-success",
  "--gf-warning",
  "--gf-danger",
  "--gf-info",
  "--gf-font-ui",
  "--gf-radius-md",
  "--gf-shadow-md",
  "--gf-duration-base",
  "--gf-z-modal",
];
const missing = REQUIRED.filter((v) => !tokens.includes(`${v}:`));
if (missing.length) {
  console.error(`✗ tokens.css 缺少必需令牌：${missing.join(", ")}`);
  process.exit(1);
}

const darkBlock = tokens.slice(tokens.indexOf('html[data-theme="dark"]'));
const DARK_REQUIRED = [
  "--gf-bg-app",
  "--gf-bg-sidebar",
  "--gf-bg-surface",
  "--gf-text-primary",
  "--gf-text-secondary",
  "--gf-text-tertiary",
  "--gf-border",
  "--gf-primary",
];
const darkMissing = DARK_REQUIRED.filter((v) => !darkBlock.includes(`${v}:`));
if (darkMissing.length) {
  console.error(`✗ 深色主题缺少令牌覆盖：${darkMissing.join(", ")}`);
  process.exit(1);
}

console.log(`✓ 令牌守卫通过：无写死颜色，${REQUIRED.length} 个必需令牌齐备，深色覆盖完整`);
