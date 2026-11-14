/**
 * 服务器剪藏箱（客户端侧）
 *
 * 微信客服转发进来的文章，服务器每 5 分钟自动收进 R2；客户端在这里看清单，
 * 一键「导入」到剪藏库（正文 + 图片 + 原文快照都落到本地）。
 *
 * 注意：服务器给的图片地址是**5 分钟有效的签名 URL**，所以导入时必须把图片
 * 下载进本地附件库，否则过一会儿图就没了。
 */
import { repo } from "./db";
import { loadClipServerUrl, loadClipToken } from "./clipApi";
import { textToBlocks } from "./ragIndex";
import { clipLinkKey } from "./clipIngest";
import { useStore } from "./store";

export type ServerClipEntry = {
  id: string;
  title: string;
  source: string;
  savedAt: string;
  status: string;
};

export type ServerClipDetail = {
  ok: true;
  clip: {
    id: string;
    title: string;
    source: string;
    sourceUrl: string;
    author: string;
    account: string;
    publishedAt: string | null;
    savedAt: string;
    text: string;
    status: string;
    note: string;
  };
  assets: Array<{ key: string; url: string }>;
  snapshotHtml: string | null;
};

async function get<T>(path: string): Promise<{ status: number; data: T | null }> {
  const server = await loadClipServerUrl();
  const token = await loadClipToken();
  try {
    const res = await fetch(`${server}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = (await res.json().catch(() => null)) as T | null;
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

export async function fetchServerClipIndex(): Promise<ServerClipEntry[]> {
  const { data } = await get<{ ok: boolean; clips: ServerClipEntry[] }>("/api/clips");
  return data?.ok ? (data.clips ?? []) : [];
}

export async function fetchServerClip(id: string): Promise<ServerClipDetail | null> {
  const { data } = await get<ServerClipDetail>(`/api/clips/${encodeURIComponent(id)}`);
  return data?.ok ? data : null;
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/**
 * 下载图片 → 存本地附件库；返回「快照里的文件名 → asset://新id」。
 * 图片走**服务器代理**取（浏览器直连 R2 会被 CORS 拦）。
 */
async function fetchAndStoreImages(
  assets: Array<{ key: string; url: string }>
): Promise<Map<string, string>> {
  const mapping = new Map<string, string>();
  const server = await loadClipServerUrl();
  const token = await loadClipToken();
  for (const asset of assets) {
    try {
      const proxied = `${server}/api/asset?key=${encodeURIComponent(asset.key)}`;
      const res = await fetch(proxied, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      const ext = asset.key.split(".").pop()?.toLowerCase() ?? "png";
      const row = await repo.putAsset({
        pageId: null,
        kind: "clip",
        mime: MIME_BY_EXT[ext] ?? "application/octet-stream",
        data: buf,
      });
      const file = asset.key.split("/").pop() ?? asset.key;
      mapping.set(file, `asset://${row.id}`);
    } catch {
      /* 单张图失败不影响整条导入 */
    }
  }
  return mapping;
}

/** 把快照里的图片引用换成 asset:// */
export function rewriteSnapshotImages(html: string, mapping: Map<string, string>): string {
  return html.replace(/(\bsrc\s*=\s*")([^"]+)(")/gi, (whole, pre: string, src: string, post: string) => {
    const local = mapping.get(src);
    return local ? `${pre}${local}${post}` : whole;
  });
}

export type ImportResult = { ok: boolean; title?: string; error?: string; skipped?: boolean };

/**
 * 把服务器上的一条剪藏导入到「剪藏库」。
 * 已导入过的（按原文链接判重）直接跳过，不会多出一条。
 */
export async function importServerClip(id: string): Promise<ImportResult> {
  const detail = await fetchServerClip(id);
  if (!detail) return { ok: false, error: "读不到这条剪藏（服务没连上？）" };

  const store = useStore.getState();
  const collection = await store.ensureClipCollection();

  // 判重：剪藏库里已经有同一篇（原链相同）就不重复导入
  const linkField = collection.fields.find((f) => f.name === "原文链接");
  if (linkField) {
    const existing = (store.records[collection.id] ?? []).find(
      (record) =>
        clipLinkKey(String(record.values?.[linkField.id] ?? "")) ===
        clipLinkKey(detail.clip.sourceUrl)
    );
    if (existing) {
      return { ok: true, title: detail.clip.title, skipped: true };
    }
  }

  const mapping = await fetchAndStoreImages(detail.assets);

  // 原文快照：改写图片引用后作为附件存起来（这样原文能离线看）
  let snapshotAssetId: string | null = null;
  if (detail.snapshotHtml) {
    try {
      const html = rewriteSnapshotImages(detail.snapshotHtml, mapping);
      const bytes = new TextEncoder().encode(html);
      const row = await repo.putAsset({
        pageId: null,
        kind: "clip-snapshot",
        mime: "text/html",
        data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      });
      snapshotAssetId = row.id;
    } catch {
      snapshotAssetId = null;
    }
  }

  const field = (name: string) => collection.fields.find((f) => f.name === name);
  const optionId = (fieldName: string, optionName: string) =>
    field(fieldName)?.options?.find((o) => o.name === optionName)?.id ?? "";
  const sourceName =
    detail.clip.source === "wechat_mp" ? "公众号" : detail.clip.source === "bilibili" ? "B站" : "其他";

  const values: Record<string, unknown> = {};
  const put = (name: string, value: unknown) => {
    const f = field(name);
    if (f) values[f.id] = value;
  };
  put("标题", detail.clip.title);
  put("来源", optionId("来源", sourceName));
  put("作者", detail.clip.author || detail.clip.account || "");
  put("原文链接", detail.clip.sourceUrl);
  put("收藏时间", Date.parse(detail.clip.savedAt) || Date.now());
  put("状态", optionId("状态", "未读"));

  const blocks = textToBlocks(detail.clip.text ?? "");
  await store.addClipRecord(collection.id, values, blocks, snapshotAssetId);
  return { ok: true, title: detail.clip.title };
}
