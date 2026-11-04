// 安全 HTTP 层（对应需求 SNAP-05「资源地址验证需防止服务端访问内部地址」）
//
// 防护设计（四层，缺一不可）：
// 1) 只允许 http/https；拒绝本机主机名与 IP 字面量直连内网
// 2) 自定义 DNS lookup：解析后逐个校验，命中环回/私有/链路本地/保留地址直接拒绝；
//    校验与连接用同一次解析结果，避免 DNS rebinding
// 3) 自己接管重定向：每一跳都重新校验目标（不交给自动跟随）
// 4) 响应体有硬上限：Content-Length 与实际累计字节都检查，超限立即断流
//
// 地址判定用 net.BlockList（标准 CIDR 匹配），不再用 startsWith 拼字符串。
// IPv6 采用 fail-closed：只放行全球单播 2000::/3，其余（含 2001:db8::/32 等文档地址）一律拒绝。
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

/** 默认响应体上限：正文 10MB（图片调用方单独放宽到 20MB） */
export const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;
export const IMAGE_MAX_BODY_BYTES = 20 * 1024 * 1024;

export type FetchErrorCode =
  | "EBLOCKED" // SSRF / 主机白名单 / 非法地址
  | "ETOOLARGE" // 响应体超限
  | "EPROTOCOL" // 协议不允许
  | "EREDIRECT" // 重定向异常（次数/循环）
  | "EHTTP" // 非 2xx 状态码
  | "ETIMEOUT" // 超时
  | "ENETWORK"; // 其他网络层错误（DNS/连接重置等）

/** 带分类的网络错误：retryable 决定 safeRequest 是否重试 */
export class FetchError extends Error {
  readonly code: FetchErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(code: FetchErrorCode, message: string, retryable: boolean, status?: number) {
    super(message);
    this.name = "FetchError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export interface SafeResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  /** 跟随重定向后的最终地址（短链解析需要） */
  finalUrl: string;
}

// ---------------------------------------------------------------------------
// 地址判定
// ---------------------------------------------------------------------------

function addSubnets(list: net.BlockList, cidrs: Array<[string, number]>, family: "ipv4" | "ipv6"): void {
  for (const [address, prefix] of cidrs) list.addSubnet(address, prefix, family);
}

/** IPv4 特殊用途地址（RFC 6890 全集里对 SSRF 有意义的范围） */
const BLOCKED_V4 = new net.BlockList();
addSubnets(
  BLOCKED_V4,
  [
    ["0.0.0.0", 8], // 本网络
    ["10.0.0.0", 8], // 私有
    ["100.64.0.0", 10], // 运营商级 NAT
    ["127.0.0.0", 8], // 环回
    ["169.254.0.0", 16], // 链路本地（含云元数据 169.254.169.254）
    ["172.16.0.0", 12], // 私有
    ["192.0.0.0", 24], // IETF 协议分配
    ["192.0.2.0", 24], // TEST-NET-1
    ["192.88.99.0", 24], // 6to4 中继
    ["192.168.0.0", 16], // 私有
    ["198.18.0.0", 15], // 基准测试
    ["198.51.100.0", 24], // TEST-NET-2
    ["203.0.113.0", 24], // TEST-NET-3
    ["192.31.196.0", 24], // AS112（IANA special-use）
    ["192.52.193.0", 24], // AMT（IANA special-use）
    ["192.175.48.0", 24], // AS112 direct delegation
    ["224.0.0.0", 4], // 组播
    ["240.0.0.0", 4], // 保留（含 255.255.255.255 广播）
  ],
  "ipv4"
);

/** IPv6 特殊用途地址；此外「不在 2000::/3 全球单播内」也一律拒绝（fail-closed） */
const BLOCKED_V6 = new net.BlockList();
addSubnets(
  BLOCKED_V6,
  [
    ["::", 128], // 未指定
    ["::1", 128], // 环回
    ["::", 96], // 已废弃的 IPv4 兼容地址
    ["fe80::", 10], // 链路本地（含 fe90::1）
    ["fc00::", 7], // 唯一本地（fc00::/7，含 fd00::/8）
    ["ff00::", 8], // 组播
    ["2001:db8::", 32], // 文档地址
    ["2001::", 23], // IANA IPv6 special-purpose 整段：
    //   2001::/32 Teredo、2001:1::/32 PCP anycast、2001:2::/48 基准测试、
    //   2001:3::/32 AMT、2001:4:112::/48 AS112、2001:10::/28 ORCHID、
    //   2001:20::/28 ORCHIDv2、2001:30::/28 Drone Remote ID
    ["2002::", 16], // 6to4
    ["3fff::", 20], // 文档地址（RFC 9637）
    ["5f00::", 16], // 分段路由
    ["64:ff9b::", 96], // NAT64
    ["64:ff9b:1::", 48], // 本地 NAT64
    ["100::", 64], // 丢弃前缀
    ["2620:4f:8000::", 48], // AS112 direct delegation（在 2000::/3 内，需单独封）
  ],
  "ipv6"
);

/** IPv6 全球单播范围 2000::/3（唯一放行区间） */
const GLOBAL_V6 = new net.BlockList();
GLOBAL_V6.addSubnet("2000::", 3, "ipv6");

/** 点分 IPv4 → 整数（非法返回 null） */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

function intToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join(".");
}

