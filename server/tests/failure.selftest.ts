// 失败分类与重试自测（P1-04）
// 红线：只有明确的网络类失败可重试；数据库/SSRF/白名单/未知错误必须 attempts=1
// 用法: node tests/failure.selftest.ts
import { classifyFailure, isRetryable, withRetry } from "../src/pipeline/failure.ts";
import { FetchError } from "../src/fetch/http.ts";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

// ---- 分类 ----
const cases: Array<[unknown, string, string]> = [
  [new Error("去验证链接有效性"), "blocked_by_platform", "被平台拦截"],
  [new Error("未找到正文容器 js_content"), "content_missing", "正文缺失"],
  [new Error("HTTP 404"), "content_missing", "404 归内容缺失（不可重试）"],
  [new Error("HTTP 503"), "network_timeout", "5xx 归网络（可重试）"],
  [new Error("HTTP 429"), "network_timeout", "429 归网络（可重试）"],
  [new Error("HTTP 403"), "blocked_by_platform", "403 归平台拦截"],
  [new Error("请求超时 (timeout)"), "network_timeout", "超时"],
  [new Error("仅支持抓取公众号文章（host 须为 mp.weixin.qq.com）"), "unsupported_type", "不支持类型"],
  [new Error("图片主机不在白名单：evil.example"), "blocked_address", "图片白名单拒绝"],
  [new Error("SQLITE_CONSTRAINT: NOT NULL constraint failed"), "internal_error", "数据库错误不重试"],
  [new Error("Unexpected token < in JSON at position 0"), "internal_error", "JSON 错误不重试"],
  [new Error("Cannot read properties of undefined (reading 'x')"), "internal_error", "程序错误不重试"],
  [new Error("完全未知的故障 boom"), "internal_error", "未知错误不重试"],
  [Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }), "network_timeout", "连接重置"],
  [Object.assign(new Error("getaddrinfo ENOTFOUND x"), { code: "ENOTFOUND" }), "network_timeout", "DNS 失败"],
  [new FetchError("EBLOCKED", "拒绝环回/私有/保留地址", false), "blocked_address", "FetchError EBLOCKED"],
  [new FetchError("ETOOLARGE", "响应体超过上限", false), "response_too_large", "响应超限"],
  [new FetchError("ETIMEOUT", "请求超时", true), "network_timeout", "FetchError 超时"],
  [new FetchError("EPROTOCOL", "只允许 http/https", false), "unsupported_type", "协议不允许"],
  [new FetchError("EHTTP", "HTTP 500", true, 500), "network_timeout", "FetchError 5xx"],
  [new FetchError("EHTTP", "HTTP 400", false, 400), "content_missing", "FetchError 4xx"],
];

for (const [err, expected, label] of cases) {
  const got = classifyFailure(err);
  check(label + " → " + got, got === expected, "期望 " + expected + "，实际 " + got);
}

// 可重试判定
check("网络超时可重试", isRetryable(new Error("请求超时")));
check("5xx 可重试", isRetryable(new FetchError("EHTTP", "HTTP 502", true, 502)));
check("数据库错误不可重试", !isRetryable(new Error("SQLITE_CONSTRAINT: NOT NULL")));
check("SSRF 拒绝不可重试", !isRetryable(new FetchError("EBLOCKED", "拒绝环回", false)));
check("白名单拒绝不可重试", !isRetryable(new Error("图片主机不在白名单：evil.example")));
check("超限响应不可重试", !isRetryable(new FetchError("ETOOLARGE", "响应体超过上限", false)));

// ---- 重试行为 ----
let attempts = 0;
const flaky = async (): Promise<string> => {
  attempts++;
  if (attempts < 3) throw new Error("请求超时");
  return "成功";
};
const retried = await withRetry(flaky, { tries: 3, baseDelayMs: 10 });
check("网络类失败自动重试后成功", retried === "成功" && attempts === 3, "attempts=" + attempts);

async function expectNoRetry(label: string, err: Error): Promise<void> {
  let n = 0;
  try {
    await withRetry(async () => {
      n += 1;
      throw err;
    }, { tries: 3, baseDelayMs: 10 });
    check(label + " 应抛出而非重试", false);
  } catch {
    check(label + " 只尝试 1 次（attempts=" + n + "）", n === 1, "attempts=" + n);
  }
}

await expectNoRetry("数据库错误", new Error("SQLITE_CONSTRAINT: NOT NULL"));
await expectNoRetry("SSRF 拒绝", new FetchError("EBLOCKED", "拒绝环回/私有/保留地址", false));
await expectNoRetry("白名单拒绝", new Error("主机不在白名单：evil.example"));
await expectNoRetry("正文缺失", new Error("未找到正文容器 js_content"));
await expectNoRetry("未知错误", new Error("完全未知的故障 boom"));

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
