// CLI 入口（阶段一 · 本地原型）
// 子命令随夜间任务逐步补齐：
//   fetch <url>   —— 任务2/3（公众号抓取）
//   demo          —— 任务5（消息 → 剪藏记录 全链）
//   poll          —— 任务6 之后（只读拉取微信客服消息）
const args = process.argv.slice(2);
const cmd = args[0] ?? "--help";

function printHelp(): void {
  console.log(`bijiapp 服务端（阶段一 · 本地原型，零依赖）

用法: node src/cli.ts <命令>

命令:
  --help       显示本帮助
  fetch <url>  抓取单篇公众号文章 → 自包含离线 HTML + 本地落盘   (任务2/3)
  demo         用真实样本跑通「消息 → 剪藏记录」全链              (任务5)
  poll         只读拉取微信客服消息（不消耗客户额度）              (任务6 之后)

说明:
  - Node >= 24 原生直跑 .ts（type stripping），无需构建、零依赖
  - 凭证从环境变量 KF_SECRETS_FILE 指向的仓库外文件读取
  - 数据落 server/data/，离线输出落 server/out/（均已 gitignore）
`);
}

function main(): void {
  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    printHelp();
    return;
  }
  printHelp();
  console.error(`\n未知命令: ${cmd}（该子命令尚未实现——见 ops/夜间任务队列.md）`);
  process.exitCode = 2;
}

main();
