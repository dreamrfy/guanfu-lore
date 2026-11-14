/**
 * 应用状态
 *
 * 分工：
 *  - 文档数据（页面、正文）→ 存在本地数据库（见 db.ts），本 store 只是内存镜像
 *  - 界面偏好（主题、字体、图标风格）→ localStorage，启动时要立刻生效，不能等异步读库
 *
 * 两个细节值得记住：
 *  1) 正文按需加载：打开哪篇才读哪篇（docs 缓存），避免启动时把所有正文全读进内存
 *  2) 正文写入做防抖：每次敲键都写库会把磁盘打满，300ms 合并一次
 */
import { create } from "zustand";
import type { PartialBlock } from "@blocknote/core";
import {
  makePageRow,
  migrateLegacyLocalStorage,
  newId,
  repo,
  type CollectionRow,
  type FieldDef,
  type FieldType,
  type PageRow,
  type RecordRow,
  type ViewDef,
} from "./db";
import { makeCollection, makeField, makeRecord } from "./collections";
import { AI_STATUS_FIELD, AI_STATUS_OPTIONS, AI_SUMMARY_FIELD } from "./aiFields";
import type { AiCommand } from "./aiCommands";
import { enqueueChange, conflictList, pendingCount, resolveLocalConflict, runSync, type SyncSummary } from "./sync";
import { AUTO_SYNC_TICK_MS, shouldAutoSync } from "./syncAuto";
import { resolveAssetRefs, unresolveAssetRefs, uploadAsset } from "./assets";
import { DEFAULT_FONT_THEME } from "../design/fonts";
import { DEFAULT_ICON_SET, type IconSetId } from "../design/icons";

export type ThemeMode = "light" | "dark";

const PREFS_KEY = "yzgifyz.h8.prefs";

/** 剪藏落地的固定表名（重复剪藏、设置页、验收都按这个名字找） */
export const CLIP_COLLECTION_NAME = "剪藏库";

type Prefs = {
  theme: ThemeMode;
  iconSet: IconSetId;
  fontTheme: string;
  tabs: string[];
  activeTabId: string | null;
  rightPanelOpen: boolean;
};

function loadPrefs(): Prefs {
  const fallback: Prefs = {
    theme: "light",
    iconSet: DEFAULT_ICON_SET,
    fontTheme: DEFAULT_FONT_THEME,
    tabs: [],
    activeTabId: null,
    rightPanelOpen: true,
  };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<Prefs>) } : fallback;
  } catch {
    return fallback;
  }
}

export function savePrefs(p: Partial<Prefs>): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...p }));
  } catch {
    /* 忽略 */
  }
}

export function readPrefs(): Prefs {
  return loadPrefs();
}

/** 排进同步队列（决策 D4）。失败不影响本地操作——同步不能反过来拖垮编辑。 */
function queue(input: {
  entity: "page" | "collection" | "record";
  entityId: string;
  op: "upsert" | "delete";
  payload: unknown;
}): void {
  void enqueueChange(input).catch(() => {});
}

/** 自动同步的定时器（全局一份） */
let autoTimer: number | null = null;

/** 正文防抖落库 */
const docTimers = new Map<string, number>();

/**
 * 写库前把"可显示地址"换回 `asset://附件id`。
 * 内存里（编辑器正在用的那份）留着真地址，否则图片显示不出来；
 * 但写进库的必须是 asset://，不然下次打开 blob 地址早就失效了。
 */
function writeDoc(pageId: string, blocks: unknown[]): Promise<void> {
  return repo.putDoc(pageId, unresolveAssetRefs(blocks));
}

function scheduleDocSave(pageId: string, blocks: unknown[]): void {
  const prev = docTimers.get(pageId);
  if (prev) clearTimeout(prev);
  docTimers.set(
    pageId,
    window.setTimeout(() => {
      docTimers.delete(pageId);
      void writeDoc(pageId, blocks);
    }, 300)
  );
}

/** 记录正文的防抖落库（键 = collectionId:recordId，同一记录连续输入只写最后一次） */
const recordTimers = new Map<string, number>();

function writeRecord(collectionId: string, recordId: string): Promise<void> {
  const row = (useStore.getState().records[collectionId] ?? []).find((r) => r.id === recordId);
  if (!row) return Promise.resolve();
  return repo.putRecord({ ...row, doc: unresolveAssetRefs(row.doc ?? []) as unknown[] });
}

