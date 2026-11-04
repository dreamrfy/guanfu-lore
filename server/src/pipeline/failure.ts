// 失败分类与有限次重试（对应需求 SNAP-02 / CLIP-03）
//
// 规则：
// - 失败按原因归类；**只有明确的网络类失败才自动重试**（指数退避）
// - 鉴权、白名单、SSRF 拒绝、内容缺失、数据库、JSON、程序错误一律不重试
// - 未知错误归 internal_error 且默认不重试——宁可早失败，也不做无意义重试
// - 图片失败或正文残缺 → 状态只能是 partial，不得标 complete（SNAP-02）
import { FetchError } from "../fetch/http.ts";
import type { FailReason } from "../store/types.ts";

const NETWORK_PATTERNS = [
  /超时/,
  /timeout/i,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /ENOTFOUND/,
  /EAI_AGAIN/,
  /EPIPE/,
  /socket hang up/i,
  /network/i,
  /fetch failed/i,
  /连接被重置/,
  /连接超时/,
];

const INTERNAL_PATTERNS = [
  /SQLITE_/i,
  /database/i,
  /数据库/,
  /constraint/i,
  /JSON/i,
  /SyntaxError/,
  /TypeError/,
  /ReferenceError/,
  /UNDEFINED_VALUE/,
];

/** 把一次抓取的错误归类为 FailReason */
export function classifyFailure(error: unknown): FailReason {
  if (error instanceof FetchError) {
    switch (error.code) {
      case "EBLOCKED":
        return "blocked_address";
      case "ETOOLARGE":
        return "response_too_large";
      case "EPROTOCOL":
        return "unsupported_type";
      case "EREDIRECT":
        return "internal_error";
      case "ETIMEOUT":
        return "network_timeout";
      case "EHTTP": {
        const status = error.status ?? 0;
        if (status === 408 || status === 429 || status >= 500) return "network_timeout";
        if (status === 401 || status === 403) return "blocked_by_platform";
        return "content_missing";
      }
      case "ENETWORK":
        return "network_timeout";
    }
  }

  const err = error as NodeJS.ErrnoException | undefined;
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? error);

  // 网络错误看 code 与明确措辞
  if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE"].includes(code)) {
    return "network_timeout";
  }
  // 先判“不可重试”的具体类别，避免被 network 之类宽泛词吞掉
  if (/去验证|环境异常|访问过于频繁|请在微信客户端打开|风控|验证码/.test(msg)) return "blocked_by_platform";
  if (/不在白名单|白名单|拒绝环回|拒绝本机|拒绝内网|EBLOCKED|SSRF/i.test(msg)) return "blocked_address";
  if (/超过上限|TOOLARGE|响应体过大/.test(msg)) return "response_too_large";
  if (/未找到正文容器|js_content|正文为空/.test(msg)) return "content_missing";
  if (/图片|image/i.test(msg)) return "images_failed";
  if (INTERNAL_PATTERNS.some((re) => re.test(msg))) return "internal_error";
  if (/仅支持|不支持|非法地址|只允许 http\/https|url/i.test(msg)) return "unsupported_type";

  // 明确 HTTP 状态码
  const httpStatus = msg.match(/\bHTTP\s+(\d{3})\b/);
  if (httpStatus) {
    const status = Number(httpStatus[1]);
    if (status === 408 || status === 429 || status >= 500) return "network_timeout";
    if (status === 401 || status === 403) return "blocked_by_platform";
    return "content_missing";
  }

  if (NETWORK_PATTERNS.some((re) => re.test(msg))) return "network_timeout";

  // 未知错误：默认不重试
  return "internal_error";
}

/** 是否值得自动重试：只有网络类失败才重试（其他类型重试也不会成功） */
export function isRetryable(error: unknown): boolean {
  return classifyFailure(error) === "network_timeout";
}

/** 有限次重试 + 指数退避（默认 2 次重试，500ms 起） */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { tries?: number; baseDelayMs?: number; retryOn?: (e: unknown) => boolean } = {}
): Promise<T> {
  const tries = opts.tries ?? 2;
  const base = opts.baseDelayMs ?? 500;
  const retryOn = opts.retryOn ?? isRetryable;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === tries || !retryOn(e)) throw e;
      await new Promise((r) => setTimeout(r, base * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}
