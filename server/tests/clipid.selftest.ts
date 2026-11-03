// 任务6 自测：幂等键（同一篇文章不同跟踪参数 → 同一个 id；不同文章 → 不同 id）
// 用法: node tests/clipid.selftest.ts
import { clipIdFor } from "../src/store/clipId.ts";

// 真实文章（用户转发的第 1 篇）的两种形态：完整版 vs 去掉跟踪参数版
const u1Full =
  "https://mp.weixin.qq.com/s?__biz=MzkyNDA5MjgyNw==&mid=2247510388&idx=1&sn=5a8fa81a2ad2b093f87455a9f7a35716&chksm=c01698f083e3d17fca3bdfffe4ef11ed03cf0ed18020babfd1543fc38774d0e57f298e846d6f&mpshare=1&scene=1&srcid=11038a9WbA12ipPxNKSIID5k&sharer_shareinfo=f3095c364c286e6876bf33b86d1fc5db&sharer_shareinfo_first=f3095c364c286e6876bf33b86d1fc5db#rd";
const u1Trim =
  "https://mp.weixin.qq.com/s?__biz=MzkyNDA5MjgyNw==&mid=2247510388&idx=1&sn=5a8fa81a2ad2b093f87455a9f7a35716";
// 另一篇公众号文章（不同 __biz/mid/sn）
const u2 =
  "https://mp.weixin.qq.com/s?__biz=MzYyNTc3Mjc5Nw==&mid=2247485669&idx=1&sn=8b27409199d093a44524f0fc64472bd7";
// 小红书短链（不同平台）
const u3 = "https://xhslink.cn/o/2l4f0QG4tPC";

const checks: Array<[string, boolean]> = [
  ["同一篇（完整 vs 去跟踪参数）→ 同一个 id", clipIdFor(u1Full) === clipIdFor(u1Trim)],
  ["不同文章 → 不同 id", clipIdFor(u1Full) !== clipIdFor(u2)],
  ["id 有前缀 wx_（公众号）", clipIdFor(u1Full).startsWith("wx_")],
  ["小红书 id 前缀 url_", clipIdFor(u3).startsWith("url_")],
  ["id 是 16 位十六进制（wx_ 后）", /^wx_[0-9a-f]{16}$/.test(clipIdFor(u1Full))],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log((ok ? "✅" : "❌") + " " + name);
  if (!ok) failed++;
}
console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
