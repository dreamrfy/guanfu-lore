// R2 存储层自测（阶段一接云）：签名确定性、URI 编码、配置校验、上传路径（mock fetch，不联网）
// 用法: node tests/r2store.selftest.ts
import crypto from "node:crypto";

const mod = await import("../src/store/r2Store.ts");
const { loadR2Config, uriEncode, signRequest, putObject } = mod;

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

// ---- loadR2Config ----
const savedEnv: Record<string, string | undefined> = {};
for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) {
  savedEnv[k] = process.env[k];
  delete process.env[k];
}

let cfgMsg = "";
try {
  loadR2Config();
} catch (e) {
  cfgMsg = String((e as Error).message);
}
check("缺凭证报错点名", /R2_ACCOUNT_ID/.test(cfgMsg), cfgMsg);

process.env.R2_ACCOUNT_ID = "cfat_abc123";
process.env.R2_ACCESS_KEY_ID = "ak";
process.env.R2_SECRET_ACCESS_KEY = "sk";
process.env.R2_BUCKET = "bijiapp-assets";
let tokenMsg = "";
try {
  loadR2Config();
} catch (e) {
  tokenMsg = String((e as Error).message);
}
check(
  "把 API Token 当账户 ID 会被拦下并提示",
  /32 位|cfat_/.test(tokenMsg),
  tokenMsg
);

const valid = {
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_ACCESS_KEY_ID: "ak",
  R2_SECRET_ACCESS_KEY: "sk",
  R2_BUCKET: "bijiapp-assets",
};
Object.assign(process.env, valid);
const cfg = loadR2Config();
check("合法配置可读", cfg.accountId === valid.R2_ACCOUNT_ID && cfg.bucket === "bijiapp-assets");

for (const k of Object.keys(savedEnv)) {
  if (savedEnv[k] === undefined) delete process.env[k];
  else process.env[k] = savedEnv[k]!;
}

// ---- uriEncode ----
check("ASCII 键不变", uriEncode("assets/19d9a135aaf1ed00/snapshot.html", false) === "assets/19d9a135aaf1ed00/snapshot.html");
check("斜杠保留（encodeSlash=false）", !uriEncode("a/b c/d", false).includes("%2F"));
check("空格 → %20", uriEncode("a b", true) === "a%20b");
check("中文按 UTF-8 字节编码", uriEncode("剪藏", true) === "%E5%89%AA%E8%97%8F");
check("保留字符 * 也会编码", uriEncode("a*b", true) === "a%2Ab");

// ---- signRequest：确定性 + 格式 ----
const base = {
  method: "PUT",
  host: "abc123.r2.cloudflarestorage.com",
  canonicalUri: "/bijiapp-assets/assets/x/snapshot.html",
  payloadSha256Hex: crypto.createHash("sha256").update("hello").digest("hex"),
  now: new Date("2026-11-05T02:00:00Z"),
  accessKeyId: "AKID",
  secretAccessKey: "SK",
  extraHeaders: { "Content-Type": "text/html" },
};
const s1 = signRequest(base);
const s2 = signRequest(base);
check("同一输入签名完全一致", s1.authorization === s2.authorization);
check("amzDate 格式 yyyymmddThhmmssZ", /^\d{8}T\d{6}Z$/.test(s1.amzDate), s1.amzDate);
check(
  "authorization 结构正确",
  /^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/.test(
    s1.authorization
  ),
  s1.authorization
);
const s3 = signRequest({ ...base, payloadSha256Hex: "0".repeat(64) });
check("载荷不同签名不同", s3.authorization !== s1.authorization);
check("headers 含 host 与 x-amz-date", s1.headers.host === base.host && /^\d{8}T\d{6}Z$/.test(s1.headers["x-amz-date"]));

// ---- putObject（mock fetch，不联网）----
const realFetch = globalThis.fetch;
let captured: { url: string; method: string; headers: Record<string, string>; body?: Uint8Array } | null = null;
(globalThis as { fetch: unknown }).fetch = (async (url: string | URL, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: Uint8Array;
}) => {
  captured = {
    url: String(url),
    method: init?.method ?? "GET",
    headers: init?.headers ?? {},
    body: init?.body,
  };
  return {
    ok: true,
    status: 200,
    headers: new Map([["etag", '"d41d8cd98f00b204e9800998ecf8427e"']]) as unknown as Headers,
    text: async () => "",
  } as unknown as Response;
}) as typeof fetch;

try {
  const out = await putObject(cfg, "assets/x/snapshot.html", Buffer.from("hello"), {
    contentType: "text/html",
    now: new Date("2026-11-05T02:00:00Z"),
  });
  const cap = captured as { url: string; method: string; headers: Record<string, string>; body?: Uint8Array } | null;
  check("putObject 返回 key/etag/bytes", out.key === "assets/x/snapshot.html" && out.bytes === 5 && !!out.etag);
  check("PUT 打到 path-style 端点", cap?.url === "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/bijiapp-assets/assets/x/snapshot.html", cap?.url);
  check("带签名与 x-amz 头", /^AWS4-HMAC-SHA256 /.test(cap!.headers.authorization) && !!cap!.headers["x-amz-content-sha256"]);
  check("请求体原样传递", Buffer.from(cap!.body!).toString() === "hello");
} finally {
  (globalThis as { fetch: unknown }).fetch = realFetch;
}

// 失败路径：mock 500
(globalThis as { fetch: unknown }).fetch = (async () =>
  ({ ok: false, status: 500, headers: new Map(), text: async () => "boom" }) as unknown as Response) as typeof fetch;
try {
  try {
    await putObject(cfg, "x/y.png", Buffer.from("z"), { now: new Date("2026-11-05T02:00:00Z") });
    check("HTTP 500 抛错", false);
  } catch (e) {
    check("HTTP 500 抛错", /HTTP 500/.test(String((e as Error).message)));
  }
} finally {
  (globalThis as { fetch: unknown }).fetch = realFetch;
}

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;