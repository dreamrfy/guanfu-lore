/**
 * 本地数据库（Dexie / IndexedDB）
 *
 * 为什么换掉 localStorage：
 *  - localStorage 没有索引、没有事务、没有版本迁移，几 MB 就满，查一条要全量 parse。
 *  - Dexie 给出：索引查询、事务、**版本化迁移**（将来加字段不用怕老数据）——这是"保命线"的地基。
 *
 * 为什么是 IndexedDB 而不是 SQLite：
 *  - 路线甲是"一套代码出网页 + 桌面"。IndexedDB 在浏览器和桌面 WebView 里都能用，
 *    一个存储层就够了；SQLite 文件在网页端写不了。
 *  - 存储层已隔离在 db.ts 里：将来若要"桌面端落成真正的 .sqlite 文件"（便于拷走/备份），
 *    只需在这里加一个 SQLite 适配器，业务代码不动。
 *
 * 数据表（v1）：
 *  - pages：页面元信息（含软删字段，直接支撑"回收站"）
 *  - docs ：每篇页面的正文（BlockNote 块数组），与元信息分开存——列表查询不必拖着正文
 *  - meta ：设置类键值（备份时一并带走）
 */
import Dexie, { type EntityTable } from "dexie";

export type PageRow = {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  /** 封面图对应的附件 id（附件在 assets 表里） */
  coverAssetId?: string | null;
  createdAt: number;
  updatedAt: number;
  /** 软删时间戳；非 null = 在回收站里 */
  deletedAt: number | null;
  /** 预留：同级排序 */
  sortKey: number;
  /** 页面标签（M02）。可选字段：老数据没有它，读侧一律 ?? [] */
  tags?: string[];
};

/**
 * 附件（图片、文件…）
 * 存 ArrayBuffer 而不是 Blob：结构克隆更稳（测试环境用的是 fake-indexeddb，Blob 支持不一致）。
 * mime 单独存，读出时再拼回 Blob。
 */
export type AssetRow = {
  id: string;
  /** 归属页面（可为空：将来剪藏附件可能先入库再挂页面） */
  pageId: string | null;
  /** 用途：cover / image / file / clip …（便于将来分类清理） */
  kind: string;
  mime: string;
  size: number;
  data: ArrayBuffer;
  createdAt: number;
};

export type DocRow = {
  pageId: string;
  blocks: unknown[];
  updatedAt: number;
};

export type MetaRow = {
  key: string;
  value: unknown;
};

/* ---------------- 多维表格 ---------------- */

/** W61：在 9 种基础上补 人员/文件媒体/创建时间/创建人；公式/关联/汇总留 W62 */
export type FieldType =
  | "text"
  | "number"
  | "select"
  | "multiSelect"
  | "date"
  | "checkbox"
  | "url"
  | "email"
  | "phone"
  | "person"
  | "files"
  | "createdTime"
  | "createdBy"
  | "relation"
  | "rollup"
  | "formula";

export type SelectOption = {
  id: string;
  name: string;
  /** 胶囊底色，取值见 OPTION_COLORS */
  color: string;
};

export type FieldDef = {
  id: string;
  name: string;
  type: FieldType;
  /** 单选/多选的选项 */
  options?: SelectOption[];
  /** 列宽（像素）；缺省用默认值 */
  width?: number;
  /** 日期显示格式（W61）：仅日期 / 日期+时间 */
  dateFormat?: "date" | "datetime";
  /** W62 关联字段：指向哪张表 */
  relationCollectionId?: string;
  /** W62 汇总：来源关联字段 id + 被汇总字段 id + 运算 */
  rollupSourceFieldId?: string;
  rollupTargetFieldId?: string;
  rollupOp?: "count" | "sum";
  /** W62 公式：形如 {单价} * {数量} */
  formula?: string;
  /** W66 列头菜单「隐藏」：隐藏后网格不渲染该列，但数据保留 */
  hidden?: boolean;
};

export type SortDef = {
  fieldId: string;
  direction: "asc" | "desc";
};