/** 从 IPv4-mapped / IPv4-compatible 形式里取出内嵌 IPv4（没有则返回 null） */
function embeddedIpv4(ip: string): string | null {
  const s = ip.toLowerCase();
  const dotted = s.match(/^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return dotted[1]!;
  // ::ffff:7f00:1 这种十六进制写法
  const hex = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return intToIpv4(((hi << 16) | lo) >>> 0);
  }
  return null;
}

/** 是否属于必须拒绝的地址（family 缺失时按字符串形态推断） */
export function isBlockedAddress(ip: string, family?: number): boolean {
  const raw = String(ip).trim();
  const looksV6 = (family === 6) || raw.includes(":");
  if (!looksV6) {
    if (net.isIP(raw) !== 4) return true; // 无法解析的地址一律拒绝
    return BLOCKED_V4.check(raw, "ipv4");
  }
  const addr = raw.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIP(addr) !== 6) return true;
  const mapped = embeddedIpv4(addr);
  if (mapped) return isBlockedAddress(mapped, 4);
  if (BLOCKED_V6.check(addr, "ipv6")) return true;
  // fail-closed：全球单播之外一律拒绝
  return !GLOBAL_V6.check(addr, "ipv6");
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address?: string | dns.LookupAddress[],
  family?: number
) => void;

/**
 * 校验并“钉住”解析结果：连接用的就是这个已校验地址（IPv4 优先）。
 * 注意：调用方可能带 all:true（Node 24 自动选路），此时回调必须返回【地址数组】，
 * 否则 net 会把字符串当数组解析，报「Invalid IP address: undefined」。
 */
function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  const wantAll = options.all === true;
  const bare = hostname.replace(/^\[|\]$/g, "");
  // 解析阶段就挡掉 IP 字面量，避免绕过 DNS 校验
  if (net.isIP(bare) !== 0) {
    if (isBlockedAddress(bare)) {
      return callback(blockedError(bare));
    }
  }
  dns.lookup(hostname, { all: true, family: options.family }, (err, list) => {
    if (err) return callback(err as NodeJS.ErrnoException);
    const addrs = Array.isArray(list) ? list : [];
    for (const a of addrs) {
      if (isBlockedAddress(String(a.address), a.family)) {
        return callback(blockedError(hostname + " -> " + String(a.address)));
      }
    }
    if (addrs.length === 0) {
      return callback(blockedError("域名无解析结果：" + hostname));
    }
    const v4 = addrs.find((a) => a.family === 4);
    const pick = v4 ?? addrs[0]!;
    if (wantAll) {
      // 关键：all:true 语义下回调必须收数组
      return callback(null, addrs);
    }
    return callback(null, String(pick.address), pick.family);
  });
}

function blockedError(detail: string): NodeJS.ErrnoException {
  return Object.assign(new Error("拒绝环回/私有/保留地址：" + detail), { code: "EBLOCKED" });
}

const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

/** 只做解析与校验；抓取仍使用调用方传入的原始 URL */
export function parseTarget(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FetchError("EPROTOCOL", "非法地址", false);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new FetchError("EPROTOCOL", "只允许 http/https", false);
  }
  if (u.username || u.password) {
    throw new FetchError("EPROTOCOL", "地址不得内嵌用户名口令", false);
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  const bare = host.replace(/^\[|\]$/g, "");
  if (LOCAL_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new FetchError("EBLOCKED", "拒绝本机/内网主机名", false);
  }
  if (net.isIP(bare) !== 0 && isBlockedAddress(bare)) {
    throw new FetchError("EBLOCKED", "拒绝内网/保留地址直连 IP", false);
  }
  return u;
}

// ---------------------------------------------------------------------------
// 单次请求
// ---------------------------------------------------------------------------

export interface RequestOptions {
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: Buffer;
  maxBytes: number;
  timeoutMs: number;
}

/**
 * 单次请求（不做重定向与地址校验，由 safeRequest 调用）。
 * 导出仅供测试直接验证“响应体上限”，生产代码请走 safeRequest/safeGet。
 */
