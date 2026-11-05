// 云函数轮询入口自测：pollOnce 主循环（假 client + mock 流水线 + 假游标存储，不联网）
// 用法: node tests/cloudfn.selftest.ts
import { pollOnce, type PollIo, type PollState } from "../src/cloud/pollFn.ts";
import { createMockDeps } from "../src/pipeline/mock.ts";
import type { SyncResult } from "../src/sources/wecomClient.ts";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

/** 合法公众号 link 消息（参数满足 canonicalWechatArticleUrl 的白名单校验） */
const MSG_LINK = {
  msgid: "cloudfn-m1",
  send_time: 1794000000,
  origin: 3,
  msgtype: "link",
  link: {
    title: "云函数自测文章",
    desc: "",
    url: "https://mp.weixin.qq.com/s?__biz=MzkyNDA5MjgyNw==&mid=2247510399&idx=1&sn=5a8fa81a2ad2b093f87455a9f7a35716",
    pic_url: "",
  },
};

function fakeClient(pages: Array<Partial<SyncResult>>): {
  client: PollIo["client"];
  calls: Array<{ cursor: string; token: string; limit: number }>;
} {
  const calls: Array<{ cursor: string; token: string; limit: number }> = [];
  return {
    calls,
    client: {
      async syncMessages(opts) {
        calls.push({ ...opts });
        const p = pages[Math.min(calls.length - 1, pages.length - 1)]!;
        return {
          messages: p.messages ?? [],
          nextCursor: p.nextCursor ?? "",
          nextToken: p.nextToken ?? "",
          hasMore: p.hasMore ?? false,
        };
      },
    },
  };
}

const savedStates: PollState[] = [];

// 1. 单页拉完：消息进流水线、游标落盘
{
  savedStates.length = 0;
  const mock = createMockDeps();
  const { client, calls } = fakeClient([
    { messages: [MSG_LINK], hasMore: false, nextCursor: "c1" },
  ]);
  const out = await pollOnce({
    client,
    pipeline: mock.deps,
    loadState: async () => null,
    saveState: async (s) => {
      savedStates.push(s);
    },
  });
  check("单页：翻页恰好 1 次", calls.length === 1, String(calls.length));
  check("单页：消息进流水线并入库", out.saved === 1 && out.messages === 1, JSON.stringify(out));
  check("单页：游标已落盘", savedStates.length === 1 && savedStates[0]!.cursor === "c1", JSON.stringify(savedStates));
}

// 2. hasMore 翻页：cursor/token 成对传递（N-08）
{
  savedStates.length = 0;
  const { client, calls } = fakeClient([
    { messages: [{ any: 1 }], hasMore: true, nextCursor: "cur-1", nextToken: "tok-1" },
    { messages: [{ any: 2 }], hasMore: false, nextCursor: "cur-2", nextToken: "tok-2" },
  ]);
  await pollOnce({
    client,
    pipeline: createMockDeps().deps,
    loadState: async () => null,
    saveState: async (s) => {
      savedStates.push(s);
    },
  });
  check("翻页：第 2 页带上第 1 页的 cursor/token", calls[1]!.cursor === "cur-1" && calls[1]!.token === "tok-1", JSON.stringify(calls));
  check("翻页：最终游标是最后一页的", savedStates[0]!.cursor === "cur-2" && savedStates[0]!.token === "tok-2", JSON.stringify(savedStates));
}

// 3. has_more=1 但 next_cursor 空 → 停止翻页（N-08 防呆）
{
  const { client, calls } = fakeClient([{ messages: [{ any: 1 }], hasMore: true, nextCursor: "" }]);
  const out = await pollOnce({
    client,
    pipeline: createMockDeps().deps,
    loadState: async () => null,
    saveState: async () => {},
  });
  check("异常翻页：立即停止", calls.length === 1, String(calls.length));
  check("异常翻页：停止原因写明", out.stopReason.includes("next_cursor 为空"), out.stopReason);
}

// 4. 上一次游标被恢复：起点是上次的 cursor/token
{
  const { client, calls } = fakeClient([{ messages: [], hasMore: false, nextCursor: "next-from-state" }]);
  await pollOnce({
    client,
    pipeline: createMockDeps().deps,
    loadState: async () => ({ cursor: "saved-cur", token: "saved-tok", updatedAt: "2026-11-05T00:00:00Z" }),
    saveState: async () => {},
  });
  check("从已存游标继续拉取", calls[0]!.cursor === "saved-cur" && calls[0]!.token === "saved-tok", JSON.stringify(calls));
}

// 5. 游标落盘失败不抛错（本轮入库结果不白跑）
{
  const { client } = fakeClient([{ messages: [], hasMore: false, nextCursor: "c" }]);
  const out = await pollOnce({
    client,
    pipeline: createMockDeps().deps,
    loadState: async () => null,
    saveState: async () => {
      throw new Error("db write failed");
    },
  });
  check("游标落盘失败不抛错", out.cursor === "c" && out.stopReason === "拉取完成", JSON.stringify(out));
}

// 6. limit 透传
{
  const { client, calls } = fakeClient([{ messages: [], hasMore: false }]);
  await pollOnce({
    client,
    pipeline: createMockDeps().deps,
    loadState: async () => null,
    saveState: async () => {},
    limit: 7,
  });
  check("limit 透传给客户端", calls[0]!.limit === 7, JSON.stringify(calls));
}

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;