/** 筛选条件；operator 与字段类型有关（例如数字可以用 gt/lt） */
export type FilterCondition = {
  id: string;
  fieldId: string;
  operator: "contains" | "is" | "isNot" | "isEmpty" | "isNotEmpty" | "gt" | "lt" | "gte" | "lte" | "before" | "after";
  value?: unknown;
};

/** 一张表的"看法"：同一份数据可以存多套筛选/排序 */
export type ViewDef = {
  id: string;
  name: string;
  /** W71：视图类型（W71 实现看板；画廊/目录/时间轴/日历见 W72~W75） */
  type: "table" | "kanban" | "gallery" | "catalog" | "timeline" | "calendar";
  filterOp: "and" | "or";
  filters: FilterCondition[];
  sorts: SortDef[];
  /** 分组字段（V01）。缺省/undefined = 不分组；老数据没有这个字段 */
  groupById?: string | null;
  /** W66 列头菜单「冻结列」：冻结的列（含首列）横向滚动时固定 */
  frozenFieldIds?: string[];
  /** W69 视图设置：自适应行高 / 显示序号 / 每页大小 / 显示页面图标 */
  autoRowHeight?: boolean;
  showIndex?: boolean;
  pageSize?: number;
  showPageIcon?: boolean;
};

export type CollectionRow = {
  id: string;
  name: string;
  icon: string | null;
  /** 字段顺序 = 列顺序 */
  fields: FieldDef[];
  views: ViewDef[];
  createdAt: number;
  updatedAt: number;
};

export type RecordRow = {
  id: string;
  collectionId: string;
  /** fieldId → 值 */
  values: Record<string, unknown>;
  /** 记录正文（BlockNote 块数组）。记录详情页的笔记体，与单元格值分开存 */
  doc?: unknown[];
  /** 想法区（R01，剪藏记录专用）：用户自己的批注，与原文 doc 分开存——原文只读，想法随便写 */
  thoughts?: unknown[];
  /** 剪藏记录的「原文离线快照」附件 id（自包含 HTML，图片已内联） */
  snapshotAssetId?: string | null;
  createdAt: number;
  updatedAt: number;
};

/** 同步层：一条待推送的本地改动 */
export type OutboxRow = {
  id?: number;
  /** page / collection / record */
  entity: string;
  entityId: string;
  op: "upsert" | "delete";
  /** 改动后的内容（delete 时为 null） */
  payload: unknown;
  /** 改这个时客户端看到的服务器版本号（乐观锁） */
  baseSeq: number;
  actor: string;
  createdAt: number;
};

/** 同步层：本地保存的冲突副本 */
export type SyncConflictRow = {
  id?: number;
  entity: string;
  entityId: string;
  /** 我这边的版本 */
  payload: unknown;
  /** 服务器当时的版本号 */
  serverSeq: number;
  createdAt: number;
};

/** 问知识库：一个段落的向量 */
export type RagVectorRow = {
  chunkId: string;
  entity: string;
  entityId: string;
  blockId: string;
  /** 文本指纹：变了就要重新向量化 */
  hash: string;
  dim: number;
  /** Float32Array 的底层字节 */
  vec: ArrayBuffer;
  updatedAt: number;
};

/** 选项胶囊配色（需求 M2-07：单选/多选按选项色名显示） */
export const OPTION_COLORS: Record<string, { bg: string; fg: string }> = {
  grey: { bg: "#ECEDED", fg: "#474D58" },
  green: { bg: "#D2ECD5", fg: "#3B5B46" },
  pink: { bg: "#F8DAE6", fg: "#8B2B69" },
  orange: { bg: "#F8DEC5", fg: "#683D26" },
  blue: { bg: "#DCEEFF", fg: "#1F4E79" },
  purple: { bg: "#E5DAFF", fg: "#4B2E83" },
  yellow: { bg: "#FFFCBF", fg: "#5C5410" },
  red: { bg: "#FFD3D3", fg: "#7A2B2B" },
};

export const DEFAULT_OPTION_COLORS = Object.keys(OPTION_COLORS);

