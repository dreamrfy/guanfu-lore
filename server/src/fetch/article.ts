// 公众号文章解析（纯函数，无网络调用）
//
// 已实测的坑（都必须处理，见 docs/P0-微信剪藏链路验证与云方案选型记录-v1.md §8.4）：
// 1) 正文容器带隐藏样式（visibility:hidden/opacity:0）→ 必须清除，否则离线 HTML 看不到正文
// 2) 懒加载图在 data-src，且可能没有 src 属性 → 要“补 src”
// 3) HTML 实体（&amp;）必须先转义还原
//
// 图片落盘与网络抓取不在本模块（分别由 images.ts 与调用方的安全 HTTP 层负责）。
import {
  extractJsContent,
  sanitizeContent,
  unescapeEntities,
  imgUrlOf,
  metaContent,
  htmlTitle,
  htmlToText,
  escapeHtml,
} from "./htmlSanitize.ts";
import { shortHash } from "../store/hash.ts";

export interface ArticleMeta {
  title: string;
  account: string;
  author: string;
  publishedAt: string | null;
  textLen: number;
  riskHits: string[];
}

export interface ImageManifestEntry {
  /** 稳定编号（G1）：由图片源地址哈希派生 */
  assetId: string;
  sourceUrl: string;
  from: "data-src" | "src";
}

export interface ParsedArticle {
  meta: ArticleMeta;
  /** 清洗后的正文 HTML（图片仍是外链；落盘由 images.ts / 存储层处理） */
  contentHtml: string;
  /** 正文里出现的图片地址（去重、有序）——图片落盘的输入 */
  imageManifest: ImageManifestEntry[];
  rawHtmlBytes: number;
}

const RISK_MARKERS = ["环境异常", "去验证", "访问过于频繁", "该内容已被发布者删除", "请在微信客户端打开"];

/** 抓取目标的域名白名单：本模块只负责公众号文章（对应需求 SNAP-05 的 host 校验） */
export const ALLOWED_ARTICLE_HOSTS = new Set(["mp.weixin.qq.com"]);
export const ARTICLE_ORIGIN = "https://mp.weixin.qq.com";

/**
 * 把转发来的文章 URL 重建为“常量 origin + 逐个白名单校验后的参数”。
 * ① origin 必须是 mp.weixin.qq.com；② 参数逐个严格校验；
 * ③ 重建后的地址不含任何额外参数（防参数注入/开放跳转）。
 */
export function canonicalWechatArticleUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.origin !== ARTICLE_ORIGIN) {
    throw new Error("仅支持抓取公众号文章（origin 须为 " + ARTICLE_ORIGIN + "），实际：" + u.origin);
  }
  if (u.pathname !== "/s") throw new Error("非公众号文章链接：" + u.pathname);
  const p = u.searchParams;
  const must = (key: string, re: RegExp): string => {
    const v = p.get(key);
    if (!v || !re.test(v)) throw new Error("文章链接缺少或非法参数：" + key);
    return v;
  };
  const out = new URL("/s", ARTICLE_ORIGIN);
  out.searchParams.set("__biz", must("__biz", /^[A-Za-z0-9+/=]{10,32}$/));
  out.searchParams.set("mid", must("mid", /^\d{1,15}$/));
  out.searchParams.set("idx", must("idx", /^\d{1,4}$/));
  out.searchParams.set("sn", must("sn", /^[0-9a-f]{10,48}$/));
  const chksm = p.get("chksm");
  if (chksm) {
    if (!/^[0-9a-f]{20,96}$/.test(chksm)) throw new Error("chksm 参数非法");
    out.searchParams.set("chksm", chksm);
  }
  return out;
}

/** 稳定编号：对源地址做 SHA-256 摘要（纯字符串摘要，非安全用途；16 位 = 64 位熵） */
export function assetIdFor(sourceUrl: string): string {
  return shortHash(sourceUrl, 12);
}

/** 正文纯文本（用于长度校验与摘要） */
function textOf(html: string): string {
  return htmlToText(html);
}

