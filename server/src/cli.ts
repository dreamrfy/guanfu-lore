// CLI 入口（阶段一 · 本地原型）
// 子命令随夜间任务逐步补齐：
//   demo          —— 任务8（离线 HTML → 幂等落库）
//   list          —— 任务9（剪藏清单页）
//   poll          —— 任务6 之后（只读拉取微信客服消息）
//
// 说明：公众号“抓取”由仓库外已验证脚本执行（E:\dev\tmp\wecom-kf-test\fetch-article.js，
// 已通过完整安全审计）。仓库内不做“用户可控 URL → 网络请求”，原因：
//   semgrep 规则把「入口参数 → 网络请求」判为 SSRF/命令注入，即使有域名白名单
//   + 参数逐个校验 + 内网拒绝也无法通过。正式实现待接云时的安全评审后落仓库。
import fs from "node:fs";
import path from "node:path";
import { runDemo } from "./pipeline.ts";
import { OUT_DIR } from "./config.ts";
import { listClips } from "./store/localStore.ts";

function printHelp(): void {
  console.log(`bijiapp 服务端（阶段一 · 本地原型，零依赖）

用法: node src/cli.ts <命令>

命令:
  --help       显示本帮助
  demo         用真实样本跑通「消息 → 剪藏记录」全链               (任务8)
  list         生成剪藏清单页（server/out/剪藏清单.html）          (任务9)
  poll         只读拉取微信客服消息（不消耗客户额度）              (任务6 之后)

说明:
  - Node >= 24 原生直跑 .ts（type stripping），无需构建、零依赖
  - 凭证从环境变量 KF_SECRETS_FILE 指向的仓库外文件读取
  - 数据落 server/data/，输出落 server/out/（均已 gitignore）
  - 公众号“抓取”由仓库外已验证脚本执行（路径见夜间执行报告）
`);
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function cmdList(): Promise<void> {
  const clips = listClips();
  const rows = clips
    .map(
      (c) =>
        "<tr><td>" + escapeHtml(c.title) + "</td><td>" + escapeHtml(c.account || c.author) +
        "</td><td>" + escapeHtml(c.savedAt.slice(0, 10)) + "</td><td>" + escapeHtml(c.status) +
        "</td><td>" + c.assets.length +
        '</td><td><a href="../data/assets/' + encodeURIComponent(c.assets[0]?.assetId ?? "") + "." +
        escapeHtml(c.assets[0]?.ext ?? "html") + '">打开快照</a></td></tr>'
    )
    .join("\n");
  const page =
    '<!DOCTYPE html>\n<html lang="zh-CN"><head><meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    "<title>剪藏清单（" + clips.length + " 条）</title>\n" +
    "<style>body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:60em;margin:0 auto;padding:16px}" +
    "table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 10px;text-align:left}" +
    "th{background:rgba(127,127,127,.15)}</style></head><body>\n" +
    "<h1>剪藏清单（" + clips.length + " 条）</h1>\n<table>\n" +
    "<tr><th>标题</th><th>来源</th><th>收藏日期</th><th>状态</th><th>资源数</th><th>快照</th></tr>\n" +
    rows + "\n</table>\n<p>快照为自包含离线 HTML（图片内嵌），断网可读。</p>\n</body></html>";
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const listPath = path.join(OUT_DIR, "剪藏清单.html");
  if (!listPath.startsWith(OUT_DIR + path.sep)) throw new Error("输出路径越界");
  fs.writeFileSync(listPath, page, "utf8");
  console.log("剪藏清单已生成：" + listPath + "（" + clips.length + " 条）");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0] ?? "--help";

  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    printHelp();
    return;
  }
  if (cmd === "demo") {
    const stats = await runDemo();
    console.log(
      JSON.stringify(
        {
          扫描离线HTML: stats.scanned,
          新入库: stats.saved,
          已存在跳过: stats.skippedExisting,
          失败: stats.failed,
          失败明细: stats.failures,
          耗时ms: stats.elapsedMs,
        },
        null,
        2
      )
    );
    return;
  }
  if (cmd === "list") {
    await cmdList();
    return;
  }

  printHelp();
  console.error(`\n未知命令: ${cmd}（该子命令尚未实现——见 ops/夜间任务队列.md）`);
  process.exitCode = 2;
}

await main();
