/**
 * 附件地址解析层
 *
 * 问题：图片存在数据库里，编辑器里要显示就得有个能用的地址。
 *  用 `blob:` 地址不行——它只在当前这次打开有效，刷新/重开就失效，
 *  如果把它写进文档，下次打开整篇的图全是破图。
 *
 * 办法：**文档里存 `asset://<附件id>`，只在显示时换成真地址**。
 *  - 读出来给编辑器用：resolveAssetRefs()  → asset:// 换成 blob: 地址
 *  - 存回数据库之前：  unresolveAssetRefs() → blob: 地址换回 asset://
 * 这样文档永远只认自己的附件 id，换存储（将来接 R2）也不影响文档内容。
 */
import { repo } from "./db";

export const ASSET_SCHEME = "asset://";

/** blob 地址 ↔ 附件 id 的双向表 */
const assetToUrl = new Map<string, string>();
const urlToAsset = new Map<string, string>();

/** 拿附件的可显示地址（带缓存，同一个附件不会重复造地址） */
export async function assetUrl(assetId: string): Promise<string | null> {
  const cached = assetToUrl.get(assetId);
  if (cached) return cached;

  const row = await repo.getAsset(assetId);
  if (!row) return null;

  const url = URL.createObjectURL(new Blob([row.data], { type: row.mime }));
  assetToUrl.set(assetId, url);
  urlToAsset.set(url, assetId);
  return url;
}

/** 释放所有地址（换页/退出时用，避免内存里堆着一堆 blob 地址） */
export function releaseAssetUrls(): void {
  for (const url of assetToUrl.values()) URL.revokeObjectURL(url);
  assetToUrl.clear();
  urlToAsset.clear();
}

/** 上传：把文件存进附件表，返回可显示的地址（编辑器拿它当图片 src） */
export async function uploadAsset(
  file: File,
  pageId: string | null,
  kind: string
): Promise<{ assetId: string; url: string }> {
  const data = await file.arrayBuffer();
  const row = await repo.putAsset({
    pageId,
    kind,
    mime: file.type || "application/octet-stream",
    data,
  });
  const url = (await assetUrl(row.id)) ?? "";
  return { assetId: row.id, url };
}

/* ---------------- 文档内的引用替换 ---------------- */

async function walkResolve(node: unknown): Promise<unknown> {
  if (typeof node === "string") {
    if (node.startsWith(ASSET_SCHEME)) {
      const url = await assetUrl(node.slice(ASSET_SCHEME.length));
      return url ?? node; // 附件丢了就保留原样，至少能看出这里本来有张图
    }
    return node;
  }
  if (Array.isArray(node)) {
    const out: unknown[] = [];
    for (const item of node) out.push(await walkResolve(item));
    return out;
  }
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = await walkResolve(v);
    return out;
  }
  return node;
}

function walkUnresolve(node: unknown): unknown {
  if (typeof node === "string") {
    const assetId = urlToAsset.get(node);
    return assetId ? ASSET_SCHEME + assetId : node;
  }
  if (Array.isArray(node)) return node.map(walkUnresolve);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = walkUnresolve(v);
    return out;
  }
  return node;
}

/** asset:// → 真地址（读出来给编辑器显示之前调用） */
export function resolveAssetRefs<T>(doc: T): Promise<T> {
  return walkResolve(doc) as Promise<T>;
}

/** 真地址 → asset://（写进数据库之前调用） */
export function unresolveAssetRefs<T>(doc: T): T {
  return walkUnresolve(doc) as T;
}
