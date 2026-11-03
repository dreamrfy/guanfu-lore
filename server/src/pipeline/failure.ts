// 失败分类与有限次重试（对应需求 SNAP-02 / CLIP-03）
//
// 规则：
// - 失败按原因归类，只有“网络类”失败才自动重试（指数退避）
// - 图片失败或正文残缺 → 状态只能是 partial，不得标 complete（SNAP-02）
import type { FailReason } from "../store/types.ts";

/** 把一次抓取的错误归类为 FailReason */
export function classifyFailure(error: unknown): FailReason {
  const msg = String((error as Error)?.message ?? error);
  if (/去验证|环境异常|访问过于频繁|请在微信客户端打开/.test(msg)) return "blocked_by_platform";
  if (/未找到正文容器|js_content/.test(msg)) return "content_missing";
  if (/超时|timeout|fetch failed|网络/i.test(msg)) return "network_timeout";
  if (/图片|image/i.test(msg)) return "images_failed";
  if (/仅支持|不支持|白名单/.test(msg)) return "unsupported_type";
  return "network_timeout";
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
