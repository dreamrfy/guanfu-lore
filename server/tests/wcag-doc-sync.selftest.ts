// WCAG 文档同步自测（第二轮 N-13）
// 断言：docs/design/深浅色主题-v0.1.md 的「交互合成底」表与脚本输出逐行一致。
// 文档是给人看的，脚本是权威来源——表被手工改过而脚本没改时，这里必须失败。
// 用法: node tests/wcag-doc-sync.selftest.ts
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SERVER_ROOT = path.dirname(import.meta.dirname);
const PROJECT_ROOT = path.dirname(SERVER_ROOT);
const SCRIPT = path.join(PROJECT_ROOT, "scripts", "wcag-contrast.mjs");
const DOC = path.join(PROJECT_ROOT, "docs", "design", "深浅色主题-v0.1.md");

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

// 脚本被 import 时无副作用；这里直接调用它的纯函数（不启子进程）
const mod = (await import(pathToFileURL(SCRIPT).href)) as {
  compositeTable: () => string;
  analyse: () => { rows: Array<{ ratio: number; pass: boolean; exempt: boolean }>; failures: number };
};

const expected = mod
  .compositeTable()
  .split(/\r?\n/)
  .map((l) => l.trim());

const doc = fs.readFileSync(DOC, "utf8");
const block = doc.match(/<!-- BEGIN:composite-table -->([\s\S]*?)<!-- END:composite-table -->/);
check("文档里有合成底表格标记", !!block);
const actual = (block ? block[1] : "")
  .trim()
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l.length > 0);

check("表格行数一致", actual.length === expected.length, `文档 ${actual.length} 行 / 脚本 ${expected.length} 行`);

const max = Math.max(actual.length, expected.length);
for (let i = 0; i < max; i++) {
  const a = actual[i] ?? "(缺失)";
  const e = expected[i] ?? "(多余)";
  check(`第 ${i + 1} 行一致`, a === e, "\n  文档: " + a + "\n  脚本: " + e);
}

// 顺带确认脚本自身判定仍然全绿
const { failures } = mod.analyse();
check("脚本判定 0 个不合格组合", failures === 0, "failures=" + failures);

// §2.2 的「对比度区间」也必须与脚本一致（第二轮审计指出这里是旧值）
type TokenSet = Record<string, string>;
const api = mod as unknown as {
  LIGHT: TokenSet;
  DARK: TokenSet;
  backgrounds: (t: TokenSet, dark: boolean) => Array<[string, string]>;
  contrast: (a: string, b: string) => number;
};
function range(tokens: TokenSet, dark: boolean, key: string): string {
  const bgs = api.backgrounds(tokens, dark).map((x) => x[1]);
  const values = bgs.map((bg) => api.contrast(tokens[key]!, bg));
  return Math.min(...values).toFixed(2) + "–" + Math.max(...values).toFixed(2);
}
const ranges: Array<[string, string]> = [
  ["text.primary", range(api.LIGHT, false, "textPrimary") + " / " + range(api.DARK, true, "textPrimary")],
  ["text.secondary", range(api.LIGHT, false, "textSecondary") + " / " + range(api.DARK, true, "textSecondary")],
  ["text.placeholder", range(api.LIGHT, false, "textPlaceholder") + " / " + range(api.DARK, true, "textPlaceholder")],
  ["primary", range(api.LIGHT, false, "primary") + " / " + range(api.DARK, true, "primary")],
];
for (const [token, expectedRange] of ranges) {
  check(`§2.2 ${token} 区间与脚本一致（${expectedRange}）`, doc.includes(expectedRange), "文档缺少该区间");
}

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
