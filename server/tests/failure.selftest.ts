// 任务7 自测：失败分类与重试
// 用法: node tests/failure.selftest.ts
import { classifyFailure, withRetry } from "../src/pipeline/failure.ts";

let failed = 0;
function check(name: string, ok: boolean): void {
  console.log((ok ? "✅" : "❌") + " " + name);
  if (!ok) failed++;
}

// 分类
const cases: Array<[string, string, string]> = [
  ["去验证链接有效性", "blocked_by_platform", "被平台拦截"],
  ["未找到正文容器 js_content", "content_missing", "正文缺失"],
  ["HTTP 404", "network_timeout", "HTTP 错误归网络类"],
  ["请求超时 (timeout)", "network_timeout", "超时"],
  ["仅支持抓取公众号文章（host 须为 mp.weixin.qq.com）", "unsupported_type", "白名单拒绝"],
];
for (const [msg, expected, label] of cases) {
  const got = classifyFailure(new Error(msg));
  check(label + " → " + got, got === expected);
}

// 重试：可重试的错误会退避后重试，最终成功
let attempts = 0;
const flaky = async (): Promise<string> => {
  attempts++;
  if (attempts < 3) throw new Error("请求超时");
  return "成功";
};
const retried = await withRetry(flaky, { tries: 3, baseDelayMs: 50 });
check("网络类失败自动重试后成功", retried === "成功" && attempts === 3);

// 不可重试的错误立即抛出（不浪费次数）
attempts = 0;
const hardFail = async (): Promise<string> => {
  attempts++;
  throw new Error("未找到正文容器 js_content");
};
try {
  await withRetry(hardFail, { tries: 3, baseDelayMs: 50 });
  check("正文缺失应抛出而非重试", false);
} catch (e) {
  check("正文缺失不重试、直接失败（attempts=" + attempts + "）", attempts === 1);
}

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
