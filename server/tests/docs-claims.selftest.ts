// 文档口径自测（审计 P0-03 第 10 条）
// 目的：防止“文档宣称已跑通/已验证，但证据不存在”的话术回潮。
// 只做静态断言，不联网。
// 用法: node tests/docs-claims.selftest.ts
import fs from "node:fs";
import path from "node:path";

const SERVER_ROOT = path.dirname(import.meta.dirname);
const PROJECT_ROOT = path.dirname(SERVER_ROOT);

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

function read(relFromProject: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relFromProject), "utf8");
}

const files: Array<[string, string]> = [
  ["夜间执行报告", "ops/夜间执行报告.md"],
  ["服务端 README", "server/README.md"],
  ["接云清单", "docs/接云清单-v1.md"],
  ["开发状态", "开发状态.md"],
  ["设计 token", "docs/design/设计token-v0.1.md"],
  ["深浅色主题", "docs/design/深浅色主题-v0.1.md"],
  ["视觉规范", "docs/design/视觉规范-v0.1.md"],
  ["走查清单", "docs/design/视觉走查清单-v1.md"],
  ["真实感差距", "docs/design/真实感差距清单-v1.md"],
  ["字体与图标", "docs/design/字体与图标方案.md"],
];

const contents = new Map<string, string>();
for (const [label, rel] of files) {
  contents.set(rel, read(rel));
}

/** 不允许再出现的“过度宣称” */
const forbidden: Array<[RegExp, string]> = [
  [/5\s*条\s*complete/, "“5 条 complete”式全链证明"],
  [/全链已跑通/, "“全链已跑通”"],
  [/改动量\s*0\s*行/, "“改动量 0 行”"],
  [/0\s*行改动/, "“0 行改动”"],
  [/10\/10\s*(全覆盖|有对应)/, "图标“10/10 全覆盖”式结论"],
  [/零依赖/, "“零依赖”表述（已引入 sanitize-html）"],
];

for (const [label, rel] of files) {
  const text = contents.get(rel)!;
  for (const [re, why] of forbidden) {
    // 夜间执行报告是历史记录：其中引用的旧帮助输出允许保留“零依赖”，
    // 但结论性表述仍受其它规则约束。
    if (rel === "ops/夜间执行报告.md" && why.includes("零依赖")) continue;
    check(`${label} 不含「${why}」`, !re.test(text), "命中：" + (text.match(re) ?? [""])[0]);
  }
}

// 必须存在的“诚实口径”
const required: Array<[string, string, RegExp, string]> = [
  ["夜间执行报告", "ops/夜间执行报告.md", /整改后口径/, "缺少【整改后口径】标注"],
  ["夜间执行报告", "ops/夜间执行报告.md", /当时未接通|链路当时未接通|当时未/, "未说明当时链路状态"],
  ["服务端 README", "server/README.md", /pipeline-test/, "未列出离线全链命令"],
  ["服务端 README", "server/README.md", /尚未用真实凭证验证/, "未声明 poll 未用真实凭证验证"],
  ["接云清单", "docs/接云清单-v1.md", /约 20 行|≈20 行|需要改代码/, "未说明凭证注入需要改代码"],
  ["接云清单", "docs/接云清单-v1.md", /7 段|7 字段/, "cron 段数口径未写明"],
  ["接云清单", "docs/接云清单-v1.md", /已在仓库内/, "未说明抓取代码已在仓库内"],
  ["设计 token", "docs/design/设计token-v0.1.md", /text\.placeholder/, "未拆分 placeholder token"],
  ["深浅色主题", "docs/design/深浅色主题-v0.1.md", /合成底/, "未覆盖交互合成底"],
  ["视觉规范", "docs/design/视觉规范-v0.1.md", /查看进度/, "任务动作未按状态区分"],
  ["走查清单", "docs/design/视觉走查清单-v1.md", /未覆盖页清单/, "缺少未覆盖页清单"],
  ["字体与图标", "docs/design/字体与图标方案.md", /仍未核对/, "图标覆盖结论未标明未核对范围"],
];

for (const [label, rel, re, why] of required) {
  check(`${label}：${why}`, re.test(contents.get(rel)!));
}

// package.json 的 description 也要与依赖现状一致
const pkg = JSON.parse(read("server/package.json")) as { description?: string; dependencies?: Record<string, string> };
check("package.json 无“零依赖”表述", !/零依赖/.test(pkg.description ?? ""), pkg.description);
check("package.json 声明 sanitize-html", !!pkg.dependencies?.["sanitize-html"]);

// 帮助文字里的命令必须真的存在（CLI 与 README 同步）
const cli = fs.readFileSync(path.join(SERVER_ROOT, "src", "cli.ts"), "utf8");
for (const cmd of ["demo", "list", "pipeline-test", "ingest-messages", "poll"]) {
  check("CLI 帮助列出 " + cmd, cli.includes(cmd));
  check("CLI 实现了 " + cmd, cli.includes('if (cmd === "' + cmd + '"'));
}

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
