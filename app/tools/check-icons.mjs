/**
 * 校验图标映射：确认 src/design/icons.tsx 里每个语义名在四套图标库里都真实存在。
 * 用法：node tools/check-icons.mjs
 * 为什么需要：Iconify 找不到图标名时是"静默空白"，不会报错——只有脚本能提前揪出来。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");

const SETS = ["lucide", "mingcute", "ph", "tabler"];

const collections = Object.fromEntries(
  SETS.map((s) => [s, JSON.parse(readFileSync(resolve(appRoot, `node_modules/@iconify-json/${s}/icons.json`), "utf8"))])
);

const source = readFileSync(resolve(appRoot, "src/design/icons.tsx"), "utf8");
const block = source.match(/export const ICONS = \{([\s\S]*?)\n\} as const satisfies/);
if (!block) {
  console.error("✗ 没能在 icons.tsx 里定位 ICONS 映射表");
  process.exit(1);
}

let checked = 0;
const problems = [];

for (const line of block[1].split("\n")) {
  const m = line.match(/^\s*([A-Za-z]+):\s*\{(.*)\},\s*$/);
  if (!m) continue;
  const semantic = m[1];
  const pairs = [...m[2].matchAll(/([a-z]+):\s*"([^"]+)"/g)];
  for (const [, set, iconName] of pairs) {
    const col = collections[set];
    if (!col) {
      problems.push(`${semantic} → ${set}: 未知图标库`);
      continue;
    }
    const exists = Boolean(col.icons?.[iconName] || col.aliases?.[iconName]);
    checked++;
    if (!exists) problems.push(`${semantic} → ${set}:${iconName} 不存在`);
  }
}

console.log(`检查了 ${checked} 条映射（语义名 × ${SETS.length} 套图标库）`);
if (problems.length === 0) {
  console.log("✓ 全部图标名都存在");
} else {
  console.log("✗ 有问题：");
  problems.forEach((p) => console.log("  - " + p));
  process.exit(1);
}
