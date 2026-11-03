// 安全 HTTP 层（对应需求 SNAP-05「资源地址验证需防止服务端访问内部地址」）
//
// 1) 只允许 http/https
// 2) 自定义 DNS lookup：解析后逐个校验，命中环回/私有/链路本地/保留地址直接拒绝；
//    校验与连接用同一次解析结果，避免 DNS rebinding
// 3) 自己接管重定向：每一跳都重新校验目标（不交给自动跟随）
import http from "node:http";
import https from "node:https";
import dns from "node:dns";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export interface SafeResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function isBlockedAddress(ip: string, family: number): boolean {
  if (family === 6 || String(ip).includes(":")) {
    const s = String(ip).toLowerCase();
    if (s === "::1" || s === "::") return true;
    if (s.startsWith("fe80") || s.startsWith("fc") || s.startsWith("fd")) return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isBlockedAddress(mapped[1]!, 4) : false;
  }
  const p = String(ip).split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224) return true;
  return false;
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
  dns.lookup(hostname, { all: true, family: options.family }, (err, list) => {
    if (err) return callback(err as NodeJS.ErrnoException);
    const addrs = Array.isArray(list) ? list : [];
    for (const a of addrs) {
      if (isBlockedAddress(String(a.address), a.family)) {
        return callback(
          Object.assign(new Error("拒绝环回/私有/保留地址：" + hostname + " -> " + String(a.address)), {
            code: "EBLOCKED",
          })
        );
      }
    }
    if (addrs.length === 0) {
      return callback(Object.assign(new Error("域名无解析结果：" + hostname), { code: "EBLOCKED" }));
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

/** 只做解析与校验；抓取仍使用调用方传入的原始 URL */
export function parseTarget(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("非法地址");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("只允许 http/https");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "localhost.localdomain") {
    throw new Error("拒绝本机主机名");
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && isBlockedAddress(host, 4)) throw new Error("拒绝内网直连 IP");
  return u;
}

function requestOnce(target: URL, headers: Record<string, string>): Promise<SafeResponse> {
  return new Promise((resolve, reject) => {
    const mod = target.protocol === "https:" ? https : http;
    const req = mod.request(
      target,
      {
        method: "GET",
        headers: { "User-Agent": USER_AGENT, Accept: "*/*", ...headers },
        lookup: safeLookup,
        timeout: 30000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) })
        );
      }
    );
    req.on("timeout", () => req.destroy(new Error("请求超时")));
    req.on("error", reject);
    req.end();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 自己接管重定向：每一跳都重新校验 */
export async function safeGet(
  rawUrl: string,
  headers: Record<string, string> = {},
  opts: { tries?: number; maxRedirects?: number } = {}
): Promise<SafeResponse> {
  const tries = opts.tries ?? 3;
  const maxRedirects = opts.maxRedirects ?? 5;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      let target = parseTarget(rawUrl);
      for (let hop = 0; hop <= maxRedirects; hop++) {
        const res = await requestOnce(target, headers);
        if (res.status >= 300 && res.status < 400 && res.headers.location) {
          const loc = Array.isArray(res.headers.location) ? String(res.headers.location[0]) : String(res.headers.location);
          target = parseTarget(new URL(loc, target).toString());
          await sleep(300);
          continue;
        }
        if (res.status < 200 || res.status >= 300) throw new Error("HTTP " + res.status);
        return res;
      }
      throw new Error("重定向次数超过上限");
    } catch (e) {
      lastErr = e;
      if (attempt === tries) throw e;
      await sleep(300 * attempt * 3);
    }
  }
  throw lastErr;
}
