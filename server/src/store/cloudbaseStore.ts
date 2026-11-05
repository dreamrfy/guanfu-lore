// CloudBase 文档数据库存储（阶段一接云）
// 接口与 localStore 一致（G4：实现可替换）；saveClip 语义 = doc(id).set（幂等覆盖：不存在则创建）。
// 与 @cloudbase/node-sdk 的耦合收敛到 createClipDbAdapter()——本仓库不把 SDK 装进依赖，
// 云函数打包时再安装；测试注入假适配器，不联网。

import type { AssetRef, Clip } from "./types.ts";

/** 数据库薄适配：只暴露本存储用到的四个操作（便于测试注入与部署时替换实现） */
export interface ClipDbAdapter {
  /** 幂等覆盖写：文档不存在则创建（CloudBase doc(id).set 语义） */
  docSet(collection: string, id: string, data: Record<string, unknown>): Promise<void>;
  /** 按 _id 的存在性检查 */
  existsById(collection: string, id: string): Promise<boolean>;
  /** 全量清单（阶段一数据量小；上限 1000 条，超出属阶段二分页） */
  listAll(collection: string): Promise<Array<Record<string, unknown>>>;
  /** 单条读取，不存在返回 null */
  docGet(collection: string, id: string): Promise<Record<string, unknown> | null>;
}

/** 存储用的集合名（阶段一只有一张“表”） */
export const CLIPS_COLLECTION = "clips";

/** Clip → 文档：id 映射为 _id；assets 直接存对象数组（文档库不需要 JSON 字符串；G1 仍只存编号） */
export function clipToDoc(clip: Clip): Record<string, unknown> {
  return {
    _id: clip.id,
    source: clip.source,
    sourceUrl: clip.sourceUrl,
    canonicalUrl: clip.canonicalUrl ?? null,
    title: clip.title,
    author: clip.author,
    account: clip.account,
    publishedAt: clip.publishedAt,
    savedAt: clip.savedAt,
    text: clip.text,
    status: clip.status,
    failReason: clip.failReason,
    note: clip.note ?? null,
    assets: clip.assets,
  };
}

/** 文档 → Clip：clipToDoc 的逆（缺字段按 Clip 类型补默认，字段不信任云端漂移） */
export function docToClip(doc: Record<string, unknown>): Clip {
  return {
    id: String(doc._id ?? ""),
    source: (doc.source as Clip["source"]) ?? "unknown",
    sourceUrl: String(doc.sourceUrl ?? ""),
    canonicalUrl: (doc.canonicalUrl as string | null) ?? null,
    title: String(doc.title ?? ""),
    author: String(doc.author ?? ""),
    account: String(doc.account ?? ""),
    publishedAt: (doc.publishedAt as string | null) ?? null,
    savedAt: String(doc.savedAt ?? ""),
    text: String(doc.text ?? ""),
    assets: Array.isArray(doc.assets)
      ? (doc.assets as AssetRef[]).map((a) => ({
          assetId: String(a.assetId ?? ""),
          provider: (a.provider as AssetRef["provider"]) ?? "r2",
          ext: String(a.ext ?? ""),
        }))
      : [],
    status: (doc.status as Clip["status"]) ?? "failed",
    failReason: (doc.failReason as Clip["failReason"]) ?? null,
    note: (doc.note as string) ?? undefined,
  };
}

/** CloudBase 存储实现：持有适配器，四个操作与 localStore 对齐 */
export class CloudbaseStore {
  private readonly adapter: ClipDbAdapter;
  private readonly collection: string;
  constructor(adapter: ClipDbAdapter, collection: string = CLIPS_COLLECTION) {
    this.adapter = adapter;
    this.collection = collection;
  }

  async saveClip(clip: Clip): Promise<void> {
    await this.adapter.docSet(this.collection, clip.id, clipToDoc(clip));
  }

  async existsClip(id: string): Promise<boolean> {
    return this.adapter.existsById(this.collection, id);
  }

  async getClip(id: string): Promise<Clip | null> {
    const doc = await this.adapter.docGet(this.collection, id);
    return doc ? docToClip(doc) : null;
  }

  async listClips(): Promise<Clip[]> {
    const docs = await this.adapter.listAll(this.collection);
    return docs.map(docToClip);
  }
}

/** 与 @cloudbase/node-sdk 的唯一耦合点。SDK 在云函数打包时安装；本机自测不调用本函数。 */
export async function createClipDbAdapter(): Promise<ClipDbAdapter> {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  // 静态字面量加载（扫描器要求：模块名不得用变量）。SDK 不进本机依赖；
  // 云函数打包时由打包脚本安装进函数包，本机运行到此处会报「找不到模块」属预期。
  const tcb = require("@cloudbase/node-sdk") as {
    init(opts: { env: string | symbol }): TcbApp;
    SYMBOL_DEFAULT_ENV: symbol;
  };
  const app = tcb.init({ env: process.env.TCB_ENV || tcb.SYMBOL_DEFAULT_ENV });
  const db = app.database();
  return {
    async docSet(collection, id, data) {
      await db.collection(collection).doc(id).set(data);
    },
    async existsById(collection, id) {
      const r = await db.collection(collection).where({ _id: id }).count();
      return r.total > 0;
    },
    async listAll(collection) {
      const r = (await db.collection(collection).limit(1000).get()) as { data?: unknown };
      return (Array.isArray(r.data) ? r.data : []) as Array<Record<string, unknown>>;
    },
    async docGet(collection, id) {
      const r = await db.collection(collection).doc(id).get();
      const data = (r as { data?: unknown }).data;
      if (Array.isArray(data)) return (data[0] as Record<string, unknown>) ?? null;
      return (data as Record<string, unknown>) ?? null;
    },
  };
}

/** 云函数侧的最小 SDK 形状（仅本存储用到的部分） */
interface TcbApp {
  database(): {
    collection(name: string): {
      doc(id: string): { set(data: Record<string, unknown>): Promise<unknown>; get(): Promise<unknown> };
      where(cond: Record<string, unknown>): { count(): Promise<{ total: number }>; get(): Promise<unknown> };
      limit(n: number): { get(): Promise<unknown> };
    };
  };
}