export function requestOnce(target: URL, opts: RequestOptions): Promise<SafeResponse> {
  return new Promise((resolve, reject) => {
    const mod = target.protocol === "https:" ? https : http;
    let settled = false;
    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    const req = mod.request(
      target,
      {
        method: opts.method,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "*/*",
          ...(opts.body ? { "Content-Length": String(opts.body.length) } : {}),
          ...opts.headers,
        },
        lookup: safeLookup as unknown as net.LookupFunction,
        timeout: opts.timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const headers = res.headers;

        // 重定向：不读响应体（避免无界累积），交给上层逐跳校验
        if (status >= 300 && status < 400 && headers.location) {
          res.destroy();
          settled = true;
          resolve({ status, headers, body: Buffer.alloc(0), finalUrl: target.toString() });
          return;
        }

        const declared = Number(headers["content-length"] ?? NaN);
        if (Number.isFinite(declared) && declared > opts.maxBytes) {
          res.destroy();
          fail(
            new FetchError(
              "ETOOLARGE",
              "响应体超过上限（Content-Length=" + declared + " > " + opts.maxBytes + "）",
              false,
              status
            )
          );
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > opts.maxBytes) {
            res.destroy();
            fail(
              new FetchError(
                "ETOOLARGE",
                "响应体超过上限（累计 " + total + " > " + opts.maxBytes + "）",
                false,
                status
              )
            );
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({ status, headers, body: Buffer.concat(chunks), finalUrl: target.toString() });
        });
        res.on("error", (e) => fail(toFetchError(e)));
      }
    );

    req.on("timeout", () => {
      req.destroy();
      fail(new FetchError("ETIMEOUT", "请求超时（" + opts.timeoutMs + "ms）", true));
    });
    req.on("error", (e) => fail(toFetchError(e)));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

/** 把 Node 的网络错误映射成带分类的 FetchError */
function toFetchError(e: unknown): FetchError {
  if (e instanceof FetchError) return e;
  const err = e as NodeJS.ErrnoException;
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? e);
  if (code === "EBLOCKED" || /拒绝环回|拒绝本机|拒绝内网/.test(msg)) {
    return new FetchError("EBLOCKED", msg, false);
  }
  if (code === "ETIMEDOUT" || /超时|timeout/i.test(msg)) {
    return new FetchError("ETIMEOUT", msg, true);
  }
  // DNS 解析失败、连接重置等：临时网络问题，可重试
  return new FetchError("ENETWORK", msg, true);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SafeRequestOptions {
  headers?: Record<string, string>;
  body?: Buffer;
  /** 总尝试次数（含首次） */
  tries?: number;
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
  /** 可选的域名白名单：每一跳的 host 都必须命中 */
  allowedHosts?: ReadonlySet<string>;
  /** 可选的主机判定函数（用于通配后缀，如 *.hdslb.com）；每一跳都会调用 */
  allowedHostCheck?: (host: string) => boolean;
}

/** 任意方法的安全请求（GET 与 POST 共用同一套 SSRF / 上限 / 重试逻辑） */
export async function safeRequest(
  method: "GET" | "POST",
  rawUrl: string,
  opts: SafeRequestOptions = {}
): Promise<SafeResponse> {
  const tries = opts.tries ?? 3;
  const maxRedirects = opts.maxRedirects ?? 5;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  const timeoutMs = opts.timeoutMs ?? 30000;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      let target = parseTarget(rawUrl);
      let currentMethod: "GET" | "POST" = method;
      let currentBody = opts.body;
      for (let hop = 0; hop <= maxRedirects; hop++) {
        if (opts.allowedHosts) {
          const host = target.hostname.toLowerCase().replace(/\.$/, "");
          if (!opts.allowedHosts.has(host)) {
            throw new FetchError("EBLOCKED", "主机不在白名单：" + host, false);
          }
        }
        if (opts.allowedHostCheck) {
          const host = target.hostname.toLowerCase().replace(/\.$/, "");
          if (!opts.allowedHostCheck(host)) {
            throw new FetchError("EBLOCKED", "重定向目标不在白名单：" + host, false);
          }
        }
        const res = await requestOnce(target, {
          method: currentMethod,
          headers: opts.headers ?? {},
          body: currentBody,
          maxBytes,
          timeoutMs,
        });
        if (res.status >= 300 && res.status < 400 && res.headers.location) {
          const loc = Array.isArray(res.headers.location)
            ? String(res.headers.location[0])
            : String(res.headers.location);
          target = parseTarget(new URL(loc, target).toString());
          // 303 与历史上的 301/302 一律降级为 GET（与浏览器一致）
          if (res.status === 301 || res.status === 302 || res.status === 303) {
            currentMethod = "GET";
            currentBody = undefined;
          }
          await sleep(300);
          continue;
        }
        if (res.status >= 200 && res.status < 300) return res;
        if (res.status === 408 || res.status === 429 || res.status >= 500) {
          throw new FetchError("EHTTP", "HTTP " + res.status, true, res.status);
        }
        throw new FetchError("EHTTP", "HTTP " + res.status, false, res.status);
      }
      throw new FetchError("EREDIRECT", "重定向次数超过上限（" + maxRedirects + "）", false);
    } catch (e) {
      const err = toFetchError(e);
      lastErr = err;
      if (!err.retryable || attempt === tries) throw err;
      await sleep(300 * attempt * 3);
    }
  }
  throw toFetchError(lastErr);
}

/** GET 快捷方式（保留旧调用形状：headers + 选项对象） */
export async function safeGet(
  rawUrl: string,
  headers: Record<string, string> = {},
  opts: SafeRequestOptions = {}
): Promise<SafeResponse> {
  return safeRequest("GET", rawUrl, { ...opts, headers: { ...headers, ...(opts.headers ?? {}) } });
}