class KnowledgeDB extends Dexie {
  pages!: EntityTable<PageRow, "id">;
  docs!: EntityTable<DocRow, "pageId">;
  meta!: EntityTable<MetaRow, "key">;
  assets!: EntityTable<AssetRow, "id">;
  collections!: EntityTable<CollectionRow, "id">;
  records!: EntityTable<RecordRow, "id">;
  /** 同步层（决策 D4）：本地改动待推送队列 */
  outbox!: EntityTable<OutboxRow, "id">;
  /** 同步层：本地保存的冲突副本（服务器版本 vs 我的版本） */
  syncConflicts!: EntityTable<SyncConflictRow, "id">;
  /** 问知识库：段落向量（按 chunkId 存，变了就重算） */
  ragVectors!: EntityTable<RagVectorRow, "chunkId">;

  constructor() {
    super("bijiapp.v3.store");
    // 版本 1 —— 将来的字段/表变更一律新开 version(n).stores({...})，不要改这一条
    this.version(1).stores({
      pages: "id, parentId, updatedAt, deletedAt",
      docs: "pageId, updatedAt",
      meta: "key",
    });

    // 版本 2 —— 补上 sortKey 索引。
    // 起因：listPages 用了 orderBy("sortKey")，但 v1 没有给它建索引，
    // Dexie 会直接抛 SchemaError —— 表现就是"卡在正在打开知识库…"。
    // 教训：orderBy 的字段必须有索引；且启动流程必须有失败路径（见 store.hydrate 的 catch）。
    this.version(2).stores({
      pages: "id, parentId, updatedAt, deletedAt, sortKey",
      docs: "pageId, updatedAt",
      meta: "key",
    });

    // 版本 3 —— 附件表（封面、正文图片、将来的剪藏图片备份都放这里）
    this.version(3).stores({
      pages: "id, parentId, updatedAt, deletedAt, sortKey",
      docs: "pageId, updatedAt",
      meta: "key",
      assets: "id, pageId, kind, createdAt",
    });

    // 版本 4 —— 多维表格：表（collections）与记录（records）
    this.version(4).stores({
      pages: "id, parentId, updatedAt, deletedAt, sortKey",
      docs: "pageId, updatedAt",
      meta: "key",
      assets: "id, pageId, kind, createdAt",
      collections: "id, updatedAt",
      records: "id, collectionId, updatedAt",
    });

    // 版本 5 —— 同步层：待推送队列 + 本地冲突副本
    // 为什么要"队列"而不是直接推：断网时改动不能丢，得先落本地、联网后再补推。
    this.version(5).stores({
      pages: "id, parentId, updatedAt, deletedAt, sortKey",
      docs: "pageId, updatedAt",
      meta: "key",
      assets: "id, pageId, kind, createdAt",
      collections: "id, updatedAt",
      records: "id, collectionId, updatedAt",
      outbox: "++id, entity, entityId, createdAt",
      syncConflicts: "++id, entity, entityId, createdAt",
    });

    // 版本 6 —— 问知识库：段落向量表（chunkId 为主键，文本变了就重算）
    this.version(6).stores({
      pages: "id, parentId, updatedAt, deletedAt, sortKey",
      docs: "pageId, updatedAt",
      meta: "key",
      assets: "id, pageId, kind, createdAt",
      collections: "id, updatedAt",
      records: "id, collectionId, updatedAt",
      outbox: "++id, entity, entityId, createdAt",
      syncConflicts: "++id, entity, entityId, createdAt",
      ragVectors: "chunkId, entity, entityId",
    });
  }
}

export const db = new KnowledgeDB();

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** 新建一条页面记录（不写库，调用方负责 put） */
export function makePageRow(parentId: string | null = null, title = ""): PageRow {
  const now = Date.now();
  return {
    id: newId(),
    parentId,
    title,
    icon: null,
    coverAssetId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    sortKey: now,
  };
}

/* ---------------- 一次性迁移：把旧版 localStorage 的数据搬进数据库 ---------------- */

const LEGACY_STORAGE_KEY = "bijiapp.v3.store";

