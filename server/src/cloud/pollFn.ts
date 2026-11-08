// 微信客服定时触发轮询云函数入口（阶段一，路线 A：R2 全包）
//
// 凭证：五项环境变量直读（config.loadSecrets 分派）；
// 记录/游标：R2 JSON 文件（store/r2ClipStore）——用户 CloudBase 环境是 PG 模式
//（无文档型数据库，实测 2026-11-05），拍板记录不落 CloudBase 数据库；
// 资源：R2（cloudWire 装配）。云函数只依赖微信凭证 + R2 凭证两组环境变量。
//
// 注：轮询主循环与 cli.ts cmdPoll 同构——阶段一有意不抽公共层，避免改动已验收的本地链路；
// 差异只在游标存储介质（本地文件 vs R2 对象）。
import { loadSecrets } from "../config.ts";
import { WecomClient } from "../sources/wecomClient.ts";
import { runPipeline } from "../pipeline/run.ts";
import { createCloudDeps } from "../pipeline/cloudWire.ts";
import type { PipelineDeps, PipelineStats } from "../pipeline/run.ts";
import type { SyncResult } from "../sources/wecomClient.ts";
import { shouldStopPaging } from "../sources/wecomClient.ts";

export interface PollState {
  cursor: string;
  token: string;
  updatedAt: string;
}

export interface PollIo {
  client: { syncMessages(opts: { cursor: string; token: string; limit: number }): Promise<SyncResult> };
  pipeline: PipelineDeps;
  loadState(): Promise<PollState | null>;
  saveState(s: PollState): Promise<void>;
  /** 轮询后重建清单索引（V2.1 ④，R2 路线专用；缺省=不做，本地 SQLite 链路用不上） */
  writeIndex?: () => Promise<number>;
  limit?: number;
}

export interface PollResult extends PipelineStats {
  cursor: string;
  stopReason: string;
}

/** 轮询主循环（可注入测试）。翻页上限、游标语义与 cli.ts cmdPoll 一致（N-08：cursor/token 成对）。 */
export async function pollOnce(io: PollIo): Promise<PollResult> {
  const previous = await io.loadState();
  let cursor = previous?.cursor ?? "";
  let token = previous?.token ?? "";
  let stopReason = "拉取完成";
  const collected: Array<Record<string, unknown>> = [];

  for (let page = 0; page < 20; page++) {
    const result = await io.client.syncMessages({ cursor, token, limit: io.limit ?? 100 });
    collected.push(...result.messages);
    if (shouldStopPaging(result)) {
      stopReason = "接口返回 has_more=1 但 next_cursor 为空，已停止翻页";
      console.error(stopReason);
      break;
    }
    cursor = result.nextCursor || cursor;
    token = result.nextToken;
    if (!result.hasMore) break;
    if (page === 19) stopReason = "达到单轮翻页上限（20 页），下一轮从当前游标继续";
  }

  const stats = await runPipeline(collected, io.pipeline);
  // 清单索引重建（V2.1 ④）：尽力而为，失败只提示——索引旧一点不影响本轮入库结果
  if (io.writeIndex) {
    try {
      const n = await io.writeIndex();
      console.log("[bijiapp-poll] 清单索引已重建：" + n + " 条");
    } catch (e) {
      console.error("清单索引重建失败（App 端暂见旧清单，不影响入库）：" + String((e as Error).message));
    }
  }
  if (cursor) {
    try {
      await io.saveState({ cursor, token, updatedAt: new Date().toISOString() });
    } catch (e) {
      // 游标落盘失败不让本轮已入库的结果白跑：只提示，不抛错（幂等去重兜底重复拉取）
      console.error("游标未落盘（下次会重复拉取，幂等去重可兜底）：" + String((e as Error).message));
    }
  }
  return { ...stats, cursor, stopReason } as PollResult;
}

/** 云函数入口：控制台「测试」按钮或定时触发器调用 */
export async function main(event: unknown = null, context: unknown = null): Promise<PollResult> {
  void event;
  void context;
  const secrets = loadSecrets();
  const client = new WecomClient({ corpId: secrets.corpId, appSecret: secrets.appSecret });
  const { deps, store } = await createCloudDeps();
  return pollOnce({
    client,
    pipeline: deps,
    loadState: () => store.loadPollState(),
    saveState: (s) => store.savePollState(s),
    writeIndex: () => store.writeClipIndex(),
  });
}

// VPS/systemd 直接运行入口：node 直接执行本文件时自动跑 main() 并输出 JSON 统计；
// 被云函数（垫片 index.js require）加载时不执行（argv[1] 不是本文件）。
const invokedDirectly =
  process.argv[1] !== undefined &&
  process.argv[1].endsWith("pollFn.ts");
if (invokedDirectly) {
  main()
    .then((result) => {
      console.log("[bijiapp-poll] " + JSON.stringify(result));
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error("[bijiapp-poll] 运行失败：" + String((err && err.message) || err));
      process.exitCode = 1;
    });
}
