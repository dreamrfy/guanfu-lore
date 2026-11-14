// 资产同步（S01）：客户端提交的图片字节 → 对象存储，索引落库（决策见任务表模块 S 背景）
//
// 双后端：配齐 R2 环境变量 → 写 R2（生产路径，键规则与抓取管线一致 assets/{assetId}.{ext}）；
// 没配 R2 → 落本地盘 ASSETS_DIR（自测/降级路径，与 localStore 的离线写入器同一目录约定）。
// 索引记 storage 字段，读取时按索引路由，客户端无需感知后端差异。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ASSETS_DIR } from "../config.ts";
import { loadR2Config, putObject, getObject, type R2Config } from "../store/r2Store.ts";

export const ASSET_EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** 单个资产上限（与抓取管线的 MAX_ASSET_BYTES 40MB 对齐） */
export const MAX_ASSET_UPLOAD_BYTES = 40 * 1024 * 1024;

export type AssetUpload = {
  assetId: string;
  ext: string;
  mime: string;
  size: number;
  sha256: string;
  storage: "r2" | "local";
  key: string;
};

export type AssetUploadValidation =
  | { ok: true; assetId: string; ext: string; mime: string }
  | { ok: false; code: string; error: string };

/** 头部校验：assetId 只许安全字符（它直接拼进对象键），ext 限定图片白名单 */
export function validateAssetUpload(
  assetId: string | undefined,
  ext: string | undefined,
): AssetUploadValidation {
  if (!assetId || !/^[A-Za-z0-9_-]{4,80}$/.test(assetId)) {
    return { ok: false, code: "bad_asset_id", error: "assetId 缺失或不合法（只许 4~80 位字母数字_-）" };
  }
  if (!ext || !/^[a-z]{3,5}$/.test(ext)) {
    return { ok: false, code: "bad_ext", error: "缺少 ext 或不合法" };
  }
  const mime = ASSET_EXT_MIME[ext];
  if (!mime) {
    return { ok: false, code: "unsupported_ext", error: "ext 只支持 png/jpg/jpeg/gif/webp" };
  }
  return { ok: true, assetId, ext, mime };
}

export function assetKey(assetId: string, ext: string): string {
  return "assets/" + assetId + "." + ext;
}

/** 懒探测一次 R2 配置；没配就常驻本地模式（进程生命周期内不会反复读环境变量） */
let r2Config: R2Config | null | undefined;
function r2OrUndefined(): R2Config | null {
  if (r2Config !== undefined) return r2Config;
  try {
    r2Config = loadR2Config(process.env);
  } catch {
    r2Config = null;
  }
  return r2Config;
}

export async function putAssetBytes(
  assetId: string,
  ext: string,
  body: Buffer,
): Promise<AssetUpload> {
  const cfg = r2OrUndefined();
  const key = assetKey(assetId, ext);
  if (cfg) {
    await putObject(cfg, key, body, { contentType: ASSET_EXT_MIME[ext] });
    return {
      assetId,
      ext,
      mime: ASSET_EXT_MIME[ext],
      size: body.length,
      sha256: sha256Hex(body),
      storage: "r2",
      key,
    };
  }
  const localPath = path.join(ASSETS_DIR, assetId + "." + ext);
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  fs.writeFileSync(localPath, body);
  return {
    assetId,
    ext,
    mime: ASSET_EXT_MIME[ext],
    size: body.length,
    sha256: sha256Hex(body),
    storage: "local",
    key,
  };
}

export async function getAssetBytes(assetId: string, ext: string): Promise<Buffer | null> {
  const cfg = r2OrUndefined();
  const key = assetKey(assetId, ext);
  if (cfg) {
    return (await getObject(cfg, key)) ?? null;
  }
  const localPath = path.join(ASSETS_DIR, assetId + "." + ext);
  if (!fs.existsSync(localPath)) return null;
  return fs.readFileSync(localPath);
}

function sha256Hex(body: Buffer): string {
  return crypto.createHash("sha256").update(body).digest("hex");
}
