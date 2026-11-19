/**
 * 一次性：找出四套图标库里都有、且语义合适的候选图标名（给搜索浮层用）。
 * 用法：node tools/probe-icons.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const SETS = ["lucide", "mingcute", "ph", "tabler"];

const want = ["user", "filter", "sort", "list", "clock", "text", "type", "heading", "toggle", "history", "letter", "align", "folder"];

for (const s of SETS) {
  const col = JSON.parse(readFileSync(resolve(appRoot, `node_modules/@iconify-json/${s}/icons.json`), "utf8"));
  const names = Object.keys(col.icons || {});
  console.log(`=== ${s} ===`);
  for (const w of want) {
    const f = names.filter((n) => n.includes(w)).slice(0, 6);
    if (f.length) console.log(`${w}: ${f.join(", ")}`);
  }
}
