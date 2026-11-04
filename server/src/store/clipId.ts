// 剪藏幂等键：由源 URL 规范化后派生（同一篇文章，不同跟踪参数 → 同一个 id）
//
// 规则（公众号）：只取 __biz / mid / idx / sn 四个标识参数（其余全是跟踪参数，
//   如 mpshare/srcid/sharer_shareinfo/chksm——chksm 抓取时才需要，去重比对不用）。
// 其他平台：host + pathname（去掉查询串与 fragment）。
//
// 说明：这里只做“去重比对用的 id”，抓取时仍使用原始 URL（一字不删）。
// 摘要算法：SHA-256 取 16 位十六进制（64 位熵）——旧版 FNV-1a 只有 32 位状态，
// 不同文章一旦碰撞会被 INSERT OR REPLACE 覆盖，已废弃（P2-01）。
import { shortHash } from "./hash.ts";

export function clipIdFor(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "invalid_" + shortHash("invalid|" + url);
  }
  const host = u.hostname.toLowerCase();
  if (host === "mp.weixin.qq.com" && u.pathname === "/s") {
    const p = u.searchParams;
    const key =
      "mp.weixin.qq.com/s|" + ["__biz", "mid", "idx", "sn"].map((k) => p.get(k) ?? "").join("|");
    return "wx_" + shortHash(key);
  }
  // 其他平台：host + pathname（去查询串与 fragment）；末尾斜杠归一
  const path = u.pathname.replace(/\/+$/, "") || "/";
  return "url_" + shortHash(host + path);
}
