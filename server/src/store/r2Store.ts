// Cloudflare R2 对象存储（阶段一接云）——S3 SigV4 签名只用 Node 内置 crypto，不新增第三方包
// 凭证只从环境变量读（R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET），不进仓库。
// path-style 端点：https://{account}.r2.cloudflarestorage.com/{bucket}/{key}
// 键由 assetId 派生（G1 红线：记录里只存编号；真实地址只由本层生成，不落库）。
// 上传后由调用方验证（Range 请求 + 文件魔数），本层只负责签名与传输。
import crypto from "node:crypto";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/**
 * 从环境变量读 R2 配置。
 * 账户 ID 必须是 32 位 hex——曾有人把 cfat_ 开头的 API Token 标识误当账户 ID，这里显式拦截。
 */
export function loadR2Config(env: NodeJS.ProcessEnv = process.env): R2Config {
  const need = (name: string): string => {
    const v = env[name];
    if (typeof v !== "string" || v.length === 0) throw new Error("R2 环境变量未设置：" + name);
    return v;
  };
  const accountId = need("R2_ACCOUNT_ID");
  if (!/^[0-9a-fA-F]{32}$/.test(accountId)) {
    throw new Error(
      "R2_ACCOUNT_ID 应为 32 位十六进制账户 ID（不是 cfat_ 开头的 API Token 标识，也不是桶名）"
    );
  }
  return {
    accountId,
    accessKeyId: need("R2_ACCESS_KEY_ID"),
    secretAccessKey: need("R2_SECRET_ACCESS_KEY"),
    bucket: need("R2_BUCKET"),
  };
}

