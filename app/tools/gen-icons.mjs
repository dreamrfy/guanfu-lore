/**
 * 只打包"用得到的"图标
 *
 * 问题：四套图标库整包约 12MB，全量打进产物会让网页版打开极慢。
 * 做法：读取 src/design/icons.tsx 里的 ICONS 映射表，只把映射表里出现的图标定义抽出来，
 *       生成 src/design/icons.generated.json（一个合并的小集合）。
 * 结果：产物里只有"语义名 × 4 套库"这几十个图标。
 *
 * 用法：node tools/gen-icons.mjs（已挂在 predev / prebuild 上，平时不用手动跑）
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const SETS = ["lucide", "mingcute", "ph", "tabler"];

const source = readFileSync(resolve(appRoot, "src/design/icons.tsx"), "utf8");
const block = source.match(/export const ICONS = \{([\s\S]*?)\n\} as const satisfies/);
if (!block) {
  console.error("✗ 没能在 icons.tsx 里定位 ICONS 映射表");
  process.exit(1);
}

/** 收集：setId -> 需要的图标名 */
const needed = Object.fromEntries(SETS.map((s) => [s, new Set()]));
for (const line of block[1].split("\n")) {
  const m = line.match(/^\s*[A-Za-z]+:\s*\{(.*)\},\s*$/);
  if (!m) continue;
  for (const [, set, iconName] of m[1].matchAll(/([a-z]+):\s*"([^"]+)"/g)) {
    needed[set]?.add(iconName);
  }
}

/** 把别名解析到真正的图标定义（别名可能再指向别名，最多跟 5 层） */
function resolveIcon(col, name, depth = 0) {
  if (depth > 5) return null;
  const dir = col.icons?.[name];
  if (dir) return dir;
  const alias = col.aliases?.[name];
  if (alias?.parent) return resolveIcon(col, alias.parent, depth + 1);
  return null;
}

const out = {};
let total = 0;

for (const set of SETS) {
  const col = JSON.parse(readFileSync(resolve(appRoot, `node_modules/@iconify-json/${set}/icons.json`), "utf8"));
  const icons = {};
  for (const name of needed[set]) {
    const def = resolveIcon(col, name);
    if (!def) {
      console.error(`✗ ${set}:${name} 解析失败`);
      process.exit(1);
    }
    icons[name] = def;
    total++;
  }
  out[set] = {
    prefix: set,
    ...(col.width ? { width: col.width } : {}),
    ...(col.height ? { height: col.height } : {}),
    icons,
  };
}

const target = resolve(appRoot, "src/design/icons.generated.json");
writeFileSync(target, JSON.stringify(out), "utf8");
console.log(`✓ 生成 ${target.replace(appRoot, ".")}：${total} 个图标（${SETS.length} 套库 × 语义名）`);
