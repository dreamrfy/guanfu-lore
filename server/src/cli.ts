// CLI 入口（阶段一 · 本地原型）
//
// 子命令与真实能力严格对应（不再出现“帮助里有、实际没实现”的命令）：
//   demo             —— 离线 HTML 导入（只覆盖“导入 → 幂等落库”子链路）
//   list             —— 生成剪藏清单页
//   pipeline-test    —— 用 mock 依赖离线跑完整链（不联网，验证编排）
//   ingest-messages  —— 用 samples/messages.json 走完整链（真实抓取，需联网）
//   poll             —— 拉取微信客服增量消息并入库（需 KF_SECRETS_FILE 指向的凭证）
import fs from "node:fs";
import path from "node:path";
import { runDemo } from "./pipeline.ts";
import { runPipeline } from "./pipeline/run.ts";
import { createLocalDeps } from "./pipeline/wire.ts";
import { createMockDeps, MOCK_MESSAGES } from "./pipeline/mock.ts";
import { OUT_DIR, ASSETS_DIR, SAMPLES_DIR, loadSecrets } from "./config.ts";
import { listClips } from "./store/localStore.ts";
import { FAIL_REASON_LABELS } from "./pipeline/status.ts";
import { WecomClient, loadCursor, saveCursor } from "./sources/wecomClient.ts";

/** 清单页里指向资源目录的相对前缀（运行时算出，不写死路径） */
const ASSET_HREF_BASE = path.relative(OUT_DIR, ASSETS_DIR).split(path.sep).join("/");

/** 消息样本固定在 samples/messages.json（不接受命令行传路径，避免任意文件读取） */
const MESSAGES_SAMPLE = path.join(SAMPLES_DIR, "messages.json");

function printHelp(): void {
  console.log(`bijiapp 服务端（阶段一 · 本地原型）

用法: node src/cli.ts <命令>

命令:
  --help               显示本帮助
  demo                 导入 server/out/offline_*.html → 幂等落库
                       （只覆盖“离线导入”子链路，不等于消息全链）
  list                 生成剪藏清单页（server/out/剪藏清单.html）
  pipeline-test        用 mock 依赖离线跑完整链（消息→抓取→图片→状态→落库，不联网）
  ingest-messages      用 samples/messages.json 跑完整链（真实抓取，需要联网）
  poll [--limit N]     拉取微信客服增量消息并入库（需要 KF_SECRETS_FILE）

说明:
  - Node >= 24 原生直跑 .ts（type stripping），无需构建
  - 依赖：仅 sanitize-html（HTML 白名单清洗）；其余全用 Node 内置模块
  - 凭证从环境变量 KF_SECRETS_FILE 指向的仓库外文件读取，代码与仓库不落值
  - 数据落 server/data/，输出落 server/out/（均已 gitignore）
`);
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function cmdList(): Promise<void> {
  const clips = listClips();
  const rows = clips
    .map((c) => {
      const reason = c.failReason ? FAIL_REASON_LABELS[c.failReason] : "";
      const href =
        ASSET_HREF_BASE +
        "/" +
        encodeURIComponent(c.assets[0]?.assetId ?? "") +
        "." +
        escapeHtml(c.assets[0]?.ext ?? "html");
      return (
        "<tr><td>" +
        escapeHtml(c.title) +
        "</td><td>" +
        escapeHtml(c.account || c.author) +
        "</td><td>" +
        escapeHtml(c.savedAt.slice(0, 10)) +
        "</td><td>" +
        escapeHtml(c.status) +
        "</td><td>" +
        escapeHtml(reason) +
        "</td><td>" +
        c.assets.length +
        '</td><td><a href="' +
        escapeHtml(href) +
        '">打开快照</a></td></tr>'
      );
    })
    .join("\n");
  const page =
    '<!DOCTYPE html>\n<html lang="zh-CN"><head><meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'">\n' +
    "<title>剪藏清单（" + clips.length + " 条）</title>\n" +
    "<style>body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:72em;margin:0 auto;padding:16px}" +
    "table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 10px;text-align:left}" +
    "th{background:rgba(127,127,127,.15)}</style></head><body>\n" +
    "<h1>剪藏清单（" + clips.length + " 条）</h1>\n<table>\n" +
    "<tr><th>标题</th><th>来源</th><th>收藏日期</th><th>状态</th><th>原因</th><th>资源数</th><th>快照</th></tr>\n" +
    rows + "\n</table>\n<p>快照为自包含离线 HTML（图片本地化），断网可读；状态为 partial/failed 的记录说明内容不完整。</p>\n</body></html>";
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const listPath = path.join(OUT_DIR, "剪藏清单.html");
  if (!listPath.startsWith(OUT_DIR + path.sep)) throw new Error("输出路径越界");
  fs.writeFileSync(listPath, page, "utf8");
  console.log("剪藏清单已生成：" + listPath + "（" + clips.length + " 条）");
}

function readMessagesSample(): Array<Record<string, unknown>> {
  const data = JSON.parse(fs.readFileSync(MESSAGES_SAMPLE, "utf8")) as unknown;
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  const messages = (data as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) throw new Error("消息文件格式应为数组或 { messages: [...] }");
  return messages as Array<Record<string, unknown>>;
}

function printStats(stats: unknown): void {
  console.log(JSON.stringify(stats, null, 2));
}

async function cmdPipelineTest(): Promise<void> {
  const { deps } = createMockDeps();
  const stats = await runPipeline(MOCK_MESSAGES, deps);
  printStats({ 模式: "mock（不联网）", ...stats });
}

async function cmdIngestMessages(): Promise<void> {
  const messages = readMessagesSample();
  const stats = await runPipeline(messages, createLocalDeps());
  printStats(stats);
}

async function cmdPoll(limit: number): Promise<void> {
  const secrets = loadSecrets();
  const client = new WecomClient({ corpId: secrets.corpId, appSecret: secrets.appSecret });
  const previous = loadCursor();
  let cursor = previous?.cursor ?? "";
  const collected: Array<Record<string, unknown>> = [];

  for (let page = 0; page < 20; page++) {
    const result = await client.syncMessages({ cursor, token: previous?.token ?? "", limit });
    collected.push(...result.messages);
    if (result.nextCursor) cursor = result.nextCursor;
    if (!result.hasMore) break;
  }

  const stats = await runPipeline(collected, createLocalDeps());
  if (cursor) {
    // 游标落盘失败不应让本轮已入库的结果白跑：只提示，不抛错
    try {
      saveCursor({ cursor, token: "", updatedAt: new Date().toISOString() });
    } catch (e) {
      console.error("游标未落盘（下次会重复拉取，幂等去重可兜底）：" + String((e as Error).message));
    }
  }
  printStats({ 拉取消息: collected.length, 游标: cursor, ...stats });
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
  if (cmd === "pipeline-test") {
    await cmdPipelineTest();
    return;
  }
  if (cmd === "ingest-messages") {
    await cmdIngestMessages();
    return;
  }
  if (cmd === "poll") {
    const idx = args.indexOf("--limit");
    const limit = idx >= 0 ? Number(args[idx + 1]) : 100;
    await cmdPoll(Number.isFinite(limit) ? limit : 100);
    return;
  }

  printHelp();
  console.error(`\n未知命令: ${cmd}`);
  process.exitCode = 2;
}

try {
  await main();
} catch (e) {
  console.error("执行失败：" + String((e as Error)?.message ?? e));
  process.exitCode = 1;
}