/**
 * 上一版把文档存在 localStorage 里。换库不能把用户已有内容丢掉，
 * 所以这里做一次性搬运：读旧数据 → 写进 IndexedDB → 删旧键。
 * 搬完再删键，保证"搬一半失败"时不至于两边都没有。
 */
export async function migrateLegacyLocalStorage(): Promise<number> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;

  try {
    const old = JSON.parse(raw) as {
      pages?: Array<{
        id: string;
        title?: string;
        icon?: string | null;
        parentId?: string | null;
        blocks?: unknown[];
        createdAt?: number;
        updatedAt?: number;
      }>;
    };
    if (!Array.isArray(old.pages) || old.pages.length === 0) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return 0;
    }

    const pages: PageRow[] = old.pages.map((p) => ({
      id: p.id,
      parentId: p.parentId ?? null,
      title: p.title ?? "",
      icon: p.icon ?? null,
      createdAt: p.createdAt ?? Date.now(),
      updatedAt: p.updatedAt ?? Date.now(),
      deletedAt: null,
      sortKey: p.createdAt ?? Date.now(),
    }));
    const docs: DocRow[] = old.pages.map((p) => ({
      pageId: p.id,
      blocks: Array.isArray(p.blocks) ? p.blocks : [],
      updatedAt: p.updatedAt ?? Date.now(),
    }));

    await db.transaction("rw", db.pages, db.docs, async () => {
      await db.pages.bulkPut(pages);
      await db.docs.bulkPut(docs);
    });
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    console.info(`[db] 已把旧版 ${pages.length} 篇页面迁入数据库`);
    return pages.length;
  } catch (e) {
    console.warn("[db] 旧数据迁移失败，保留原键不动", e);
    return 0;
  }
}

/* ---------------- 仓储层：业务代码只碰这里 ---------------- */

