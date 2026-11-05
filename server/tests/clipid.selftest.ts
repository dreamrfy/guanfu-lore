// 幂等键自测（P2-01：SHA-256 取 16 位十六进制，替代 32 位 FNV）
// 覆盖：跟踪参数不影响 id、不同文章不同 id、前缀正确、碰撞压力测试。
// 用法: node tests/clipid.selftest.ts
import { clipIdFor } from "../src/store/clipId.ts";
import { shortHash, sha256Hex } from "../src/store/hash.ts";

const u1Full =
  "https://mp.weixin.qq.com/s?__biz=MzkyNDA5MjgyNw==&mid=2247510388&idx=1&sn=5a8fa81a2ad2b093f87455a9f7a35716&chksm=c01698f083e3d17fca3bdfffe4ef11ed03cf0ed18020babfd1543fc38774d0e57f298e846d6f&mpshare=1&scene=1&srcid=11038a9WbA12ipPxNKSIID5k&sharer_shareinfo=f3095c364c286e6876bf33b86d1fc5db&sharer_shareinfo_first=f3095c364c286e6876bf33b86d1fc5db#rd";
const u1Trim =
  "https://mp.weixin.qq.com/s?__biz=MzkyNDA5MjgyNw==&mid=2247510388&idx=1&sn=5a8fa81a2ad2b093f87455a9f7a35716";
const u2 =
  "https://mp.weixin.qq.com/s?__biz=MzYyNTc3Mjc5Nw==&mid=2247485669&idx=1&sn=8b27409199d093a44524f0fc64472bd7";
const u3 = "https://xhslink.cn/o/2l4f0QG4tPC";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

check("同一篇（完整 vs 去跟踪参数）→ 同一个 id", clipIdFor(u1Full) === clipIdFor(u1Trim));
check("chksm 不同不影响 id", clipIdFor(u1Trim) === clipIdFor(u1Trim + "&chksm=abcdef0123456789abcdef"));
check("不同文章 → 不同 id", clipIdFor(u1Full) !== clipIdFor(u2));
check("id 有前缀 wx_（公众号）", clipIdFor(u1Full).startsWith("wx_"));
check("小红书 id 前缀 url_", clipIdFor(u3).startsWith("url_"));
check("id 是 16 位十六进制（wx_ 后）", /^wx_[0-9a-f]{16}$/.test(clipIdFor(u1Full)));
check("非法 URL 不抛异常", clipIdFor("not-a-url").startsWith("invalid_"));
check("其他平台忽略查询串", clipIdFor("https://b23.tv/abc?a=1") === clipIdFor("https://b23.tv/abc?b=2"));
check("末尾斜杠归一", clipIdFor("https://b23.tv/abc") === clipIdFor("https://b23.tv/abc/"));

// 摘要实现：SHA-256 前缀，确定性
check("shortHash 稳定", shortHash("abc") === shortHash("abc"));
check("shortHash 长度 16", shortHash("abc").length === 16);
check("sha256Hex 是 64 位十六进制", /^[0-9a-f]{64}$/.test(sha256Hex("abc")));

// N-12：资源编号统一 16 位十六进制（注释/实现/测试一致）
const { assetIdFor } = await import("../src/fetch/article.ts");
const aid = assetIdFor("https://mmbiz.qpic.cn/mmbiz_png/example/0?wx_fmt=png");
check("assetIdFor 输出 16 位十六进制", /^[0-9a-f]{16}$/.test(aid), aid);
check("assetIdFor 稳定", assetIdFor("https://mmbiz.qpic.cn/x.png") === assetIdFor("https://mmbiz.qpic.cn/x.png"));
check("不同图片地址 → 不同 assetId", assetIdFor("https://mmbiz.qpic.cn/a.png") !== assetIdFor("https://mmbiz.qpic.cn/b.png"));

// 碰撞压力测试：5 万条相似文章（mid 递增）不得出现重复
const seen = new Set<string>();
let collisions = 0;
for (let i = 0; i < 50000; i++) {
  const id = clipIdFor(
    "https://mp.weixin.qq.com/s?__biz=MzkyNDA5MjgyNw==&mid=" + i + "&idx=1&sn=5a8fa81a2ad2b093f87455a9f7a35716"
  );
  if (seen.has(id)) collisions += 1;
  else seen.add(id);
}
check("5 万条相似文章无碰撞（实际 " + collisions + "）", collisions === 0);

// 哈希分布粗检：前 1 位十六进制应覆盖全部 16 种
const buckets = new Set<string>();
for (let i = 0; i < 2000; i++) buckets.add(shortHash("sample-" + i, 16)[0]!);
check("首字符分布覆盖 16 个桶（实际 " + buckets.size + "）", buckets.size === 16, String(buckets.size));

// 2026-11-05 冒烟发现：真实转发会出现 http://mp.weixin.qq.com/...，拍板为自动升级 https 再抓。
const { canonicalWechatArticleUrl } = await import("../src/fetch/article.ts");
const httpArticle =
  "http://mp.weixin.qq.com/s?__biz=MzkyNDA5MjgyNw==&mid=2247510388&idx=1&sn=5a8fa81a2ad2b093f87455a9f7a35716&chksm=c01698f083e3d17fca3bdfffe4ef11ed03cf0ed18020babfd1543fc38774d0e57f298e846d6f#rd";
check("http 公众号链接不再抛异常", (() => {
  try {
    canonicalWechatArticleUrl(httpArticle);
    return true;
  } catch {
    return false;
  }
})());
check("http 升级后 origin 是 https", canonicalWechatArticleUrl(httpArticle).origin === "https://mp.weixin.qq.com");
check(
  "同一篇 http vs https → 同一个幂等 id",
  clipIdFor(httpArticle) === clipIdFor(u1Trim),
  clipIdFor(httpArticle) + " vs " + clipIdFor(u1Trim)
);
check("http 带非标准端口仍拒绝", (() => {
  try {
    canonicalWechatArticleUrl("http://mp.weixin.qq.com:8080/s?__biz=MzkyNDA5MjgyNw==&mid=1&idx=1&sn=5a8fa81a2ad2b093f87455a9f7a35716");
    return false;
  } catch {
    return true;
  }
})());
check("http 其他主机仍拒绝", (() => {
  try {
    canonicalWechatArticleUrl("http://example.com/s?__biz=MzkyNDA5MjgyNw==&mid=1&idx=1&sn=5a8fa81a2ad2b093f87455a9f7a35716");
    return false;
  } catch {
    return true;
  }
})());
check("https 非 443 端口仍拒绝", (() => {
  try {
    canonicalWechatArticleUrl("https://mp.weixin.qq.com:8443/s?__biz=MzkyNDA5MjgyNw==&mid=1&idx=1&sn=5a8fa81a2ad2b093f87455a9f7a35716");
    return false;
  } catch {
    return true;
  }
})());

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
