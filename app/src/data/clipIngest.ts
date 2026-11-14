/**
 * 把剪藏服务返回的结果落成「剪藏库」里的一条记录。
 *
 * 分工：
 *  - 服务端负责抓取、清洗、下载图片、生成自包含快照；
 *  - 这里负责把图片搬进本地附件库、把正文转成 BlockNote 块、写记录。
 *
 * 关键约定：正文里的图片在库里只存 `asset://附件id`，内存里换成 blob 地址显示
 * （和页面正文完全一致，见 assets.ts）。
 */
import { BlockNoteEditor } from "@blocknote/core";
import type { PartialBlock } from "@blocknote/core";
import { repo, type CollectionRow, type RecordRow } from "./db";
import type { ClipPayload, ClipResult } from "./clipApi";
import { schema } from "../editor/schema";
import { CLIP_COLLECTION_NAME, useStore } from "./store";

type OkClip = Extract<ClipResult, { ok: true }>;

/* ---------------- 纯函数（可单测） ---------------- */

/** 快照里的相对图片名 → 本地 asset://；没映射到的保持原样 */
export function rewriteClipImages(html: string, mapping: ReadonlyMap<string, string>): string {
  return html.replace(/(\bsrc\s*=\s*")([^"]+)(")/gi, (whole, pre: string, src: string, post: string) => {
    const asset = mapping.get(src);
    return asset ? `${pre}${asset}${post}` : whole;
  });
}

/**
 * 从自包含快照里取正文。
 * 去掉快照自带的标题和来源行（标题已经在记录属性里），只留文章主体。
 */
export function extractSnapshotContent(snapshotHtml: string): string {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(snapshotHtml, "text/html");
  doc.querySelectorAll("script, style, noscript").forEach((node) => node.remove());
  doc.querySelector("h1")?.remove();
  doc.querySelector(".meta")?.remove();
  return doc.body?.innerHTML ?? "";
}

/** 元数据型剪藏（B站等）没有 HTML，用纯文本兜底 */
export function textToBlocks(text: string): PartialBlock[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line, styles: {} }],
    })) as PartialBlock[];
}

export function sourceLabel(source: string): "公众号" | "B站" | "其他" {
  if (source === "wechat_mp") return "公众号";
  if (source === "bilibili") return "B站";
  return "其他";
}

/**
 * 判断"是不是同一篇"用的链接指纹。
 *
 * 同一个公众号文章在转发时带一堆分享参数（mpshare / scene / srcid / sharer_shareinfo…），
 * 直接比字符串会把同一篇当成两篇。公众号只认 __biz/mid/idx/sn 四个参数；
 * 其他平台退化成"去掉 # 的完整地址"。
 */
export function clipLinkKey(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "mp.weixin.qq.com") {
      const biz = u.searchParams.get("__biz");
      const mid = u.searchParams.get("mid");
      const idx = u.searchParams.get("idx");
      const sn = u.searchParams.get("sn");
      if (biz && mid && idx && sn) return `wx:${biz}:${mid}:${idx}:${sn}`;
    }
    u.hash = "";
    return u.toString();
  } catch {
    return url.trim();
  }
}

function optionId(collection: CollectionRow, fieldName: string, optionName: string): string {
  const field = collection.fields.find((f) => f.name === fieldName);
  return field?.options?.find((o) => o.name === optionName)?.id ?? "";
}

/** 记录属性：字段按名字找，避免依赖字段顺序 */
export function buildClipValues(collection: CollectionRow, clip: ClipPayload): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const put = (name: string, value: unknown) => {
    const field = collection.fields.find((f) => f.name === name);
    if (field) values[field.id] = value;
  };

  put("标题", clip.title);
  put("来源", optionId(collection, "来源", sourceLabel(clip.source)));
  put("作者", clip.author || clip.account || "");
  put("原文链接", clip.sourceUrl);
  put("收藏时间", Date.parse(clip.savedAt) || Date.now());
  put("状态", optionId(collection, "状态", "未读"));
  return values;
}

/** HTML → BlockNote 块；解析失败返回空数组，由调用方降级 */
export function htmlToBlocks(html: string): PartialBlock[] {
  if (!html.trim()) return [];
  try {
    // 无头编辑器只用来解析，不挂到界面上
    const editor = BlockNoteEditor.create({ schema });
    return editor.tryParseHTMLToBlocks(html) as unknown as PartialBlock[];
  } catch {
    return [];
  }
}

/* ---------------- 落库 ---------------- */

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** 保存服务端下发的图片，返回「快照里的文件名 → asset://新附件id」 */
async function saveClipImages(assets: OkClip["assets"]): Promise<Map<string, string>> {
  const mapping = new Map<string, string>();
  for (const asset of assets) {
    if (!asset.mime.startsWith("image/")) continue;
    try {
      const row = await repo.putAsset({
        pageId: null,
        kind: "clip",
        mime: asset.mime,
        data: base64ToArrayBuffer(asset.base64),
      });
      mapping.set(`${asset.assetId}.${asset.ext}`, `asset://${row.id}`);
    } catch {
      // 单张图存失败不影响整条剪藏：正文里会保留原文件名，至少能看出这里缺图
    }
  }
  return mapping;
}

/** 存原文快照（自包含 HTML）。失败只丢备份，不影响正文。 */
async function saveSnapshot(html: string | null): Promise<string | null> {
  if (!html) return null;
  try {
    const bytes = new TextEncoder().encode(html);
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const row = await repo.putAsset({ pageId: null, kind: "clip-snapshot", mime: "text/html", data });
    return row.id;
  } catch {
    return null;
  }
}

/**
 * 剪藏结果 → 剪藏库记录。
 * 返回 collectionId / recordId，并顺手打开记录详情。
 */
export async function ingestClip(result: OkClip): Promise<{ collectionId: string; recordId: string }> {
  const store = useStore.getState();

  const imageMap = await saveClipImages(result.assets);
  const snapshotAssetId = await saveSnapshot(result.snapshotHtml);

  // 新剪藏优先用服务端给的正文；老记录（重复剪藏）只有快照，就从快照里取
  const rawHtml = result.contentHtml || (result.snapshotHtml ? extractSnapshotContent(result.snapshotHtml) : "");
  let blocks = htmlToBlocks(rewriteClipImages(rawHtml, imageMap));
  if (blocks.length === 0 && result.clip.text) {
    blocks = textToBlocks(result.clip.text);
  }

  const collection = await store.ensureClipCollection();
  const values = buildClipValues(collection, result.clip);
  const recordId = await store.addClipRecord(collection.id, values, blocks, snapshotAssetId);

  await store.openCollection(collection.id);
  store.openRecord(collection.id, recordId);
  return { collectionId: collection.id, recordId };
}

/** 给界面用：已存在同链接的记录时直接打开，避免建重复行 */
export function findExistingClipRecord(url: string, collection: CollectionRow | undefined): RecordRow | null {
  if (!collection) return null;
  const records = useStore.getState().records[collection.id] ?? [];
  const linkField = collection.fields.find((f) => f.name === "原文链接");
  if (!linkField) return null;
  const key = clipLinkKey(url);
  return records.find((r) => clipLinkKey(String(r.values[linkField.id] ?? "")) === key) ?? null;
}

export { CLIP_COLLECTION_NAME };
