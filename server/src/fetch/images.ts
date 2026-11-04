// 图片下载与本地落盘（G1：资源只存编号）
//
// 实测要点（见 docs/P0-…记录 §8.4）：
// - 图片地址来自正文 HTML（mmbiz.qpic.cn），无防盗链（带/不带 Referer 均可下载）
// - 扩展名以 Content-Type 为准（白名单映射），并用文件魔数复核，不信任远端路径/声明
// - assetId 由源地址 SHA-256 派生（稳定），同地址去重
// - 落盘统一走存储层 writeAssetFile（P3-01：不再在抓取层重复实现路径校验）
import { safeGet, IMAGE_MAX_BODY_BYTES } from "./http.ts";
import type { AssetRef } from "../store/types.ts";
import { writeAssetFile } from "../store/localStore.ts";
import { shortHash } from "../store/hash.ts";

/** 公众号图床 + B站封面图床（hdslb.com 及其子域） */
const IMG_HOSTS = new Set(["mmbiz.qpic.cn", "mmbiz.qlogo.cn"]);
const IMG_HOST_SUFFIXES = [".hdslb.com"];

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** 图片主机白名单（公众号图床 + B站封面） */
export function isAllowedImageHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (IMG_HOSTS.has(h)) return true;
  return IMG_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix) && h.length > suffix.length);
}

/** 用文件魔数判断真实类型（防 Content-Type 伪装） */
export function sniffImageExt(body: Buffer): "png" | "jpg" | "gif" | "webp" | null {
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "png";
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "jpg";
  if (body.length >= 6 && body.subarray(0, 4).toString("latin1") === "GIF8") return "gif";
  if (
    body.length >= 12 &&
    body.subarray(0, 4).toString("latin1") === "RIFF" &&
    body.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export interface ImageDownloadResult {
  assetRef: AssetRef;
  bytes: number;
  outPath: string;
}

export interface DownloadImageOptions {
  /** 这些主机也算允许（例如 B站封面图 i1.hdslb.com 由 isAllowedImageHost 覆盖，这里留给将来扩展） */
  extraAllowedHosts?: ReadonlySet<string>;
}

/** 下载一张图片 → 落盘 → 返回 AssetRef（G1：只存编号） */
export async function downloadImage(sourceUrl: string, opts: DownloadImageOptions = {}): Promise<ImageDownloadResult> {
  const target = new URL(sourceUrl);
  if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("只允许 http/https");
  if (!isAllowedImageHost(target.hostname) && !opts.extraAllowedHosts?.has(target.hostname.toLowerCase())) {
    throw new Error("图片主机不在白名单：" + target.hostname);
  }

  const res = await safeGet(
    sourceUrl,
    { Referer: "https://mp.weixin.qq.com/" },
    {
      tries: 2,
      maxBytes: IMAGE_MAX_BODY_BYTES,
      // 重定向也必须留在图片白名单内（防“先过白名单再跳到任意主机”）
      allowedHostCheck: (host) => isAllowedImageHost(host) || (opts.extraAllowedHosts?.has(host) ?? false),
    }
  );
  const contentType = String(res.headers["content-type"] || "").split(";")[0]!.trim().toLowerCase();
  const declaredExt = EXT_BY_CONTENT_TYPE[contentType];
  const sniffed = sniffImageExt(res.body);
  // 声明类型与真实内容必须都落在白名单内；二者不一致时以真实内容为准并拒绝
  if (!sniffed) throw new Error("图片内容不是受支持的类型（Content-Type=" + (contentType || "缺失") + "）");
  if (declaredExt && declaredExt !== sniffed) {
    throw new Error("图片内容与声明类型不符（声明 " + contentType + "，实际 " + sniffed + "）");
  }
  const ext = sniffed;

  const assetId = shortHash(sourceUrl, 16);
  const outPath = writeAssetFile(assetId, ext, res.body);
  return { assetRef: { assetId, provider: "local", ext }, bytes: res.body.length, outPath };
}
