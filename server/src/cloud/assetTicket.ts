// 「临时签名取件码」的业务层：把一个对象 key 换成一个到点失效的 URL 交给 App
//
// 方案 C（用户已定）的分工：
//   · 服务端：持有 R2 密钥，只签发 URL（**App 永远拿不到密钥**）
//   · App：拿着 URL 直连对象存储取图/取 JSON（R2 出流量免费）
//   · 桶保持私有，URL 过期即失效 → 整个仓库不对公网可读
//
// 这一层的职责只有三件：**校验 key 安全**、**校验账号 ID（防 URL 注入）**、**夹住有效期**。

import { clampTtl, presignGet, MAX_TTL_SEC, type PresignResult } from "./presign.ts";
import { loadR2Config, type R2Config } from "../store/r2Store.ts";

/** 默认有效期 5 分钟：够 App 拉完一篇剪藏的图，又短到没什么盗链价值 */
export const DEFAULT_TTL_SEC = 300;

/** 允许签发的 key 前缀（与 store 层的键规则一致：资产 assets/、剪藏记录 clips/） */
export const ALLOWED_KEY_PREFIXES = ["assets/", "clips/"] as const;

export class AssetKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetKeyError";
  }
}

/**
 * 校验对象 key 是否可签发。**这是唯一的入口闸门**，任何取件码都必须先过它。
 * 拒绝：空、超长、反斜杠、绝对路径、`..` / `.` / 空段（路径穿越）、控制字符、前缀不在白名单。
 */
export function assertSafeAssetKey(key: string): string {
  if (typeof key !== "string" || key.length === 0) throw new AssetKeyError("key 为空");
  if (key.length > 512) throw new AssetKeyError("key 过长");
  if (key.includes("\\")) throw new AssetKeyError("key 含反斜杠");
  if (key.startsWith("/")) throw new AssetKeyError("key 不能是绝对路径");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(key)) throw new AssetKeyError("key 含控制字符");
  if (key.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) {
    throw new AssetKeyError("key 含空段/相对段（疑似路径穿越）");
  }
  if (!ALLOWED_KEY_PREFIXES.some((p) => key.startsWith(p))) {
    throw new AssetKeyError(`key 前缀不在白名单（只允许 ${ALLOWED_KEY_PREFIXES.join(" / ")}）`);
  }
  return key;
}

/** R2 账号 ID 必须是 32 位 hex —— 它是拼进主机名的，不校验就等于把主机名交给调用方 */
export function assertSafeAccountId(accountId: string): string {
  if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new AssetKeyError("R2_ACCOUNT_ID 形状不对（应为 32 位 hex）");
  return accountId;
}

export interface AssetTicket {
  key: string;
  url: string;
  /** 到点失效（毫秒时间戳） */
  expiresAtMs: number;
  ttlSec: number;
}

export interface IssueOptions {
  ttlSec?: number;
  now?: Date;
  /** 测试用：直接注入配置，默认从环境变量读 */
  config?: R2Config;
}

function r2Host(config: R2Config): string {
  return `${assertSafeAccountId(config.accountId)}.r2.cloudflarestorage.com`;
}

/** 签发单个取件码 */
export function issueAssetTicket(key: string, options: IssueOptions = {}): AssetTicket {
  const safeKey = assertSafeAssetKey(key);
  const config = options.config ?? loadR2Config();
  const now = options.now ?? new Date();
  const ttlSec = clampTtl(options.ttlSec ?? DEFAULT_TTL_SEC);
  const signed: PresignResult = presignGet({
    host: r2Host(config),
    canonicalUri: `/${config.bucket}/${safeKey}`,
    ttlSec,
    now,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  return { key: safeKey, url: signed.url, expiresAtMs: signed.expiresAtMs, ttlSec };
}

/** 批量签发（一篇剪藏的多张图，一次请求全拿） */
export function issueAssetTickets(keys: string[], options: IssueOptions = {}): AssetTicket[] {
  if (!Array.isArray(keys)) throw new AssetKeyError("keys 必须是数组");
  if (keys.length > 200) throw new AssetKeyError("一次最多 200 个 key");
  // 先把所有 key 校验完再读配置：**校验不该依赖环境变量**（少配一个变量不该让"bad key"被误报成配置错误）
  keys.forEach((k) => assertSafeAssetKey(k));
  const config = options.config ?? loadR2Config();
  const now = options.now ?? new Date();
  return keys.map((k) => issueAssetTicket(k, { ...options, config, now }));
}

export { MAX_TTL_SEC };