/** 解析已抓取的文章 HTML：元数据 + 清洗正文 + 图片清单 */
export function parseArticleHtml(html: string, sourceUrl: string): ParsedArticle {
  const contentRaw = extractJsContent(html);
  if (!contentRaw) {
    const riskHits = RISK_MARKERS.filter((k) => html.includes(k));
    throw new Error(
      "未找到正文容器 js_content" + (riskHits.length ? "（命中限制提示：" + riskHits.join("/") + "）" : "")
    );
  }

  const h1 = html.match(/<h1[^>]*class="[^"]*rich_media_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  const ogTitle = metaContent(html, "og:title");
  const title =
    (h1 ? unescapeEntities(h1[1]!.replace(/<[^>]+>/g, "")).trim() : "") || ogTitle || htmlTitle(html) || "(无标题)";
  const author = metaContent(html, "og:article:author");
  const nick = html.match(/data-nickname="([^"]*)"/);
  const account = nick ? unescapeEntities(nick[1]!) : "";
  const ct = html.match(/var\s+ct\s*=\s*"?(\d{10,13})"?/);
  const publishedAt = ct ? new Date(Number(ct[1]!) * 1000).toISOString() : null;

  const contentHtml = sanitizeContent(contentRaw);
  const textLen = textOf(contentHtml).length;
  const riskHits = RISK_MARKERS.filter((k) => html.includes(k));

  const imageManifest: ImageManifestEntry[] = [];
  const seen = new Set<string>();
  for (const tag of contentHtml.match(/<img\b[^>]*>/gi) ?? []) {
    const picked = imgUrlOf(tag);
    if (picked.from === "none") continue;
    if (!/^https?:\/\//i.test(picked.url) || seen.has(picked.url)) continue;
    seen.add(picked.url);
    imageManifest.push({ assetId: assetIdFor(picked.url), sourceUrl: picked.url, from: picked.from });
  }

  return {
    meta: { title, account, author, publishedAt, textLen, riskHits },
    contentHtml,
    imageManifest,
    rawHtmlBytes: Buffer.byteLength(html),
  };
}

/** 生成离线 HTML（样式内置；图片由调用方决定内嵌或外链） */
export function buildOfflineHtml(
  meta: { title: string; account: string; author: string; publishedAt: string | null },
  contentHtml: string,
  sourceUrl: string
): string {
  const style = [
    ":root{color-scheme:light dark}",
    "#js_content,#js_content *{visibility:visible !important;opacity:1 !important}",
    'body{max-width:44em;margin:0 auto;padding:16px;line-height:1.75;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}',
    "h1{font-size:1.5em;line-height:1.4}",
    ".meta{color:#888;font-size:.85em;margin:.5em 0 1.5em}",
    "img{max-width:100%;height:auto;display:block;margin:1em auto}",
    "pre,code{background:rgba(127,127,127,.15);border-radius:4px}",
    "pre{padding:10px;overflow-x:auto}",
    "table{border-collapse:collapse;width:100%}",
    "td,th{border:1px solid rgba(127,127,127,.4);padding:6px 8px}",
    "blockquote{border-left:3px solid rgba(127,127,127,.4);margin:1em 0;padding-left:1em;color:#666}",
  ].join("\n");

  const head =
    '<!DOCTYPE html>\n<html lang="zh-CN"><head><meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    // 纵深防御：即便清洗漏了某个属性，CSP 也禁止脚本/外链/表单提交
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\' data:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">\n' +
    '<meta name="referrer" content="no-referrer">\n' +
    "<title>" + escapeHtml(meta.title) + "</title>\n<style>\n" + style + "\n</style></head><body>\n";
  const metaLine =
    '<div class="meta">' +
    escapeHtml(meta.account || meta.author) +
    (meta.publishedAt ? " · 发布于 " + meta.publishedAt.slice(0, 10) : "") +
    ' · 原文：<a href="' + escapeHtml(sourceUrl) + '">' + escapeHtml(sourceUrl.slice(0, 80)) + "</a></div>\n";
  return head + "<h1>" + escapeHtml(meta.title) + "</h1>\n" + metaLine + contentHtml + "\n</body></html>";
}
