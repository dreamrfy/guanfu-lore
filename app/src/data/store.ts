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
import { resolveAssetRefs, unresolveAssetRefs, uploadAsset } from "./assets";
import { DEFAULT_FONT_THEME } from "../design/fonts";
import { DEFAULT_ICON_SET, type IconSetId } from "../design/icons";

export type ThemeMode = "light" | "dark";

const PREFS_KEY = "yzgifyz.h8.prefs";

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

/** 立刻把还没落盘的正文写掉（关窗/切走前用；调用后仍可继续编辑） */
export async function flushDocs(): Promise<void> {
  const pending = [...docTimers.keys()];
  docTimers.forEach((t) => clearTimeout(t));
  docTimers.clear();
  const docs = useStore.getState().docs;
  await Promise.all(pending.map((id) => writeDoc(id, docs[id] ?? [])));
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
  setCell: (collectionId: string, recordId: string, fieldId: string, value: unknown) => void;
  removeRecord: (collectionId: string, recordId: string) => Promise<void>;
  updateView: (collectionId: string, viewId: string, patch: Partial<ViewDef>) => void;

  theme: ThemeMode;
  iconSet: IconSetId;
  fontTheme: string;
  rightPanelOpen: boolean;
  sidebarCollapsed: boolean;

  hydrate: () => Promise<void>;
  ensureDoc: (pageId: string) => Promise<void>;

  createPage: (parentId?: string | null) => Promise<string>;
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

    createPage: async (parentId = null) => {
      const row = makePageRow(parentId, "");
      await repo.putPage(row);
      set((s) => ({ pages: [...s.pages, row], docs: { ...s.docs, [row.id]: [] } }));
      get().openTab(row.id);
      return row.id;
    },

    renamePage: (id, title) => {
      const row = get().pages.find((p) => p.id === id);
      if (!row) return;
      const next = { ...row, title, updatedAt: Date.now() };
      set((s) => ({ pages: s.pages.map((p) => (p.id === id ? next : p)) }));
      persist(next);
    },

    setPageIcon: (id, icon) => {
      const row = get().pages.find((p) => p.id === id);
      if (!row) return;
      const next = { ...row, icon, updatedAt: Date.now() };
      set((s) => ({ pages: s.pages.map((p) => (p.id === id ? next : p)) }));
      persist(next);
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
      set((s) => ({ records: { ...s.records, [collectionId]: rows } }));
    },

    createCollection: async (name = "新建表格") => {
      const row = makeCollection(name);
      await repo.putCollection(row);
      set((s) => ({ collections: [...s.collections, row], records: { ...s.records, [row.id]: [] } }));
      await get().openCollection(row.id);
      return row.id;
    },

    openCollection: async (id) => {
      set({ activeCollectionId: id });
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
    },

    updateField: (collectionId, fieldId, patch) => {
      const row = get().collections.find((c) => c.id === collectionId);
      if (!row) return;
      const next = {
        ...row,
        fields: row.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
        updatedAt: Date.now(),
      };
      set((s) => ({ collections: s.collections.map((c) => (c.id === collectionId ? next : c)) }));
      void repo.putCollection(next);
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
    },

    addRecord: async (collectionId) => {
      const rec = makeRecord(collectionId);
      await repo.putRecord(rec);
      set((s) => ({
        records: { ...s.records, [collectionId]: [...(s.records[collectionId] ?? []), rec] },
      }));
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
    },

    removeRecord: async (collectionId, recordId) => {
      await repo.deleteRecord(recordId);
      set((s) => ({
        records: { ...s.records, [collectionId]: (s.records[collectionId] ?? []).filter((r) => r.id !== recordId) },
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
      }
    },

    openTab: (id) => {
      const { tabs, activeTabId } = get();
      if (activeTabId === id) return;
      const nextTabs = tabs.includes(id) ? tabs : [...tabs, id];
      // 打开页面时退出"正在看表格"的状态，否则主区还显示着表
      set({ tabs: nextTabs, activeTabId: id, activeCollectionId: null });
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
      set({ activeTabId: id, activeCollectionId: null });
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
