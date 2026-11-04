// B站内容获取（公开 API，无需登录）
//
// 流程：b23.tv 短链 → safeGet 跟随重定向 → 最终 URL 里取 BV 号
//      → api.bilibili.com/x/web-interface/view?bvid= → 标题/简介/UP主/时长/分P/封面
//
// 能力说明：本模块只取元数据 + 封面（capability=metadata-only）；
// 字幕/正文评论属于阶段二。封面图 host（hdslb.com）已加入图片白名单。
import { safeGet } from "./http.ts";
import { assetIdFor } from "./article.ts";
import type { NormalizedItem } from "../store/types.ts";

const BV_RE = /\/video\/(BV[0-9A-Za-z]{8,12})/;

/** 短链入口只允许 b23.tv；重定向只允许留在 B站视频域（每一跳都检查） */
const B23_HOSTS: ReadonlySet<string> = new Set(["b23.tv"]);
const BILIBILI_VIDEO_HOSTS: ReadonlySet<string> = new Set([
  "b23.tv",
  "www.bilibili.com",
  "bilibili.com",
  "m.bilibili.com",
]);
/** 元数据 API 只允许 api.bilibili.com，重定向不得离开 */
const BILIBILI_API_HOSTS: ReadonlySet<string> = new Set(["api.bilibili.com"]);

/** 测试注入用：与 safeGet 同签名 */
export type SafeGetLike = typeof safeGet;

/** 从短链跟随重定向，取最终 URL 里的 BV 号 */
export async function resolveBvid(shortUrl: string, fetchFn: SafeGetLike = safeGet): Promise<string> {
  let entryHost: string;
  try {
    entryHost = new URL(shortUrl).hostname.toLowerCase();
  } catch {
    throw new Error("B站短链不是合法 URL");
  }
  if (!B23_HOSTS.has(entryHost)) {
    throw new Error("B站短链主机不在白名单：" + entryHost);
  }
  const res = await fetchFn(shortUrl, {}, {
    tries: 2,
    maxRedirects: 5,
    allowedHostCheck: (host) => BILIBILI_VIDEO_HOSTS.has(host),
  });
  const m = res.finalUrl.match(BV_RE);
  if (!m) throw new Error("短链未解析出 BV 号：" + res.finalUrl.slice(0, 90));
  return m[1]!;
}

export interface BilibiliMeta {
  bvid: string;
  title: string;
  desc: string;
  owner: string;
  durationSec: number;
  coverUrl: string;
}

/** 调 B站公开 API 取视频元数据 */
export async function fetchBilibiliMeta(bvid: string, fetchFn: SafeGetLike = safeGet): Promise<BilibiliMeta> {
  const api = "https://api.bilibili.com/x/web-interface/view?bvid=" + encodeURIComponent(bvid);
  const res = await fetchFn(api, { Referer: "https://www.bilibili.com/" }, {
    tries: 2,
    allowedHosts: BILIBILI_API_HOSTS,
  });
  const data = JSON.parse(res.body.toString("utf8")) as {
    code: number;
    message?: string;
    data?: {
      title?: string;
      desc?: string;
      owner?: { name?: string };
      duration?: number;
      pic?: string;
    };
  };
  if (data.code !== 0 || !data.data) {
    throw new Error("B站 API 返回 code=" + data.code + " " + (data.message ?? ""));
  }
  const v = data.data;
  return {
    bvid,
    title: String(v.title ?? ""),
    desc: String(v.desc ?? ""),
    owner: String(v.owner?.name ?? ""),
    durationSec: Number(v.duration ?? 0),
    coverUrl: String(v.pic ?? ""),
  };
}

/** 短链 → B站元数据（入口：供 pipeline 调用） */
export async function fetchBilibiliFromShortLink(
  shortUrl: string,
  fetchFn: SafeGetLike = safeGet
): Promise<NormalizedItem> {
  const bvid = await resolveBvid(shortUrl, fetchFn);
  const meta = await fetchBilibiliMeta(bvid, fetchFn);
  return {
    source: "bilibili",
    sourceUrl: shortUrl,
    title: meta.title,
    desc: meta.desc,
    coverUrl: meta.coverUrl,
    capability: "metadata-only",
    note: "UP主 " + meta.owner + " · 时长 " + meta.durationSec + " 秒（公开 API；字幕待阶段二）",
  };
}
