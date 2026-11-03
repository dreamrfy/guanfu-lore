// 微信客服消息 → 归一化条目
//
// 实测结论（docs/P0-…记录 §8.2）：
// - 公众号文章   → msgtype=link（host=mp.weixin.qq.com）
// - 小红书（两种形态）→ msgtype=link（xiaohongshu.com）或 msgtype=text（xhslink.cn 短链）
// - B站          → msgtype=text（文案里含 b23.tv 短链）
// - 抖音         → msgtype=text（文案里含 v.douyin.com 短链 + 口令）
//
// 能力说明（capability）：full=正文+图可抓；metadata-only=仅标题/描述/封面（阶段二补正文）。
import type { NormalizedItem, SourcePlatform } from "../store/types.ts";

const HOST_PLATFORM: Array<[RegExp, SourcePlatform]> = [
  [/^(www\.)?xiaohongshu\.com$|^xhslink\.cn$/, "xiaohongshu"],
  [/^b23\.tv$|^(www\.)?bilibili\.com$/, "bilibili"],
  [/^(v\.)?douyin\.com$|^www\.iesdouyin\.com$/, "douyin"],
  [/^mp\.weixin\.qq\.com$/, "wechat_mp"],
];

export function platformOfHost(host: string): SourcePlatform | "unknown" {
  const h = host.toLowerCase();
  for (const [re, platform] of HOST_PLATFORM) {
    if (re.test(h)) return platform;
  }
  return "unknown";
}

/** 从文本里提取 URL（不含中文/标点/空白结尾） */
export function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s\u4e00-\u9fa5，。！？、；："'）】<>]+/g;
  return text.match(re) ?? [];
}

/** 文案里能抠出的标题：抖音是「看看【xxx】」，小红书是第一段 */
export function titleFromShareText(text: string): string {
  const douyin = text.match(/看看【([^\]]{1,80})】/);
  if (douyin) return douyin[1]!.trim();
  return text.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** capability：公众号=full（正文+图可抓）；小红书/抖音=B站 同级，先只取元数据 */
function capabilityOf(platform: SourcePlatform): NormalizedItem["capability"] {
  return platform === "wechat_mp" ? "full" : "metadata-only";
}

/** 解析一条微信客服消息（link 或 text）→ 归一化条目；无法识别返回 null */
export function parseKfMessage(msg: Record<string, unknown>): NormalizedItem | null {
  const msgType = String(msg.msgtype ?? "");
  if (msgType === "link") {
    const link = (msg.link ?? {}) as Record<string, string>;
    const url = String(link.url ?? "");
    if (!url) return null;
    const host = new URL(url).hostname.toLowerCase();
    const platform = platformOfHost(host);
    return {
      source: platform,
      sourceUrl: url,
      title: String(link.title ?? "").trim(),
      desc: String(link.desc ?? "").trim(),
      coverUrl: String(link.pic_url ?? ""),
      capability: platform === "wechat_mp" ? "full" : "metadata-only",
      note: "来自微信客服 link 消息",
    };
  }
  if (msgType === "text") {
    const content = String((msg.text as Record<string, string> | undefined)?.content ?? "");
    if (!content) return null;
    const urls = extractUrls(content);
    if (urls.length === 0) return null;
    const host = new URL(urls[0]!).hostname.toLowerCase();
    const platform = platformOfHost(host);
    if (platform === "unknown") return null;
    return {
      source: platform,
      sourceUrl: urls[0]!,
      title: titleFromShareText(content),
      desc: content.slice(0, 200),
      coverUrl: "",
      capability: platform === "wechat_mp" ? "full" : "metadata-only",
      note: "来自微信客服 text 消息（短链，需解析跳转）",
    };
  }
  return null;
}
