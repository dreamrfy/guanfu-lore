// 微信客服消息 → 归一化条目
//
// 实测结论（docs/P0-…记录 §8.2）：
// - 公众号文章   → msgtype=link（host=mp.weixin.qq.com）
// - 小红书（两种形态）→ msgtype=link（xiaohongshu.com）或 msgtype=text（xhslink.cn 短链）
// - B站          → msgtype=text（文案里含 b23.tv 短链）
// - 抖音         → msgtype=text（文案里含 v.douyin.com 短链 + 口令）
//
// capability：full=正文+图可抓；metadata-only=仅标题/描述/封面（阶段二补正文）。
//
// 健壮性约定（P1-02）：非法 URL、未知 host、空内容、未知 msgtype 一律返回 null，
// 且任何分支都不抛异常——这是长时间自动运行的前提（一条坏消息不能拖垮整轮）。
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

/** 安全解析 URL：非法或非 http/https 返回 null（不抛异常） */
export function safeParseUrl(raw: string): URL | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 4096) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname || u.hostname.length > 255) return null;
  return u;
}

/** 文案里能抠出的标题：抖音是「看看【作者的作品】后的正文标题」，其余取第一段 */
export function titleFromShareText(text: string): string {
  // 抖音：看看【咖喱的图文作品】莱昂纳少太有腔调了# 小李子 …
  // 【】里是「作者+作品类型」，真正的标题在】之后、第一个 # 或链接之前
  const douyinTitle = text.match(/看看【[^】]{1,40}】\s*([^#\n]{1,80}?)(?=\s*#|https?:|\s*$)/);
  if (douyinTitle) return douyinTitle[1]!.trim();
  // 兜底：老形态只有【】内容可用
  const douyinFallback = text.match(/看看【([^\]]{1,80})】/);
  if (douyinFallback) return douyinFallback[1]!.trim();
  return text.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** 转发文案里的话题标签：小红书「#xxx[话题]#」；抖音口令「# 标签」（# 后可带空格） */
export function tagsFromShareText(text: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const t = raw.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      tags.push(t);
    }
  };
  // 小红书：#xxx[话题]#
  for (const m of text.matchAll(/#([^#\s]{1,40})\[话题\]#/g)) add(m[1]!);
  // 抖音：# 标签（先去掉 URL；标签是连续一段，到空白为止——
  // 否则口令尾部的乱码「:8pm eBG:/ …」会被吞进最后一个标签）
  const noUrl = text.replace(/https?:\/\/\S+/g, " ");
  for (const m of noUrl.matchAll(/#\s*([^\s#]{1,40})/g)) add(m[1]!);
  return tags;
}

/** 转发文案里能抽到的作者：抖音「看看【xxx的图文作品】」；小红书「@xxx 的笔记」 */
export function authorFromShareText(text: string): string {
  const douyin = text.match(/看看【([^】]{1,40}?)的(?:图文|视频)作品】/);
  if (douyin) return douyin[1]!.trim();
  const xhs = text.match(/@([^\s@，。！？]{1,30}?)\s*的笔记/);
  if (xhs) return xhs[1]!.trim();
  return "";
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function noteFor(platform: SourcePlatform, msgType: "link" | "text", shortLink: boolean): string {
  if (platform === "wechat_mp") return "来自微信客服 " + msgType + " 消息";
  if (platform === "bilibili") return "来自微信客服 " + msgType + " 消息（公开 API 取元数据；字幕待阶段二）";
  return (
    "来自微信客服 " +
    msgType +
    " 消息（" +
    (shortLink ? "短链，需解析跳转；" : "") +
    "该平台正文需浏览器渲染，属阶段二）"
  );
}

/** 解析一条微信客服消息（link 或 text）→ 归一化条目；无法识别返回 null */
export function parseKfMessage(msg: Record<string, unknown>): NormalizedItem | null {
  if (!msg || typeof msg !== "object") return null;
  const msgType = String(msg.msgtype ?? "");

  if (msgType === "link") {
    const link = (msg.link ?? {}) as Record<string, unknown>;
    const rawUrl = String(link.url ?? "").trim();
    const u = safeParseUrl(rawUrl);
    if (!u) return null;
    const platform = platformOfHost(u.hostname.toLowerCase());
    // 未知平台不作为 metadata-only 条目进入后续抓取
    if (platform === "unknown") return null;

    const title = truncate(String(link.title ?? "").trim(), 300);
    const desc = truncate(String(link.desc ?? "").trim(), 1000);
    const cardText = `${title}\n${desc}`;
    return {
      source: platform,
      sourceUrl: rawUrl,
      title,
      desc,
      coverUrl: String(link.pic_url ?? ""),
      author: authorFromShareText(cardText),
      tags: tagsFromShareText(cardText),
      capability: platform === "wechat_mp" ? "full" : "metadata-only",
      note: noteFor(platform, "link", false),
    };
  }

  if (msgType === "text") {
    const text = (msg.text as Record<string, unknown> | undefined)?.content;
    const content = typeof text === "string" ? text : "";
    if (!content.trim()) return null;

    // 一条文案里可能有多个链接：取第一个“可解析且平台已知”的
    let picked: { url: string; platform: SourcePlatform } | null = null;
    for (const candidate of extractUrls(content)) {
      const u = safeParseUrl(candidate);
      if (!u) continue;
      const platform = platformOfHost(u.hostname.toLowerCase());
      if (platform === "unknown") continue;
      picked = { url: candidate, platform };
      break;
    }
    if (!picked) return null;

    return {
      source: picked.platform,
      sourceUrl: picked.url,
      title: truncate(titleFromShareText(content), 200),
      desc: truncate(content.slice(0, 200), 200),
      coverUrl: "",
      author: authorFromShareText(content),
      tags: tagsFromShareText(content),
      capability: picked.platform === "wechat_mp" ? "full" : "metadata-only",
      note: noteFor(picked.platform, "text", /xhslink\.cn|b23\.tv|v\.douyin\.com/.test(picked.url)),
    };
  }

  return null;
}