function scheduleRecordSave(collectionId: string, recordId: string): void {
  const key = `${collectionId}:${recordId}`;
  const prev = recordTimers.get(key);
  if (prev) clearTimeout(prev);
  recordTimers.set(
    key,
    window.setTimeout(() => {
      recordTimers.delete(key);
      void writeRecord(collectionId, recordId);
    }, 300)
  );
}

/** 立刻把还没落盘的正文写掉（关窗/切走前用；调用后仍可继续编辑） */
export async function flushDocs(): Promise<void> {
  const pending = [...docTimers.keys()];
  docTimers.forEach((t) => clearTimeout(t));
  docTimers.clear();
  const pendingRecords = [...recordTimers.keys()];
  recordTimers.forEach((t) => clearTimeout(t));
  recordTimers.clear();
  const docs = useStore.getState().docs;
  await Promise.all([
    ...pending.map((id) => writeDoc(id, docs[id] ?? [])),
    ...pendingRecords.map((key) => {
      const [collectionId, recordId] = key.split(":");
      return writeRecord(collectionId, recordId);
    }),
  ]);
}

type Store = {
  ready: boolean;
  /** 启动失败的原因（非空 = 界面显示错误，而不是永远转圈） */
  bootError: string | null;
  pages: PageRow[];
  trash: PageRow[];
  docs: Record<string, unknown[]>;
  tabs: string[];
  activeTabId: string | null;

  /* ---- 多维表格 ---- */
  collections: CollectionRow[];
  /** collectionId → 记录（按需加载） */
  records: Record<string, RecordRow[]>;
  /** 非空 = 主区正在看某张表（此时不显示页面） */
  activeCollectionId: string | null;

  ensureCollections: () => Promise<void>;
  ensureRecords: (collectionId: string) => Promise<void>;
  createCollection: (name?: string) => Promise<string>;
  openCollection: (id: string) => Promise<void>;
  renameCollection: (id: string, name: string) => void;
  deleteCollection: (id: string) => Promise<void>;
  addField: (collectionId: string, type: FieldType) => Promise<void>;
  updateField: (collectionId: string, fieldId: string, patch: Partial<FieldDef>) => void;
  removeField: (collectionId: string, fieldId: string) => void;
  addRecord: (collectionId: string) => Promise<void>;
  /** 剪藏库：不存在就按固定字段建一张（公众号 / B站 / 其他 + 作者、链接、收藏时间、状态） */
  ensureClipCollection: () => Promise<CollectionRow>;
  /** 给集合补上「AI 摘要 / AI 状态」两列（已有则跳过），返回最新表 */
  ensureAiFields: (collectionId: string) => Promise<CollectionRow | null>;
  /** 新增一条剪藏记录：正文与快照一起入库，内存里保存"可显示"的正文 */
  addClipRecord: (
    collectionId: string,
    values: Record<string, unknown>,
    blocks: unknown[],
    snapshotAssetId?: string | null
  ) => Promise<string>;
  setCell: (collectionId: string, recordId: string, fieldId: string, value: unknown) => void;
  removeRecord: (collectionId: string, recordId: string) => Promise<void>;
  updateView: (collectionId: string, viewId: string, patch: Partial<ViewDef>) => void;
  /** 非空 = 表格里打开了某条记录的详情（右侧面板显示） */
  openRecordRef: { collectionId: string; recordId: string } | null;
  /** 自动同步开关（定时推 + 拉） */
  autoSync: boolean;
  setAutoSync: (on: boolean) => void;
  startAutoSync: () => void;
  stopAutoSync: () => void;
  /** 待处理的 AI 命令（斜杠菜单等入口触发；右侧面板打开后取走） */
  aiCommand: AiCommand | null;
  dispatchAiCommand: (command: AiCommand) => void;
  clearAiCommand: () => void;
  openRecord: (collectionId: string, recordId: string) => void;
  closeRecord: () => void;
  /** 记录正文（BlockNote 块数组），防抖落库 */
  setRecordDoc: (collectionId: string, recordId: string, blocks: unknown[]) => void;

  theme: ThemeMode;
  iconSet: IconSetId;
  fontTheme: string;
  rightPanelOpen: boolean;
  sidebarCollapsed: boolean;

  hydrate: () => Promise<void>;
  ensureDoc: (pageId: string) => Promise<void>;

  /* ---- 同步（决策 D4） ---- */
  syncStatus: { pending: number; conflicts: number; lastSyncAt: number | null; lastErrorAt: number | null; busy: boolean };
  refreshSyncStatus: () => Promise<void>;
  runSyncNow: () => Promise<SyncSummary>;
  /** 把远端变更应用到内存（数据库已由同步引擎写好） */
  applyRemoteChange: (
    entity: string,
    entityId: string,
    op: "upsert" | "delete",
    payload: unknown
  ) => void;
  resolveSyncConflict: (id: number, action: "keep-server" | "use-mine") => Promise<void>;

  /**
   * 新建页面。initialBlocks 用于"从模板新建"：
   * 必须在 openTab 之前把正文放进内存，否则编辑器会先按空文档挂载，
   * 之后再把正文塞进去它也不会重读（PageEditor 只在挂载时取 initialBlocks）。
   */
  createPage: (parentId?: string | null, initialBlocks?: PartialBlock[]) => Promise<string>;
  renamePage: (id: string, title: string) => void;
  setPageIcon: (id: string, icon: string | null) => void;
  /** 设置封面（传 null 表示移除封面） */
  setCover: (pageId: string, coverAssetId: string | null) => void;
  /** 存一个附件并拿到可显示地址（编辑器的图片上传走这里） */
  uploadFile: (file: File, kind: string, pageId: string | null) => Promise<string>;
  /** 换父级（拖拽移动页面用）。返回 false = 被拦下了（会成环） */
  setParent: (id: string, parentId: string | null) => boolean;
  /** 复制一份页面（含正文），返回新页面 id */
  duplicatePage: (id: string) => Promise<string | null>;
  /** 用现成的正文新建页面（导入 Markdown 用） */
  createPageWithBlocks: (title: string, blocks: PartialBlock[], parentId?: string | null) => Promise<string>;
  moveToTrash: (id: string) => Promise<void>;
  restoreFromTrash: (id: string) => Promise<void>;
  purgeFromTrash: (id: string) => Promise<void>;

  setBlocks: (id: string, blocks: PartialBlock[]) => void;

  openTab: (id: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;

  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setIconSet: (set: IconSetId) => void;
  setFontTheme: (font: string) => void;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  /** 直接设定右栏开合；persist=false 用于"窄屏下的临时收起"，不写进偏好 */
  setRightPanelOpen: (open: boolean, persist?: boolean) => void;
};

export const useStore = create<Store>((set, get) => {
  const prefs = loadPrefs();

  /** 页面元信息写库（fire-and-forget，出错只记日志） */
  const persist = (row: PageRow) => {
    void repo.putPage(row).catch((e) => console.error("[db] 页面写库失败", e));
  };

  return {
    ready: false,
    bootError: null,
    pages: [],
    trash: [],
    docs: {},
    tabs: prefs.tabs,
    activeTabId: prefs.activeTabId,
    collections: [],
    records: {},
    activeCollectionId: null,
    openRecordRef: null,
    autoSync: true,
    aiCommand: null,
    syncStatus: { pending: 0, conflicts: 0, lastSyncAt: null, lastErrorAt: null, busy: false },
    theme: prefs.theme,
    iconSet: prefs.iconSet,
    fontTheme: prefs.fontTheme,
    rightPanelOpen: prefs.rightPanelOpen,
    sidebarCollapsed: false,

    hydrate: async () => {
      try {
        await migrateLegacyLocalStorage(); // 先搬旧数据（如果有），再往下读
        let pages = await repo.listPages();
        if (pages.length === 0) {
          // 空库：建一篇空页面（标题留空，占位由 placeholder 负责）
          const first = makePageRow(null, "");
          await repo.putPage(first);
          pages = [first];
        }
        const alive = pages.filter((p) => p.deletedAt === null);
        const trash = pages.filter((p) => p.deletedAt !== null);

        const savedTabs = get().tabs.filter((id) => alive.some((p) => p.id === id));
        const tabs = savedTabs.length ? savedTabs : [alive[0].id];
        const active =
          get().activeTabId && alive.some((p) => p.id === get().activeTabId)
            ? get().activeTabId
            : tabs[tabs.length - 1];

        const collections = await repo.listCollections();
        set({ pages: alive, trash, tabs, activeTabId: active, collections, ready: true, bootError: null });
        savePrefs({ tabs, activeTabId: active });
        if (active) void get().ensureDoc(active);
      } catch (e) {
        // 关键：启动流程必须有失败路径，否则界面会永远停在"正在打开知识库…"，用户无从下手
        console.error("[db] 启动失败", e);
        set({ ready: true, bootError: (e as Error).message || String(e) });
      }
    },

    ensureDoc: async (pageId) => {
      if (get().docs[pageId]) return;
      const raw = (await repo.getDoc(pageId)) ?? [];
      // 读出来要先把 asset:// 换成可显示地址，编辑器才能显示图
      const blocks = await resolveAssetRefs(raw);
      set((s) => ({ docs: { ...s.docs, [pageId]: blocks } }));
    },

    uploadFile: async (file, kind, pageId) => {
      const { url } = await uploadAsset(file, pageId, kind);
      return url;
    },

    setCover: (pageId, coverAssetId) => {
      const row = get().pages.find((p) => p.id === pageId);
      if (!row) return;
      const next = { ...row, coverAssetId, updatedAt: Date.now() };
      set((s) => ({ pages: s.pages.map((p) => (p.id === pageId ? next : p)) }));
      persist(next);
    },

    createPage: async (parentId = null, initialBlocks = []) => {
      const row = makePageRow(parentId, "");
      await repo.putPage(row);
      set((s) => ({ pages: [...s.pages, row], docs: { ...s.docs, [row.id]: initialBlocks } }));
      get().openTab(row.id);
      if (initialBlocks.length > 0) scheduleDocSave(row.id, initialBlocks);
      // 同步层：新建的页面也要排队推上去
      void enqueueChange({
        entity: "page",
        entityId: row.id,
        op: "upsert",
        payload: { page: row, blocks: initialBlocks },
      }).catch(() => {});
      return row.id;
    },

    renamePage: (id, title) => {
      const row = get().pages.find((p) => p.id === id);
      if (!row) return;
      const next = { ...row, title, updatedAt: Date.now() };
      set((s) => ({ pages: s.pages.map((p) => (p.id === id ? next : p)) }));
      persist(next);
      void enqueueChange({
        entity: "page",
        entityId: id,
        op: "upsert",
        payload: { page: next },
      }).catch(() => {});
    },

    setPageIcon: (id, icon) => {
      const row = get().pages.find((p) => p.id === id);
      if (!row) return;
      const next = { ...row, icon, updatedAt: Date.now() };
      set((s) => ({ pages: s.pages.map((p) => (p.id === id ? next : p)) }));
      persist(next);
      void enqueueChange({
        entity: "page",
        entityId: id,
        op: "upsert",
        payload: { page: next },
      }).catch(() => {});
    },

    setParent: (id, parentId) => {
      if (id === parentId) return false;

      // 防环：不能把一篇页面挪到它自己的子孙底下，否则这棵子树会从侧栏消失
      if (parentId) {
        const byId = new Map(get().pages.map((p) => [p.id, p]));
        let cursor: string | null = parentId;
        const seen = new Set<string>();
        while (cursor) {
          if (cursor === id) return false;
          if (seen.has(cursor)) break; // 数据里已经有环了，别死循环
          seen.add(cursor);
          cursor = byId.get(cursor)?.parentId ?? null;
        }
      }

      const row = get().pages.find((p) => p.id === id);
      if (!row || row.parentId === parentId) return true;
      const next = { ...row, parentId, updatedAt: Date.now() };
      set((s) => ({ pages: s.pages.map((p) => (p.id === id ? next : p)) }));
      persist(next);
      return true;
    },

    duplicatePage: async (id) => {
      const row = get().pages.find((p) => p.id === id);
      if (!row) return null;

      const now = Date.now();
      const copy: PageRow = {
        ...row,
        id: newId(),
        title: `${row.title || "无标题"} 副本`,
        createdAt: now,
        updatedAt: now,
        sortKey: now,
        deletedAt: null,
      };
      // 正文从库里读原样（asset:// 引用照抄即可，附件是共享的，不需要复制一份）
      const doc = (await repo.getDoc(id)) ?? [];
      await repo.putPage(copy);
      await repo.putDoc(copy.id, doc);

      const resolved = await resolveAssetRefs(doc);
      set((s) => ({
        pages: [...s.pages, copy],
        docs: { ...s.docs, [copy.id]: resolved },
      }));
      get().openTab(copy.id);
      return copy.id;
    },

    createPageWithBlocks: async (title, blocks, parentId = null) => {
      const row = makePageRow(parentId, title);
      await repo.putPage(row);
      const raw = unresolveAssetRefs(blocks);
      await repo.putDoc(row.id, raw);
      set((s) => ({ pages: [...s.pages, row], docs: { ...s.docs, [row.id]: blocks } }));
      get().openTab(row.id);
      return row.id;
    },

    /* ---------------- 多维表格 ---------------- */

    ensureCollections: async () => {
      const collections = await repo.listCollections();
      set({ collections });
    },

    ensureRecords: async (collectionId) => {
      if (get().records[collectionId]) return;
      const rows = await repo.listRecords(collectionId);
      // 记录正文里的 asset:// 也要换成可显示地址（和页面正文同一套规则）
      const resolved = await Promise.all(
        rows.map(async (row) =>
          row.doc
            ? { ...row, doc: (await resolveAssetRefs(row.doc)) as unknown[] }
            : row
        )
      );
      set((s) => ({ records: { ...s.records, [collectionId]: resolved } }));
    },

    createCollection: async (name = "新建表格") => {
      const row = makeCollection(name);
      await repo.putCollection(row);
      set((s) => ({ collections: [...s.collections, row], records: { ...s.records, [row.id]: [] } }));
      await get().openCollection(row.id);
      return row.id;
    },

    openCollection: async (id) => {
      // 换表时把上一张表打开的记录详情关掉，避免面板里还挂着别的表的数据
      set({
        activeCollectionId: id,
        openRecordRef: get().openRecordRef?.collectionId === id ? get().openRecordRef : null,
      });
      await get().ensureRecords(id);
    },

    renameCollection: (id, name) => {
      const row = get().collections.find((c) => c.id === id);
      if (!row) return;
      const next = { ...row, name, updatedAt: Date.now() };
      set((s) => ({ collections: s.collections.map((c) => (c.id === id ? next : c)) }));
      void repo.putCollection(next);
    },

    deleteCollection: async (id) => {
      await repo.deleteCollection(id);
      set((s) => {
        const records = { ...s.records };
        delete records[id];
        return {
          collections: s.collections.filter((c) => c.id !== id),
          records,
          activeCollectionId: s.activeCollectionId === id ? null : s.activeCollectionId,
          openRecordRef: s.openRecordRef?.collectionId === id ? null : s.openRecordRef,
        };
      });
    },

    addField: async (collectionId, type) => {
      const row = get().collections.find((c) => c.id === collectionId);
      if (!row) return;
      const field = makeField(type);
      const next = { ...row, fields: [...row.fields, field], updatedAt: Date.now() };
      set((s) => ({ collections: s.collections.map((c) => (c.id === collectionId ? next : c)) }));
      await repo.putCollection(next);
      queue({ entity: "collection", entityId: collectionId, op: "upsert", payload: { collection: next } });
    },

    updateField: (collectionId, fieldId, patch) => {
      const row = get().collections.find((c) => c.id === collectionId);
      if (!row) return;
      const prevField = row.fields.find((f) => f.id === fieldId);
      const typeChanged = patch.type !== undefined && prevField !== undefined && patch.type !== prevField.type;
      const next = {
        ...row,
        fields: row.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
        // 类型换了（单选→数字之类），旧条件的运算符/值已无意义，
        // 留着会把整张表筛成空，所以只丢掉这一列的筛选条件，排序不动。
        views: typeChanged
          ? row.views.map((v) => ({ ...v, filters: v.filters.filter((c) => c.fieldId !== fieldId) }))
          : row.views,
        updatedAt: Date.now(),
      };
      set((s) => ({ collections: s.collections.map((c) => (c.id === collectionId ? next : c)) }));
      void repo.putCollection(next);
      queue({ entity: "collection", entityId: collectionId, op: "upsert", payload: { collection: next } });
    },

    removeField: (collectionId, fieldId) => {
      const row = get().collections.find((c) => c.id === collectionId);
      if (!row) return;
      if (row.fields.length <= 1) return; // 至少留一列，否则表就没法看了
      const next = {
        ...row,
        fields: row.fields.filter((f) => f.id !== fieldId),
        views: row.views.map((v) => ({
          ...v,
          filters: v.filters.filter((f) => f.fieldId !== fieldId),
          sorts: v.sorts.filter((s) => s.fieldId !== fieldId),
        })),
        updatedAt: Date.now(),
      };
      set((s) => ({ collections: s.collections.map((c) => (c.id === collectionId ? next : c)) }));
      void repo.putCollection(next);
      queue({ entity: "collection", entityId: collectionId, op: "upsert", payload: { collection: next } });
    },

    addRecord: async (collectionId) => {
      const rec = makeRecord(collectionId);
      await repo.putRecord(rec);
      set((s) => ({
        records: { ...s.records, [collectionId]: [...(s.records[collectionId] ?? []), rec] },
      }));
      queue({ entity: "record", entityId: rec.id, op: "upsert", payload: { record: rec } });
    },

    ensureClipCollection: async () => {
      const existing = get().collections.find((c) => c.name === CLIP_COLLECTION_NAME);
      if (existing) return existing;

      const base = makeCollection(CLIP_COLLECTION_NAME);
      const title = base.fields.find((f) => f.type === "text") ?? makeField("text", "标题");
      const source: FieldDef = {
        ...makeField("select", "来源"),
        options: [
          { id: newId(), name: "公众号", color: "green" },
          { id: newId(), name: "B站", color: "pink" },
          { id: newId(), name: "其他", color: "grey" },
        ],
      };
      const status: FieldDef = {
        ...makeField("select", "状态"),
        options: [
          { id: newId(), name: "未读", color: "blue" },
          { id: newId(), name: "已读", color: "grey" },
        ],
      };
      const row: CollectionRow = {
        ...base,
        icon: "📥",
        fields: [title, source, makeField("text", "作者"), makeField("url", "原文链接"), makeField("date", "收藏时间"), status],
        updatedAt: Date.now(),
      };
      await repo.putCollection(row);
      set((s) => ({
        collections: [...s.collections, row],
        records: { ...s.records, [row.id]: [] },
      }));
      return row;
    },

    ensureAiFields: async (collectionId) => {
      const row = get().collections.find((c) => c.id === collectionId);
      if (!row) return null;
      const hasSummary = row.fields.some((f) => f.name === AI_SUMMARY_FIELD);
      const hasStatus = row.fields.some((f) => f.name === AI_STATUS_FIELD);
      if (hasSummary && hasStatus) return row;

      const fields = [...row.fields];
      if (!hasSummary) fields.push(makeField("text", AI_SUMMARY_FIELD));
      if (!hasStatus) {
        const colors = ["grey", "blue", "green", "red"];
        fields.push({
          ...makeField("select", AI_STATUS_FIELD),
          options: AI_STATUS_OPTIONS.map((name, i) => ({ id: newId(), name, color: colors[i] ?? "grey" })),
        });
      }
      const next: CollectionRow = { ...row, fields, updatedAt: Date.now() };
      await repo.putCollection(next);
      set((s) => ({ collections: s.collections.map((c) => (c.id === collectionId ? next : c)) }));
      return next;
    },

    addClipRecord: async (collectionId, values, blocks, snapshotAssetId) => {
      const rec = makeRecord(collectionId, values);
      const stored: RecordRow = {
        ...rec,
        doc: unresolveAssetRefs(blocks) as unknown[],
        snapshotAssetId: snapshotAssetId ?? null,
      };
      await repo.putRecord(stored);
      // 内存里存"可显示"的那份（图片是 blob 地址），写库前再换回 asset://
      const display: RecordRow = {
        ...stored,
        doc: (await resolveAssetRefs(stored.doc ?? [])) as unknown[],
      };
      set((s) => ({
        records: { ...s.records, [collectionId]: [...(s.records[collectionId] ?? []), display] },
      }));
      // 同步层推的是"库里那份"（图片是 asset:// 引用），不是内存里的 blob 地址
      queue({ entity: "record", entityId: rec.id, op: "upsert", payload: { record: stored } });
      return rec.id;
    },

    setCell: (collectionId, recordId, fieldId, value) => {
      const list = get().records[collectionId] ?? [];
      const row = list.find((r) => r.id === recordId);
      if (!row) return;
      const next = { ...row, values: { ...row.values, [fieldId]: value }, updatedAt: Date.now() };
      set((s) => ({
        records: { ...s.records, [collectionId]: list.map((r) => (r.id === recordId ? next : r)) },
      }));
      void repo.putRecord(next);
      queue({ entity: "record", entityId: recordId, op: "upsert", payload: { record: next } });
    },

    removeRecord: async (collectionId, recordId) => {
      await repo.deleteRecord(recordId);
      set((s) => ({
        records: { ...s.records, [collectionId]: (s.records[collectionId] ?? []).filter((r) => r.id !== recordId) },
        // 删掉的正是面板里打开的那条，就顺手把面板收起来
        openRecordRef:
          s.openRecordRef?.recordId === recordId ? null : s.openRecordRef,
      }));
    },

    updateView: (collectionId, viewId, patch) => {
      const row = get().collections.find((c) => c.id === collectionId);
      if (!row) return;
      const next = {
        ...row,
        views: row.views.map((v) => (v.id === viewId ? { ...v, ...patch } : v)),
        updatedAt: Date.now(),
      };
      set((s) => ({ collections: s.collections.map((c) => (c.id === collectionId ? next : c)) }));
      void repo.putCollection(next);
    },

    refreshSyncStatus: async () => {
      const pending = await pendingCount();
      const conflicts = (await conflictList()).length;
      set((s) => ({ syncStatus: { ...s.syncStatus, pending, conflicts } }));
    },

    runSyncNow: async () => {
      set((s) => ({ syncStatus: { ...s.syncStatus, busy: true } }));
      const result = await runSync();
      for (const change of result.applied) {
        get().applyRemoteChange(change.entity, change.entityId, change.op, change.payload);
      }
      const pending = await pendingCount();
      const conflicts = (await conflictList()).length;
      set((s) => ({
        syncStatus: {
          pending,
          conflicts,
          lastSyncAt: result.ok ? Date.now() : s.syncStatus.lastSyncAt,
          lastErrorAt: result.ok ? null : Date.now(),
          busy: false,
        },
      }));
      return result;
    },

    applyRemoteChange: (entity, entityId, op, payload) => {
      if (entity === "page") {
        const data = payload as { page?: PageRow; blocks?: unknown[] } | null;
        const page = data?.page;
        if (!page) return;
        set((s) => {
          if (op === "delete") {
            const docs = { ...s.docs };
            delete docs[entityId];
            return { pages: s.pages.filter((p) => p.id !== entityId), docs };
          }
          const pages = s.pages.some((p) => p.id === entityId)
            ? s.pages.map((p) => (p.id === entityId ? page : p))
            : [...s.pages, page];
          const docs = data?.blocks ? { ...s.docs, [entityId]: data.blocks } : s.docs;
          return { pages, docs };
        });
        return;
      }
      if (entity === "collection") {
        const data = payload as { collection?: CollectionRow } | null;
        const collection = data?.collection;
        if (!collection) return;
        set((s) => ({
          collections:
            op === "delete"
              ? s.collections.filter((c) => c.id !== entityId)
              : s.collections.some((c) => c.id === entityId)
                ? s.collections.map((c) => (c.id === entityId ? collection : c))
                : [...s.collections, collection],
        }));
        return;
      }
      if (entity === "record") {
        const data = payload as { record?: RecordRow } | null;
        const record = data?.record;
        if (!record) return;
        set((s) => {
          const list = s.records[record.collectionId] ?? [];
          const next =
            op === "delete"
              ? list.filter((r) => r.id !== entityId)
              : list.some((r) => r.id === entityId)
                ? list.map((r) => (r.id === entityId ? record : r))
                : [...list, record];
          return { records: { ...s.records, [record.collectionId]: next } };
        });
      }
    },

    resolveSyncConflict: async (id, action) => {
      await resolveLocalConflict(id, action);
      await get().refreshSyncStatus();
    },

    setAutoSync: (on) => {
      set({ autoSync: on });
      if (on) get().startAutoSync();
      else get().stopAutoSync();
    },

    startAutoSync: () => {
      if (autoTimer !== null) return;
      const tick = () => {
        const s = get();
        if (!s.autoSync) return;
        const due = shouldAutoSync({
          pending: s.syncStatus.pending,
          lastSyncAt: s.syncStatus.lastSyncAt,
          lastErrorAt: s.syncStatus.lastErrorAt,
          now: Date.now(),
        });
        if (!due) return;
        void s.runSyncNow().catch(() => {});
      };
      autoTimer = window.setInterval(tick, AUTO_SYNC_TICK_MS);
      tick(); // 启动时先来一次，把云端内容拉下来
    },

    stopAutoSync: () => {
      if (autoTimer === null) return;
      clearInterval(autoTimer);
      autoTimer = null;
    },

    dispatchAiCommand: (command) => {      // 面板关着也要接得住命令：顺手打开右侧面板，命令不会丢
      set({ aiCommand: command });
      if (!get().rightPanelOpen) {
        set({ rightPanelOpen: true });
        savePrefs({ rightPanelOpen: true });
      }
    },

    clearAiCommand: () => set({ aiCommand: null }),

    openRecord: (collectionId, recordId) => {
      set({ openRecordRef: { collectionId, recordId } });
      // 右侧面板关着的话，用户点了也没地方看，顺手打开
      if (!get().rightPanelOpen) {
        set({ rightPanelOpen: true });
        savePrefs({ rightPanelOpen: true });
      }
    },

    closeRecord: () => set({ openRecordRef: null }),

    setRecordDoc: (collectionId, recordId, blocks) => {
      const list = get().records[collectionId] ?? [];
      const row = list.find((r) => r.id === recordId);
      if (!row) return;
      const next = { ...row, doc: blocks, updatedAt: Date.now() };
      set((s) => ({
        records: { ...s.records, [collectionId]: list.map((r) => (r.id === recordId ? next : r)) },
      }));
      scheduleRecordSave(collectionId, recordId);
      // 同步层推库里那份（asset:// 引用），blob 地址在别的设备上没意义
      void repo.putRecord({ ...next, doc: unresolveAssetRefs(blocks) as unknown[] }).then(() =>
        queue({
          entity: "record",
          entityId: recordId,
          op: "upsert",
          payload: { record: { ...next, doc: unresolveAssetRefs(blocks) } },
        })
      );
    },

    moveToTrash: async (id) => {
      await repo.softDeletePage(id);
      const row = get().pages.find((p) => p.id === id);
      const rest = get().pages.filter((p) => p.id !== id);
      let pages = rest;
      if (pages.length === 0) {
        const fresh = makePageRow(null, "");
        await repo.putPage(fresh);
        pages = [fresh];
      }
      const tabs = get().tabs.filter((t) => t !== id);
      const nextTabs = tabs.length ? tabs : [pages[0].id];
      set((s) => ({
        pages,
        trash: row ? [{ ...row, deletedAt: Date.now() }, ...s.trash] : s.trash,
        tabs: nextTabs,
        activeTabId: s.activeTabId === id ? nextTabs[nextTabs.length - 1] : s.activeTabId,
      }));
      savePrefs({ tabs: nextTabs, activeTabId: get().activeTabId });
    },

    restoreFromTrash: async (id) => {
      await repo.restorePage(id);
      const row = get().trash.find((p) => p.id === id);
      if (!row) return;
      set((s) => ({
        pages: [...s.pages, { ...row, deletedAt: null }],
        trash: s.trash.filter((p) => p.id !== id),
      }));
    },

    purgeFromTrash: async (id) => {
      await repo.purgePage(id);
      set((s) => ({ trash: s.trash.filter((p) => p.id !== id) }));
    },

    setBlocks: (id, blocks) => {
      set((s) => ({ docs: { ...s.docs, [id]: blocks } }));
      scheduleDocSave(id, blocks);
      const row = get().pages.find((p) => p.id === id);
      if (row) {
        const next = { ...row, updatedAt: Date.now() };
        set((s) => ({ pages: s.pages.map((p) => (p.id === id ? next : p)) }));
        // 正文在防抖里落，元信息这里跟着落一次即可（避免每次敲键都写 pages）
        queue({ entity: "page", entityId: id, op: "upsert", payload: { page: next, blocks } });
      }
    },

    openTab: (id) => {
      const { tabs, activeTabId } = get();
      if (activeTabId === id) return;
      const nextTabs = tabs.includes(id) ? tabs : [...tabs, id];
      // 打开页面时退出"正在看表格"的状态，否则主区还显示着表
      set({ tabs: nextTabs, activeTabId: id, activeCollectionId: null, openRecordRef: null });
      savePrefs({ tabs: nextTabs, activeTabId: id });
      void get().ensureDoc(id);
    },

    closeTab: (id) => {
      const { tabs, activeTabId } = get();
      if (tabs.length <= 1) return;
      const nextTabs = tabs.filter((t) => t !== id);
      const nextActive = activeTabId === id ? nextTabs[nextTabs.length - 1] : activeTabId;
      set({ tabs: nextTabs, activeTabId: nextActive });
      savePrefs({ tabs: nextTabs, activeTabId: nextActive });
      if (nextActive) void get().ensureDoc(nextActive);
    },

    setActiveTab: (id) => {
      set({ activeTabId: id, activeCollectionId: null, openRecordRef: null });
      savePrefs({ activeTabId: id });
      void get().ensureDoc(id);
    },

    setTheme: (theme) => {
      set({ theme });
      savePrefs({ theme });
    },
    toggleTheme: () => get().setTheme(get().theme === "light" ? "dark" : "light"),
    setIconSet: (iconSet) => {
      set({ iconSet });
      savePrefs({ iconSet });
    },
    setFontTheme: (fontTheme) => {
      set({ fontTheme });
      savePrefs({ fontTheme });
    },
    toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    toggleRightPanel: () => {
      const v = !get().rightPanelOpen;
      set({ rightPanelOpen: v });
      savePrefs({ rightPanelOpen: v });
    },
    setRightPanelOpen: (open, persist = true) => {
      set({ rightPanelOpen: open });
      if (persist) savePrefs({ rightPanelOpen: open });
    },
  };
});

/** 当前打开的页面 */
export function useActivePage(): PageRow | null {
  return useStore((s) => s.pages.find((p) => p.id === s.activeTabId) ?? null);
}

/** 当前打开页面的正文（可能还没加载好） */
export function useActiveDoc(): PartialBlock[] | null {
  return useStore((s) => {
    if (!s.activeTabId) return null;
    return (s.docs[s.activeTabId] as PartialBlock[]) ?? null;
  });
}
