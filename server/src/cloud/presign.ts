// R2 私有桶的「临时取件码」：SigV4 **查询串签名**（presigned URL）
//
// 为什么用查询签名而不是给 App 带 Authorization 头：
//   方案 C（用户已定）= 服务端持有密钥、签发**带有效期的 URL**，App 直连对象存储取资源。
//   App 不该拿到密钥，也不该自己算签名——只拿一个到点就失效的 URL。
//
// 与 store/r2Store.ts 的关系：那边是**头部签名**（服务端自己读写用），这里是**查询签名**（给客户端用）。
// 两者共用同一套 HMAC 推导，但 SigV4 的查询签名有几个硬性差别（UNSIGNED-PAYLOAD、X-Amz-* 进 canonical query），
// 所以单独实现，并且用 AWS 官方文档里的测试向量做交叉验证——见 tests/presign.selftest.ts。

import crypto from "node:crypto";

import { uriEncode } from "../store/r2Store.ts";

/** 允许的最长有效期：取件码不该比这个更久（单位秒） */
export const MAX_TTL_SEC = 3600;

export interface PresignInput {
  /** 虚拟主机风格很难匹配 R2 的自定义域名，这里固定走 path-style：/{bucket}/{key} */
  host: string;
  /** 以 / 开头、含桶名的完整路径，如 /biji-assets/clips/abc/1.png（内部会逐段编码，斜杠不编码） */
  canonicalUri: string;
  /** 有效期（秒），会被夹到 (0, MAX_TTL_SEC] */
  ttlSec: number;
  /** 注入时钟，便于测试 */
  now: Date;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  service?: string;
}

function hmac(key: crypto.BinaryLike | crypto.KeyObject, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** 把 ttl 夹进合法区间：太短没意义、太长等于把桶公开 */
export function clampTtl(ttlSec: number): number {
  if (!Number.isFinite(ttlSec)) return 300;
  return Math.max(1, Math.min(MAX_TTL_SEC, Math.floor(ttlSec)));
}

export interface PresignResult {
  /** 完整可直连的 URL（含签名） */
  url: string;
  /** 到点失效的时间戳（毫秒），给客户端做缓存/续签判断 */
  expiresAtMs: number;
  signature: string;
}

/**
 * 生成 R2 GET 的 presigned URL。
 *
 * 关键顺序（错一步签名就不对，报 403）：
 *   1. canonical query 必须**按参数名排序 + URI 编码**，值也要编码（Credential 里的 / 编成 %2F）
 *   2. canonical headers 只有 host（+ 调用方要求签进去的额外头）
 *   3. payload hash 用字面量 UNSIGNED-PAYLOAD
 *   4. 最后把 X-Amz-Signature 追加到查询串**末尾**
 */
export function presignGet(input: PresignInput): PresignResult {
  const region = input.region ?? "auto";
  const service = input.service ?? "s3";
  const ttl = clampTtl(input.ttlSec);

  const amzDate = input.now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // yyyymmddThhmmssZ
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  // 逐段编码路径（斜杠保留），与 r2Store.uriEncode 用同一套规则
  const canonicalUri = input.canonicalUri
    .split("/")
    .map((seg, i) => (i === 0 ? "" : uriEncode(decodeURIComponentSafe(seg), false)))
    .join("/");

  const queryPairs: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${input.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(ttl)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const canonicalQuery = queryPairs
    .map(([k, v], i) => [k, v] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${uriEncode(k, true)}=${uriEncode(v, true)}`)
    .join("&");

  const canonicalHeaders = `host:${input.host}\n`;
  const signedHeaders = "host";

  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  let key: Buffer = hmac("AWS4" + input.secretAccessKey, dateStamp);
  key = hmac(key, region);
  key = hmac(key, service);
  key = hmac(key, "aws4_request");
  const signature = hmac(key, stringToSign).toString("hex");

  return {
    url: `https://${input.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    expiresAtMs: input.now.getTime() + ttl * 1000,
    signature,
  };
}

/** 已经是合法编码的路径段再 decode 会抛（如含 % 但不是 %XX），这里失败就按原样 */
function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}