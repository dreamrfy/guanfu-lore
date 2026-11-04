// 微信客服消息拉取（只读，不消耗客户额度）
//
// 流程（官方接口）：
//   1) GET  /cgi-bin/gettoken?corpid=&corpsecret=   → access_token（缓存到过期前）
//   2) POST /cgi-bin/kf/sync_msg?access_token=      → 增量消息 + next_cursor
//
// 设计要点：
// - 传输层可注入（transport）：测试用假 transport 跑离线用例，生产用安全 HTTP 层
// - 目标主机写死白名单 qyapi.weixin.qq.com，且仍走 safeRequest 的 SSRF/上限/重试保护
// - cursor 与 token 落本地文件（data/kf-cursor.json），轮询不会重复拉同一批
// - 凭证只从仓库外文件读（config.loadSecrets），本文件不出现任何凭证值
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../config.ts";
import { safeRequest } from "../fetch/http.ts";

export const WECOM_API_ORIGIN = "https://qyapi.weixin.qq.com";
export const WECOM_API_HOSTS: ReadonlySet<string> = new Set(["qyapi.weixin.qq.com"]);

export interface WecomTransport {
  request(method: "GET" | "POST", url: string, body?: unknown): Promise<{ status: number; text: string }>;
}

/** 生产传输：走安全 HTTP 层（host 白名单 + 响应上限 + 仅网络错误重试） */
export const defaultWecomTransport: WecomTransport = {
  async request(method, url, body) {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), "utf8");
    const res = await safeRequest(method, url, {
      headers: { "Content-Type": "application/json" },
      body: payload,
      tries: 2,
      maxBytes: 2 * 1024 * 1024,
      allowedHosts: WECOM_API_HOSTS,
    });
    return { status: res.status, text: res.body.toString("utf8") };
  },
};

export interface WecomClientOptions {
  corpId: string;
  appSecret: string;
  transport?: WecomTransport;
  /** 提前多少秒刷新 token（默认 300 秒） */
  tokenSkewSec?: number;
}

interface TokenState {
  token: string;
  expiresAt: number;
}

export interface SyncResult {
  messages: Array<Record<string, unknown>>;
  nextCursor: string;
  /**
   * 与 cursor 成对返回的续拉凭据（接口若返回）。
   * 注意：它不是回调签名用的 token，也不是 access_token；不返回时就是空串，
   * 调用方不应把自己缓存的旧值继续发回去（N-08）。
   */
  nextToken: string;
  hasMore: boolean;
}

interface WecomEnvelope {
  errcode?: number;
  errmsg?: string;
  access_token?: string;
  expires_in?: number;
  next_cursor?: string;
  token?: string;
  has_more?: number;
  msg_list?: Array<Record<string, unknown>>;
}

export class WecomError extends Error {
  readonly errcode: number;
  constructor(errcode: number, message: string) {
    super("微信接口错误 " + errcode + "：" + message);
    this.name = "WecomError";
    this.errcode = errcode;
  }
}

function parseEnvelope(text: string): WecomEnvelope {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("微信接口返回非 JSON（长度 " + text.length + "）");
  }
  if (!data || typeof data !== "object") throw new Error("微信接口返回结构异常");
  const env = data as WecomEnvelope;
  const code = Number(env.errcode ?? 0);
  if (code !== 0) throw new WecomError(code, String(env.errmsg ?? ""));
  return env;
}

export class WecomClient {
  private readonly transport: WecomTransport;
  private readonly corpId: string;
  private readonly appSecret: string;
  private readonly tokenSkewMs: number;
  private tokenState: TokenState | null = null;

  constructor(opts: WecomClientOptions) {
    if (!opts.corpId || !opts.appSecret) throw new Error("微信客服凭证不完整（corpId/appSecret）");
    this.corpId = opts.corpId;
    this.appSecret = opts.appSecret;
    this.transport = opts.transport ?? defaultWecomTransport;
    this.tokenSkewMs = (opts.tokenSkewSec ?? 300) * 1000;
  }

