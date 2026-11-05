// R2 剪藏记录存储自测（路线 A）：存取往返、存在性、游标状态（假 fetch，不联网）
// 用法: node tests/r2clipstore.selftest.ts
import { R2ClipStore, type PollStateJson } from "../src/store/r2ClipStore.ts";
import type { R2Config } from "../src/store/r2Store.ts";
import type { Clip } from "../src/store/types.ts";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

const cfg: R2Config = {
  accountId: "0123456789abcdef0123456789abcdef",
  accessKeyId: "ak",
  secretAccessKey: "sk",
  bucket: "bijiapp-assets",
};

const sample: Clip = {
  id: "wx_0123456789abcdef",
  source: "wechat_mp",
  sourceUrl: "http://mp.weixin.qq.com/s?__biz=abc",
  canonicalUrl: "https://mp.weixin.qq.com/s?__biz=abc",
  title: "测试文章",
  author: "阿汤",
  account: "科技汤",
  publishedAt: null,
  savedAt: "2026-11-05T02:00:00.000Z",
  text: "正文",
  assets: [{ assetId: "19d9a135aaf1ed00", provider: "r2", ext: "html" }],
  status: "complete",
  failReason: null,
};

// 假 R2：内存桶（PUT/GET），记录请求路径
const store = new Map<string, Buffer>();
const putPaths: string[] = [];
const realFetch = globalThis.fetch;
(globalThis as { fetch: unknown }).fetch = (async (url: string | URL, init?: {
  method?: string;
  body?: Uint8Array;
}) => {
  const u = String(url);
  const key = u.slice(u.indexOf("/bijiapp-assets/") + "/bijiapp-assets/".length);
  const method = init?.method ?? "GET";
  if (method === "PUT") {
    store.set(key, Buffer.from(init?.body ?? new Uint8Array()));
    putPaths.push(key);
    return { ok: true, status: 200, headers: new Map([["etag", '"e"']]) as unknown as Headers, text: async () => "" } as unknown as Response;
  }
  const body = store.get(key);
  if (!body) {
    return { ok: false, status: 404, headers: new Map(), text: async () => "NoSuchKey", arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
  }
  const ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  return { ok: true, status: 200, headers: new Map(), text: async () => "", arrayBuffer: async () => ab } as unknown as Response;
}) as typeof fetch;

const s = new R2ClipStore(cfg);
try {
  check("不存在 → existsClip false", !(await s.existsClip(sample.id)));
  check("不存在 → getClip null", (await s.getClip(sample.id)) === null);

  await s.saveClip(sample);
  check("保存落在 clips/{id}.json", putPaths.includes("clips/wx_0123456789abcdef.json"), JSON.stringify(putPaths));
  check("保存后 existsClip true", await s.existsClip(sample.id));
  const got = await s.getClip(sample.id);
  check("读取往返无损", got !== null && got.title === "测试文章" && got.assets.length === 1);

  // 覆盖写
  const v2 = { ...sample, title: "改过的标题" };
  await s.saveClip(v2);
  check("同 id 二次保存为覆盖", (await s.getClip(sample.id))?.title === "改过的标题");

  // 损坏记录：exists 仍 true（阻止重复入库），getClip 返回 null 不抛
  store.set("clips/broken.json", Buffer.from("{not-json"));
  check("损坏记录 existsClip true", await s.existsClip("broken"));
  check("损坏记录 getClip null 不抛", (await s.getClip("broken")) === null);

  // 轮询游标
  check("游标初始 null", (await s.loadPollState()) === null);
  const st: PollStateJson = { cursor: "cur-1", token: "tok-1", updatedAt: "2026-11-05T03:00:00Z" };
  await s.savePollState(st);
  check("游标落在 state/poll.json", putPaths.includes("state/poll.json"));
  const loaded = await s.loadPollState();
  check("游标往返无损", loaded !== null && loaded.cursor === "cur-1" && loaded.token === "tok-1");

  // 损坏游标 → null（下次会重复拉取，幂等兜底）
  store.set("state/poll.json", Buffer.from("oops"));
  check("损坏游标 → null", (await s.loadPollState()) === null);
} finally {
  (globalThis as { fetch: unknown }).fetch = realFetch;
}

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;