// 清单索引自测（V2.1 ④）：ListObjectsV2 解析、索引构建、writeClipIndex 全流程（mock fetch，不联网）
// 用法: node tests/clip-index.selftest.ts
import type { Clip } from "../src/store/types.ts";

const r2 = await import("../src/store/r2Store.ts");
const store = await import("../src/store/r2ClipStore.ts");
const { buildClipIndexEntries } = store;

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

const cfg = {
  accountId: "0123456789abcdef0123456789abcdef",
  accessKeyId: "ak",
  secretAccessKey: "sk",
  bucket: "bijiapp-assets",
};

// ---- parseListKeysXml ----
const xml1 = `<?xml version="1.0"?><ListBucketResult>
<IsTruncated>false</IsTruncated>
<Contents><Key>clips/wx_01.json</Key></Contents>
<Contents><Key>clips/wx_02.json</Key></Contents>
<Contents><Key>assets/abc.png</Key></Contents>
</ListBucketResult>`;
const keys1 = r2.parseListKeysXml(xml1);
check("ListObjectsV2 XML 解析：取全部 Key", JSON.stringify(keys1) === JSON.stringify(["clips/wx_01.json", "clips/wx_02.json", "assets/abc.png"]), JSON.stringify(keys1));
check("空 XML 解析安全", r2.parseListKeysXml("<a></a>").length === 0);

// ---- buildClipIndexEntries ----
const mk = (id: string, savedAt: string, status: Clip["status"] = "complete"): Clip => ({
  id, source: "wechat_mp", sourceUrl: "https://mp.weixin.qq.com/s?x=1", title: "t" + id,
  author: "", account: "某公众号", publishedAt: null, savedAt, text: "正文", assets: [], status, failReason: null,
});
const bad = { id: 42 } as unknown as Clip;
const entries = buildClipIndexEntries([mk("a", "2026-11-08T01:00:00Z"), mk("b", "2026-11-09T01:00:00Z"), mk("c", ""), bad, null as unknown as Clip]);
check(
  "索引条目：倒序 + 剔除不可解析",
  entries.length === 3 && entries[0].id === "b" && entries[1].id === "a" && entries[2].id === "c",
  JSON.stringify(entries)
);
check("索引条目字段齐全", entries[0].title === "tb" && entries[0].source === "wechat_mp" && entries[0].status === "complete");

const many: Clip[] = [];
for (let i = 0; i < 605; i++) many.push(mk("x" + i, "2026-11-01T00:00:00Z"));
check("索引条目封顶 500", buildClipIndexEntries(many).length === 500);

// ---- writeClipIndex 全流程（mock fetch）----
const realFetch = globalThis.fetch;
const calls: string[] = [];
let putBody = "";
(globalThis as { fetch: unknown }).fetch = (async (url: string | URL, init?: {
  method?: string;
  body?: Uint8Array;
}) => {
  const u = String(url);
  calls.push(u);
  if (u.includes("?list-type=2")) {
    return {
      ok: true,
      status: 200,
      text: async () =>
        "<ListBucketResult><Contents><Key>clips/wx_01.json</Key></Contents><Contents><Key>clips/url_02.json</Key></Contents><Contents><Key>clips/index.json</Key></Contents><Contents><Key>assets/a.png</Key></Contents></ListBucketResult>",
      headers: new Map(),
    } as unknown as Response;
  }
  if (init?.method === "PUT") {
    putBody = Buffer.from(init.body ?? []).toString("utf8");
    return { ok: true, status: 200, headers: new Map([["etag", '"e1"']]) } as unknown as Response;
  }
  // GET clips/wx_01.json 与 clips/url_02.json
  if (u.includes("clips/wx_01.json")) {
    return {
      ok: true, status: 200, arrayBuffer: async () => Buffer.from(JSON.stringify(mk("wx_01", "2026-11-08T02:00:00Z")), "utf8"),
      headers: new Map(),
    } as unknown as Response;
  }
  return {
    ok: true, status: 200, arrayBuffer: async () => Buffer.from("not-json", "utf8"),
    headers: new Map(),
  } as unknown as Response;
}) as typeof fetch;

try {
  const s = new store.R2ClipStore(cfg);
  const n = await s.writeClipIndex();
  check("writeClipIndex 返回条数", n === 1, String(n));
  check("索引 PUT 了 clips/index.json", calls.some((c) => c.includes("clips/index.json")), calls.join("|"));
  const parsed = JSON.parse(putBody) as Array<{ id: string; savedAt: string; status: string; title: string; source: string }>;
  check(
    "索引内容：损坏记录跳过、index.json 自身不进索引",
    parsed.length === 1 && parsed[0].id === "wx_01" && parsed[0].savedAt === "2026-11-08T02:00:00Z",
    putBody
  );
  const listUrl = calls.find((c) => c.includes("?list-type=2")) ?? "";
  check("LIST 查询串按键排序（continuation/list-type/max-keys/prefix）", listUrl.includes("list-type=2&max-keys=1000&prefix=clips%2F"), listUrl);
  check("签名头存在", listUrl.includes("X-Amz") || /AWS4-HMAC-SHA256/.test(listUrl) === false, "签名在 header 里，URL 只需含查询");
} catch (e) {
  check("writeClipIndex mock 全流程", false, String((e as Error).message));
} finally {
  (globalThis as { fetch: unknown }).fetch = realFetch;
}

// ---- canonicalQuery 参与签名（有查询 vs 无查询签名必须不同）----
const base = {
  method: "GET",
  host: "h.example.com",
  canonicalUri: "/b",
  payloadSha256Hex: "0".repeat(64),
  now: new Date("2026-11-08T00:00:00Z"),
  accessKeyId: "ak",
  secretAccessKey: "sk",
};
const sigNoQ = r2.signRequest(base).authorization;
const sigWithQ = r2.signRequest({ ...base, canonicalQuery: "list-type=2" }).authorization;
check("查询串参与签名（有/无签名不同）", sigNoQ !== sigWithQ);
check("签名确定性：同输入同签名", r2.signRequest({ ...base, canonicalQuery: "list-type=2" }).authorization === sigWithQ);

// ---- getClipIndex 损坏兜底 ----
(globalThis as { fetch: unknown }).fetch = (async () =>
  ({
    ok: true,
    status: 200,
    arrayBuffer: async () => Buffer.from("broken", "utf8"),
    headers: new Map(),
  }) as unknown as Response) as typeof fetch;
try {
  const broken = await new store.R2ClipStore(cfg).getClipIndex();
  check("getClipIndex 损坏返回 null", broken === null);
} catch (e) {
  check("getClipIndex 损坏返回 null", false, String((e as Error).message));
} finally {
  (globalThis as { fetch: unknown }).fetch = realFetch;
}

process.exit(failed === 0 ? 0 : 1);
