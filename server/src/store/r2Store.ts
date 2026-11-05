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
    "", // query 为空（上传不用查询参数）
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