/** S3 SigV4 的 URI 编码：除 RFC3986 非保留字符外全部百分号编码（大写十六进制）；encodeSlash=false 时保留 / */
export function uriEncode(input: string, encodeSlash: boolean): string {
  const unreserved = /[A-Za-z0-9\-._~]/;
  let out = "";
  for (const ch of Buffer.from(input, "utf8")) {
    const c = String.fromCharCode(ch);
    if (unreserved.test(c)) {
      out += c;
    } else {
      out += "%" + ch.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  if (!encodeSlash) out = out.replaceAll("%2F", "/");
  return out;
}

function hmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: crypto.BinaryLike): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** SigV4 单次请求的签名输入，独立导出便于测试（不含网络） */
export interface SigV4Input {
  method: string;
  host: string;
  /** path-style 的完整路径，如 /{bucket}/{key}（斜杠不编码） */
  canonicalUri: string;
  /** 已排序、已 URI 编码的查询串（如 "list-type=2&prefix=clips%2F"）；无查询省略 */
  canonicalQuery?: string;
  /** 已排序的额外头部（键小写），不含 host 与 x-amz-* */
  extraHeaders?: Record<string, string>;
  payloadSha256Hex: string;
  now: Date;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  service?: string;
}

export interface SigV4Result {
  amzDate: string;
  authorization: string;
  headers: Record<string, string>;
}

/** 计算 AWS SigV4 签名头（R2 兼容 S3 签名；region 固定 auto、service 固定 s3） */
export function signRequest(input: SigV4Input): SigV4Result {
  const region = input.region ?? "auto";
  const service = input.service ?? "s3";
  const amzDate = input.now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // yyyymmddThhmmssZ
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = input.payloadSha256Hex;
  const headers: Record<string, string> = {
    host: input.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...Object.fromEntries(
      Object.entries(input.extraHeaders ?? {}).map(([k, v]) => [k.toLowerCase(), v])
    ),
  };

  const sortedKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedKeys.map((k) => k + ":" + headers[k].trim() + "\n").join("");
  const signedHeaders = sortedKeys.join(";");

  const canonicalRequest = [
    input.method,
    input.canonicalUri,
    input.canonicalQuery ?? "", // 无查询时保持空串（上传/读取不用查询参数）
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = dateStamp + "/" + region + "/" + service + "/aws4_request";
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

  let key: Buffer = hmac("AWS4" + input.secretAccessKey, dateStamp);
  key = hmac(key, region);
  key = hmac(key, service);
  key = hmac(key, "aws4_request");
  const signature = hmac(key, stringToSign).toString("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { amzDate, authorization, headers };
}

export interface R2PutResult {
  key: string;
  etag: string | null;
  bytes: number;
}

/**
 * 读取一个对象。404 → null（不存在）；其他非 2xx 抛错（附状态码与响应片段）。
 * 记录文件都是几 KB 的小对象，直接 GET 足够；exists 判定也用它（不做单独 HEAD）。
 */
export async function getObject(
  cfg: R2Config,
  key: string,
  opts: { now?: Date } = {}
): Promise<Buffer | null> {
  const host = cfg.accountId + ".r2.cloudflarestorage.com";
  const canonicalUri = "/" + cfg.bucket + "/" + uriEncode(key, false);
  const { authorization, headers } = signRequest({
    method: "GET",
    host,
    canonicalUri,
    payloadSha256Hex: sha256Hex(Buffer.alloc(0)),
    now: opts.now ?? new Date(),
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
  });
  const res = await fetch("https://" + host + canonicalUri, {
    method: "GET",
    headers: { ...headers, authorization },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Error(`R2 GET ${key} 失败：HTTP ${res.status} ${text}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

const EXT_CONTENT_TYPES: Record<string, string> = {
  html: "text/html",
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/**
 * 与 PipelineDeps.writeAssetFile / DownloadImageOptions.writeAsset 签名对齐的 R2 写入器。
 * 键规则：assets/{assetId}.{ext}（assetId 为源地址派生的稳定编号，immutable）。
 */
export function makeR2AssetWriter(
  cfg: R2Config
): (assetId: string, ext: string, body: Buffer) => Promise<string> {
  return async (assetId, ext, body) => {
    const key = "assets/" + assetId + "." + ext;
    await putObject(cfg, key, body, {
      contentType: EXT_CONTENT_TYPES[ext] ?? "application/octet-stream",
    });
    return key;
  };
}

/** 上传一个对象（PUT）。assetId 键 immutable，不需要先删旧对象。 */
export async function putObject(
  cfg: R2Config,
  key: string,
  body: Buffer,
  opts: { contentType?: string; now?: Date } = {}
): Promise<R2PutResult> {
  const host = cfg.accountId + ".r2.cloudflarestorage.com";
  const canonicalUri = "/" + cfg.bucket + "/" + uriEncode(key, false);

  const payloadHash = sha256Hex(body);
  const extraHeaders: Record<string, string> = {};
  if (opts.contentType) extraHeaders["content-type"] = opts.contentType;

  const { amzDate, authorization, headers } = signRequest({
    method: "PUT",
    host,
    canonicalUri,
    extraHeaders,
    payloadSha256Hex: payloadHash,
    now: opts.now ?? new Date(),
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
  });

  const res = await fetch("https://" + host + canonicalUri, {
    method: "PUT",
    body: new Uint8Array(body),
    headers: { ...headers, authorization },
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Error(`R2 PUT ${key} 失败：HTTP ${res.status} ${text}`);
  }
  return { key, etag: res.headers.get("etag"), bytes: body.length };
}

/** 解析 ListObjectsV2 的 XML 响应，取 <Key> 列表（导出便于测试；只认严格匹配，不做通用 XML 解析） */
export function parseListKeysXml(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) out.push(m[1]);
  return out;
}

/**
 * 列举桶内对象键（ListObjectsV2，带查询串签名，分页拉全）。
 * 我们的键（clips/、assets/、state/）都是 URL 安全字符，无编码差异，返回原样键名。
 */
export async function listObjectKeys(
  cfg: R2Config,
  opts: { prefix?: string; maxKeys?: number; now?: Date } = {}
): Promise<string[]> {
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const keys: string[] = [];
  let continuation: string | null = null;
  do {
    const params: Array<[string, string]> = [["list-type", "2"]];
    if (opts.prefix) params.push(["prefix", opts.prefix]);
    params.push(["max-keys", String(opts.maxKeys ?? 1000)]);
    if (continuation) params.push(["continuation-token", continuation]);
    // SigV4 要求查询参数按键名排序后再编码
    params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const canonicalQuery = params
      .map(([k, v]) => uriEncode(k, true) + "=" + uriEncode(v, true))
      .join("&");
    const { authorization, headers } = signRequest({
      method: "GET",
      host,
      canonicalUri: "/" + cfg.bucket,
      canonicalQuery,
      payloadSha256Hex: sha256Hex(Buffer.alloc(0)),
      now: opts.now ?? new Date(),
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    });
    const res = await fetch(`https://${host}/${cfg.bucket}?${canonicalQuery}`, {
      method: "GET",
      headers: { ...headers, authorization },
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      throw new Error(`R2 LIST 失败：HTTP ${res.status} ${text}`);
    }
    const xml = await res.text();
    keys.push(...parseListKeysXml(xml));
    for (const m of xml.matchAll(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/g)) {
      continuation = m[1];
    }
  } while (continuation);
  return keys;
}