  /** 取 access_token（带缓存；同一实例内不会重复请求） */
  async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenState && now < this.tokenState.expiresAt) return this.tokenState.token;
    const url =
      WECOM_API_ORIGIN +
      "/cgi-bin/gettoken?corpid=" +
      encodeURIComponent(this.corpId) +
      "&corpsecret=" +
      encodeURIComponent(this.appSecret);
    const res = await this.transport.request("GET", url);
    if (res.status < 200 || res.status >= 300) throw new Error("获取 access_token 失败：HTTP " + res.status);
    const env = parseEnvelope(res.text);
    if (!env.access_token) throw new Error("微信接口未返回 access_token");
    const ttl = Number(env.expires_in ?? 7200) * 1000;
    const ttlMs = Number.isFinite(ttl) && ttl > 0 ? ttl : 0;
    // 缓存不能超过真实过期时间（N-09）：提前量最多取 TTL 的一半
    const refreshBefore = Math.min(this.tokenSkewMs, Math.floor(ttlMs / 2));
    this.tokenState = { token: env.access_token, expiresAt: now + Math.max(0, ttlMs - refreshBefore) };
    return env.access_token;
  }

  /**
   * 拉一批增量消息（cursor/token 由调用方持久化）
   */
  async syncMessages(opts: { cursor?: string; token?: string; limit?: number } = {}): Promise<SyncResult> {
    const accessToken = await this.accessToken();
    const url = WECOM_API_ORIGIN + "/cgi-bin/kf/sync_msg?access_token=" + encodeURIComponent(accessToken);
    const body: Record<string, unknown> = {};
    if (opts.cursor) body.cursor = opts.cursor;
    if (opts.token) body.token = opts.token;
    body.limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);

    const res = await this.transport.request("POST", url, body);
    if (res.status < 200 || res.status >= 300) throw new Error("拉取消息失败：HTTP " + res.status);
    const env = parseEnvelope(res.text);
    const list = Array.isArray(env.msg_list) ? env.msg_list : [];
    return {
      messages: list,
      nextCursor: String(env.next_cursor ?? ""),
      nextToken: typeof env.token === "string" ? env.token : "",
      hasMore: Number(env.has_more ?? 0) === 1,
    };
  }
}

/** 接口异常保护（N-08）：has_more=1 却没有 next_cursor 时必须停止翻页，否则会重复拉同一页 */
export function shouldStopPaging(result: SyncResult): boolean {
  return result.hasMore && result.nextCursor === "";
}

// ---------------------------------------------------------------------------
// 轮询游标落盘（data/kf-cursor.json）
//
// 安全说明：写入路径是**常量**（DATA_DIR + 固定文件名），游标值只作为 JSON 内容，
// 不参与任何路径拼接。写入前仍按白名单校验游标字符集，避免异常数据落盘。
// ---------------------------------------------------------------------------

/** 固定文件名（不接收任何外部路径） */
const CURSOR_FILE_NAME = "kf-cursor.json";
/** 微信游标/翻页 token 的字符白名单（+ 长度上限） */
const CURSOR_VALUE_RE = /^[A-Za-z0-9._-]{0,512}$/;

export interface PollCursor {
  cursor: string;
  /** 与 cursor 成对返回的续拉凭据（接口若返回；未返回时为空串，不要伪造旧值） */
  token: string;
  updatedAt: string;
}

function cursorPath(): string {
  return path.join(DATA_DIR, CURSOR_FILE_NAME);
}

function assertCursorValue(name: string, value: string): string {
  const v = String(value ?? "");
  if (!CURSOR_VALUE_RE.test(v)) throw new Error("游标字段非法：" + name);
  return v;
}

export function loadCursor(): PollCursor | null {
  const file = cursorPath();
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<PollCursor>;
    if (typeof data.cursor !== "string") return null;
    return {
      cursor: CURSOR_VALUE_RE.test(data.cursor) ? data.cursor : "",
      token: typeof data.token === "string" && CURSOR_VALUE_RE.test(data.token) ? data.token : "",
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt.slice(0, 40) : "",
    };
  } catch {
    // 游标损坏时从空开始：最坏是重复拉取（幂等落库会去重），不会丢消息
    return null;
  }
}

export function saveCursor(cursor: PollCursor): void {
  const safeCursor = assertCursorValue("cursor", cursor.cursor);
  const safeToken = assertCursorValue("token", cursor.token);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = cursorPath();
  if (path.basename(file) !== CURSOR_FILE_NAME) throw new Error("游标文件路径异常");
  const tmp = file + ".tmp";
  const payload = JSON.stringify(
    { cursor: safeCursor, token: safeToken, updatedAt: new Date().toISOString() },
    null,
    2
  );
  fs.writeFileSync(tmp, payload, "utf8");
  fs.renameSync(tmp, file);
}
