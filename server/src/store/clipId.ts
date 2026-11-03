// 剪藏幂等键：由源 URL 规范化后派生（同一篇文章，不同跟踪参数 → 同一个 id）
//
// 规则（公众号）：只取 __biz / mid / idx / sn 四个标识参数（其余全是跟踪参数，
//   如 mpshare/srcid/sharer_shareinfo/chksm——chksm 抓取时才需要，去重比对不用）。
// 其他平台：origin + pathname（去掉查询串与 fragment）。
//
// 说明：这里只做“去重比对用的 id”，抓取时仍使用原始 URL（一字不删）。
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1aHex(text: string, length: number): string {
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h.toString(16).padStart(length, "0").slice(-length);
}

export function clipIdFor(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "invalid-" + fnv1aHex(url, 16);
  }
  const host = u.hostname.toLowerCase();
  if (host === "mp.weixin.qq.com" && u.pathname === "/s") {
    const p = u.searchParams;
    const key =
      "mp.weixin.qq.com/s|" +
      ["__biz", "mid", "idx", "sn"].map((k) => p.get(k) ?? "").join("|");
    return "wx_" + fnv1aHex(key, 16);
  }
  // 其他平台：origin + pathname（去查询串与 fragment）
  return "url_" + fnv1aHex(host + u.pathname, 16);
}
