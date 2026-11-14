// 「服务器剪藏箱」：微信客服转发进来的剪藏，服务器已经自动收进 R2 了，
// 这里给客户端两个只读接口：看清单、取单条（含图片取件码与原文快照）。
//
// 为什么不在这里直接改数据：剪藏是"证据"，导入到剪藏库是客户端的决定。
import { issueAssetTickets } from "./assetTicket.ts";
import type { ClipIndexEntry } from "../store/r2ClipStore.ts";
import type { Clip } from "../store/types.ts";

export interface ClipStoreLike {
  getClipIndex(): Promise<ClipIndexEntry[] | null>;
  getClip(id: string): Promise<Clip | null>;
  /** 读一个对象的原始字节（快照 HTML 在这里取） */
  readObject?(key: string): Promise<Buffer | null>;
}

const CLIP_ID_RE = /^[a-z]+_[0-9a-f]{8,16}$/;

/** 清单：服务器上已有的剪藏（微信转发自动入库的那些也在里面） */
export async function listServerClips(store: ClipStoreLike) {
  const index = await store.getClipIndex();
  return { ok: true as const, clips: index ?? [] };
}

/**
 * 单条详情：正文 + 图片的临时取件码 + 原文快照（自包含 HTML，图片已内联）。
 * 图片给的是 5 分钟有效的签名 URL——客户端要长期保存得自己存进附件库。
 */
export async function getServerClip(store: ClipStoreLike, id: string) {
  if (!CLIP_ID_RE.test(id)) return { ok: false as const, error: "剪藏 id 不合法" };
  const clip = await store.getClip(id);
  if (!clip) return { ok: false as const, error: "服务器上没有这条剪藏" };

  const assets = clip.assets ?? [];
  const imageKeys = assets
    .filter((a) => a.ext !== "html")
    .map((a) => `assets/${a.assetId}.${a.ext}`);
  let tickets: Array<{ key: string; url: string }> = [];
  try {
    tickets = issueAssetTickets(imageKeys).map((t) => ({ key: t.key, url: t.url }));
  } catch {
    // 取件码签不出来不影响正文：正文照样给，图片先空着
  }

  // 原文快照（自包含 HTML）
  let snapshotHtml: string | null = null;
  const htmlAsset = assets.find((a) => a.ext === "html");
  if (htmlAsset && store.readObject) {
    try {
      const buf = await store.readObject(`assets/${htmlAsset.assetId}.html`);
      if (buf) snapshotHtml = buf.toString("utf8");
    } catch {
      snapshotHtml = null;
    }
  }

  return {
    ok: true as const,
    clip: {
      id: clip.id,
      title: clip.title,
      source: clip.source,
      sourceUrl: clip.sourceUrl,
      author: clip.author,
      account: clip.account,
      publishedAt: clip.publishedAt,
      savedAt: clip.savedAt,
      text: clip.text,
      status: clip.status,
      note: clip.note ?? "",
    },
    assets: tickets,
    snapshotHtml,
  };
}