export const repo = {
  /** 列出页面（默认不含回收站） */
  async listPages(includeDeleted = false): Promise<PageRow[]> {
    const all = await db.pages.orderBy("sortKey").toArray();
    return includeDeleted ? all : all.filter((p) => p.deletedAt === null);
  },

  async getDoc(pageId: string): Promise<unknown[] | null> {
    const row = await db.docs.get(pageId);
    return row ? row.blocks : null;
  },

  async putPages(rows: PageRow[]): Promise<void> {
    await db.pages.bulkPut(rows);
  },

  async putPage(row: PageRow): Promise<void> {
    await db.pages.put(row);
  },

  async putDoc(pageId: string, blocks: unknown[]): Promise<void> {
    await db.docs.put({ pageId, blocks, updatedAt: Date.now() });
  },

  /** 彻底删除（同时清掉正文） */
  async purgePage(pageId: string): Promise<void> {
    await db.transaction("rw", db.pages, db.docs, async () => {
      await db.pages.delete(pageId);
      await db.docs.delete(pageId);
    });
  },

  /** 软删（进回收站）——可恢复 */
  async softDeletePage(pageId: string): Promise<void> {
    await db.pages.update(pageId, { deletedAt: Date.now(), updatedAt: Date.now() });
  },

  async restorePage(pageId: string): Promise<void> {
    await db.pages.update(pageId, { deletedAt: null, updatedAt: Date.now() });
  },

  async getMeta<T = unknown>(key: string): Promise<T | null> {
    const row = await db.meta.get(key);
    return row ? (row.value as T) : null;
  },

  async setMeta(key: string, value: unknown): Promise<void> {
    await db.meta.put({ key, value });
  },

  /* ---- 附件（图片/文件）---- */

  async putAsset(input: {
    pageId: string | null;
    kind: string;
    mime: string;
    data: ArrayBuffer;
  }): Promise<AssetRow> {
    const row: AssetRow = {
      id: newId(),
      pageId: input.pageId,
      kind: input.kind,
      mime: input.mime,
      size: input.data.byteLength,
      data: input.data,
      createdAt: Date.now(),
    };
    await db.assets.put(row);
    return row;
  },

  async getAsset(id: string): Promise<AssetRow | null> {
    return (await db.assets.get(id)) ?? null;
  },

  async deleteAsset(id: string): Promise<void> {
    await db.assets.delete(id);
  },

  async listAssetsByPage(pageId: string): Promise<AssetRow[]> {
    return db.assets.where("pageId").equals(pageId).toArray();
  },

  /* ---- 多维表格 ---- */

  async listCollections(): Promise<CollectionRow[]> {
    const all = await db.collections.toArray();
    return all.sort((a, b) => a.createdAt - b.createdAt);
  },

  async getCollection(id: string): Promise<CollectionRow | null> {
    return (await db.collections.get(id)) ?? null;
  },

  async putCollection(row: CollectionRow): Promise<void> {
    await db.collections.put(row);
  },

  /** 删表：连同它的记录一起删（一个事务里做，避免删一半留孤儿记录） */
  async deleteCollection(id: string): Promise<void> {
    await db.transaction("rw", db.collections, db.records, async () => {
      await db.collections.delete(id);
      await db.records.where("collectionId").equals(id).delete();
    });
  },

  async listRecords(collectionId: string): Promise<RecordRow[]> {
    const rows = await db.records.where("collectionId").equals(collectionId).toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  },

  async putRecord(row: RecordRow): Promise<void> {
    await db.records.put(row);
  },

  async deleteRecord(id: string): Promise<void> {
    await db.records.delete(id);
  },

  /* ---------------- 同步层（决策 D4） ---------------- */

  async listOutbox(): Promise<OutboxRow[]> {
    const rows = await db.outbox.orderBy("createdAt").toArray();
    return rows;
  },

  async putOutbox(row: OutboxRow): Promise<number> {
    return Number(await db.outbox.add(row));
  },

  async deleteOutbox(id: number): Promise<void> {
    await db.outbox.delete(id);
  },

  async clearOutbox(): Promise<void> {
    await db.outbox.clear();
  },

  async listSyncConflicts(): Promise<SyncConflictRow[]> {
    return db.syncConflicts.orderBy("createdAt").toArray();
  },

  async putSyncConflict(row: SyncConflictRow): Promise<number> {
    return Number(await db.syncConflicts.add(row));
  },

  async deleteSyncConflict(id: number): Promise<void> {
    await db.syncConflicts.delete(id);
  },

  /* ---------------- 问知识库：向量 ---------------- */

  async listRagVectors(): Promise<RagVectorRow[]> {
    return db.ragVectors.toArray();
  },

  async putRagVector(row: RagVectorRow): Promise<void> {
    await db.ragVectors.put(row);
  },

  async deleteRagVector(chunkId: string): Promise<void> {
    await db.ragVectors.delete(chunkId);
  },

  /** 整库导出（备份用） */
  async exportAll() {
    const [pages, docs, meta, assets, collections, records] = await Promise.all([
      db.pages.toArray(),
      db.docs.toArray(),
      db.meta.toArray(),
      db.assets.toArray(),
      db.collections.toArray(),
      db.records.toArray(),
    ]);
    return { schema: 1, exportedAt: Date.now(), pages, docs, meta, assets, collections, records };
  },

  /** 整库导入（恢复用）：先清空再写入，全程一个事务 */
  async importAll(payload: {
    pages: PageRow[];
    docs: DocRow[];
    meta: MetaRow[];
    assets?: AssetRow[];
    collections?: CollectionRow[];
    records?: RecordRow[];
  }): Promise<void> {
    // 表多的时候用数组形式传，Dexie 的逐个参数版本只到 5 张表
    await db.transaction("rw", [db.pages, db.docs, db.meta, db.assets, db.collections, db.records], async () => {
      await Promise.all([
        db.pages.clear(),
        db.docs.clear(),
        db.assets.clear(),
        db.collections.clear(),
        db.records.clear(),
      ]);
      await db.pages.bulkPut(payload.pages ?? []);
      await db.docs.bulkPut(payload.docs ?? []);
      await db.meta.bulkPut(payload.meta ?? []);
      await db.assets.bulkPut(payload.assets ?? []);
      await db.collections.bulkPut(payload.collections ?? []);
      await db.records.bulkPut(payload.records ?? []);
    });
  },
};
