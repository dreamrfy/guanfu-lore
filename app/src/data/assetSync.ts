/**
 * 附件随页面同步（S02）
 *
 * 页面文档里图片是 `asset://<附件id>` 引用，别的设备拿到页面后没有这些字节就是破图。
 * 所以推页面前先把附件字节传到服务端（POST /api/sync/assets，S01 的接口），传过记标记，下次跳过。
 *
 * 失败策略：附件上传失败**不拦页面推送**——文字比图重要，图留给下一次同步补传；
 * 拉取端（S03）发现缺附件再从服务端取回，两端都不依赖对方成功。
 */
import { repo, db } from "./db";
import { ASSET_SCHEME } from "./assets";
import { loadClipServerUrl, loadClipToken } from "./clipApi";

const UPLOADED_KEY = "syncUploadedAssets";

/** mime → 服务端 ext 白名单（与 server/src/cloud/assetSync.ts 的 ASSET_EXT_MIME 对齐） */
export function extFromMime(mime: string): string | null {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

/**
 * 从页面 payload 里收集附件 id：
 *  - blocks 里嵌的 `asset://<id>` 字符串（任意层级，图片 src / 嵌入块等）；
 *  - `page.coverAssetId`（裸 id，不带 scheme）。
 * 纯函数，可单测。
 */
export function collectAssetRefs(payload: unknown): string[] {
  const found = new Set<string>();
  const visit = (node: unknown, key?: string): void => {
    if (typeof node === "string") {
      if (node.startsWith(ASSET_SCHEME)) {
        const id = node.slice(ASSET_SCHEME.length);
        if (id) found.add(id);
      } else if (key === "coverAssetId" && node) {
        found.add(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) visit(v, k);
    }
  };
  visit(payload);
  return [...found];
}

/** 已传标记（assetId → 上传时间戳），meta 表持久化 */
export async function getUploadedAssets(): Promise<Record<string, number>> {
  const raw = await repo.getMeta<Record<string, number>>(UPLOADED_KEY);
  return raw && typeof raw === "object" ? raw : {};
}

async function markAssetsUploaded(ids: string[]): Promise<void> {
  const map = await getUploadedAssets();
  for (const id of ids) map[id] = Date.now();
  await repo.setMeta(UPLOADED_KEY, map);
}

export type AssetUploadOutcome = {
  /** 本次真正上传成功并记了标记的 */
  uploaded: string[];
  /** 上传失败的（留待下次同步补传） */
  failed: string[];
  /** 本地没有字节或非图片格式，无从上传 */
  skipped: string[];
};

async function uploadOne(id: string, ext: string, data: ArrayBuffer): Promise<void> {
  const server = await loadClipServerUrl();
  const token = await loadClipToken();
  const res = await fetch(
    `${server}/api/sync/assets?assetId=${encodeURIComponent(id)}&ext=${encodeURIComponent(ext)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data,
    }
  );
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error ?? "";
    } catch {
      /* 非 JSON 响应 */
    }
    throw new Error(`HTTP ${res.status}${detail ? `：${detail}` : ""}`);
  }
}

/** 逐个补传未上传过的附件；单个失败不影响其余 */
export async function uploadPendingAssets(assetIds: string[]): Promise<AssetUploadOutcome> {
  const outcome: AssetUploadOutcome = { uploaded: [], failed: [], skipped: [] };
  const uploaded = await getUploadedAssets();
  for (const id of assetIds) {
    if (uploaded[id]) continue;
    const row = await repo.getAsset(id);
    const ext = row ? extFromMime(row.mime) : null;
    if (!row || !ext) {
      outcome.skipped.push(id);
      continue;
    }
    try {
      await uploadOne(id, ext, row.data);
      await markAssetsUploaded([id]);
      outcome.uploaded.push(id);
    } catch {
      outcome.failed.push(id);
    }
  }
  return outcome;
}

/** push 一批变更前调用：收集所有 page 改动里的附件引用并补传（collection/record 不带附件） */
export async function syncAssetsForChanges(
  changes: Array<{ entity: string; op: string; payload: unknown }>
): Promise<AssetUploadOutcome> {
  const ids = new Set<string>();
  for (const change of changes) {
    if (change.entity !== "page" || change.op !== "upsert") continue;
    for (const id of collectAssetRefs(change.payload)) ids.add(id);
  }
  if (ids.size === 0) return { uploaded: [], failed: [], skipped: [] };
  return uploadPendingAssets([...ids]);
}

/* ---------------- 拉取端补缺图（S03） ---------------- */

export type AssetFetchOutcome = {
  /** 从服务端取回并已落本地 assets 表（保留远端 id） */
  fetched: string[];
  /** 服务端也没有或响应不合法（破图留给用户可见，下次同步再试） */
  missing: string[];
};

async function fetchAssetFromServer(id: string): Promise<{ mime: string; data: ArrayBuffer } | null> {
  const server = await loadClipServerUrl();
  const token = await loadClipToken();
  const res = await fetch(`${server}/api/sync/assets/${encodeURIComponent(id)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  const mime = (res.headers.get("Content-Type") ?? "").split(";")[0]!.trim();
  // 只收图片：服务端索引可能指向被覆盖过的任意字节，别把垃圾存进本地库
  if (!mime.startsWith("image/")) return null;
  return { mime, data: await res.arrayBuffer() };
}

/** 本地缺的字节才取；取回后按远端 id 落 assets 表 */
export async function fetchMissingAssets(assetIds: string[], pageId: string | null): Promise<AssetFetchOutcome> {
  const outcome: AssetFetchOutcome = { fetched: [], missing: [] };
  for (const id of assetIds) {
    if (await repo.getAsset(id)) continue;
    try {
      const row = await fetchAssetFromServer(id);
      if (!row) {
        outcome.missing.push(id);
        continue;
      }
      await db.assets.put({
        id,
        pageId,
        kind: "image",
        mime: row.mime,
        size: row.data.byteLength,
        data: row.data,
        createdAt: Date.now(),
      });
      outcome.fetched.push(id);
    } catch {
      outcome.missing.push(id);
    }
  }
  return outcome;
}

/** pull 了一批页面变更后调用：收集引用、按"第一个引用它的页面"归属补缺 */
export async function syncAssetsFromChanges(
  changes: Array<{ entity: string; entityId: string; op: string; payload: unknown }>
): Promise<AssetFetchOutcome> {
  const referrer = new Map<string, string | null>();
  for (const change of changes) {
    if (change.entity !== "page" || change.op !== "upsert") continue;
    for (const id of collectAssetRefs(change.payload)) {
      if (!referrer.has(id)) referrer.set(id, change.entityId);
    }
  }
  if (referrer.size === 0) return { fetched: [], missing: [] };
  let outcome: AssetFetchOutcome = { fetched: [], missing: [] };
  for (const [id, pageId] of referrer) {
    const one = await fetchMissingAssets([id], pageId);
    outcome.fetched.push(...one.fetched);
    outcome.missing.push(...one.missing);
  }
  return outcome;
}
