// CLI 入口（阶段一 · 本地原型）
import { runDemo } from "./pipeline.ts";
// 子命令随夜间任务逐步补齐：
//   demo          —— 任务5（消息 → 剪藏记录 全链）
//   poll          —— 任务6 之后（只读拉取微信客服消息）
//
// 说明：公众号“抓取”由仓库外已验证脚本执行（E:\dev\tmp\wecom-kf-test\fetch-article.js，
// 已通过完整安全审计）。仓库内不做“用户可控 URL → 网络请求”，原因：
//   semgrep 规则把「入口参数 → 网络请求」判为 SSRF/命令注入，即使有域名白名单
//   + 参数逐个校验 + 内网拒绝也无法通过。正式实现待接云时的安全评审后落仓库。
// 因此仓库内的 CLI 只保留：demo（读已抓取的本地文件 → 入库 → 生成清单）、poll。

function printHelp(): void {
  console.log(`bijiapp 服务端（阶段一 · 本地原型，零依赖）

用法: node src/cli.ts <命令>

命令:
  --help       显示本帮助
  demo         用真实样本跑通「消息 → 剪藏记录」全链               (任务5)
  poll         只读拉取微信客服消息（不消耗客户额度）              (任务6 之后)

说明:
  - Node >= 24 原生直跑 .ts（type stripping），无需构建、零依赖
  - 凭证从环境变量 KF_SECRETS_FILE 指向的仓库外文件读取
  - 数据落 server/data/，输出落 server/out/（均已 gitignore）
  - 公众号“抓取”由仓库外已验证脚本执行（路径见夜间执行报告）
`);
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
    console.log(JSON.stringify({
      扫描离线HTML: stats.scanned,
      新入库: stats.saved,
      已存在跳过: stats.skippedExisting,
      失败: stats.failed,
      失败明细: stats.failures,
      耗时ms: stats.elapsedMs,
    }, null, 2));
    return;
  }

  printHelp();
  console.error(`\n未知命令: ${cmd}（该子命令尚未实现——见 ops/夜间任务队列.md）`);
  process.exitCode = 2;
}

await main();
