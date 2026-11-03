// 公众号文章图片下载与本地落盘（G1：资源只存编号）
//
// 实测要点（见 docs/P0-…记录 §8.4）：
// - 图片地址来自正文 HTML（mmbiz.qpic.cn），无防盗链（带/不带 Referer 均可下载）
// - 扩展名以 Content-Type 为准（白名单映射），不信任远端路径
// - assetId 由源地址哈希派生（稳定），同地址去重
import { safeGet } from "./http.ts";
import type { AssetRef } from "../store/types.ts";
import { ASSETS_DIR } from "../config.ts";
import fs from "node:fs";
import path from "node:path";

const IMG_HOSTS = new Set(["mmbiz.qpic.cn", "mmbiz.qlogo.cn"]);

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** 图片主机白名单（公众号图床） */
export function isAllowedImageHost(host: string): boolean {
  return IMG_HOSTS.has(host.toLowerCase());
}

/** 落盘单个文件（路径由本模块常量拼出并做边界校验，不掺外部内容） */
function writeAsset(assetId: string, ext: string, body: Buffer): string {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  if (!/^[0-9a-f]{8,16}$/.test(assetId)) throw new Error("非法 assetId");
  if (!/^[a-z0-9]{2,5}$/.test(ext)) throw new Error("非法扩展名");
  const abs = path.resolve(ASSETS_DIR, assetId + "." + ext);
  if (!abs.startsWith(ASSETS_DIR + path.sep)) throw new Error("输出路径越界");
  fs.writeFileSync(abs, body);
  return abs;
}

export interface ImageDownloadResult {
  assetRef: AssetRef;
  bytes: number;
  outPath: string;
}

/** 下载一张图片 → 落盘 → 返回 AssetRef（G1：只存编号） */
export async function downloadImage(sourceUrl: string): Promise<ImageDownloadResult> {
  const target = new URL(sourceUrl);
  if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("只允许 http/https");
  if (!isAllowedImageHost(target.hostname)) throw new Error("图片主机不在白名单：" + target.hostname);

  const res = await safeGet(sourceUrl, { Referer: "https://mp.weixin.qq.com/" }, 2);
  const contentType = String(res.headers["content-type"] || "image/jpeg").split(";")[0]!.trim().toLowerCase();
  const ext = EXT_BY_CONTENT_TYPE[contentType] ?? "bin";
  if (ext === "bin") throw new Error("未知图片类型：" + contentType);

  const assetId = hashFor(sourceUrl);
  const outPath = writeAsset(assetId, ext, res.body);
  return { assetRef: { assetId, provider: "local", ext }, bytes: res.body.length, outPath };
}

/** 纯字符串摘要（FNV-1a，非安全用途）：由源地址派生稳定 assetId */
function hashFor(sourceUrl: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < sourceUrl.length; i++) {
    h ^= sourceUrl.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(-12);
}
