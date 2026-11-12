/**
 * 全文搜索
 *
 * 现状：在本地把页面标题与正文都扫一遍。个人知识库这个量级（几千篇）完全够用，零依赖。
 * 边界：数据量大到卡了再换真搜索引擎（手册里候选是 Meilisearch，中文开箱即用）。
 *      换的时候只改这个文件——界面只认 searchAll()。
 */
import { repo, type PageRow } from "./db";
import { useStore } from "./store";

export type SearchHit = {
  pageId: string;
  title: string;
  blockId: string;
  /** 命中处的前后文 */
  snippet: string;
  /** 命中词在 snippet 里的起止位置（用于界面加亮） */
  start: number;
  end: number;
};

export type SearchResult = {
  pageId: string;
  title: string;
  hits: SearchHit[];
};

type PlainText = { blockId: string; text: string };

/** 从块树里把纯文本按块抽出来（含嵌套子块、链接里的文字） */
export function extractBlocksText(blocks: unknown[]): PlainText[] {
  const out: PlainText[] = [];

  const textOf = (node: unknown): string => {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (typeof obj.text === "string") return obj.text;
      if (obj.content) return textOf(obj.content);
    }
    return "";
  };

  const walk = (list: unknown[]) => {
    for (const node of list) {
      if (!node || typeof node !== "object") continue;
      const b = node as Record<string, unknown>;
      const blockId = typeof b.id === "string" ? b.id : "";
      const text = textOf(b.content);
      if (blockId && text.trim()) out.push({ blockId, text });
      if (Array.isArray(b.children)) walk(b.children);
    }
  };

  walk(blocks);
  return out;
}

const SNIPPET_PAD = 36;

function makeSnippet(text: string, at: number, len: number): { snippet: string; start: number; end: number } {
  const from = Math.max(0, at - SNIPPET_PAD);
  const to = Math.min(text.length, at + len + SNIPPET_PAD);
  const prefix = from > 0 ? "…" : "";
  const suffix = to < text.length ? "…" : "";
  const snippet = prefix + text.slice(from, to) + suffix;
  const start = prefix.length + (at - from);
  return { snippet, start, end: start + len };
}

/**
 * 跨全部页面搜（标题 + 正文）。
 * 已打开的页面直接用内存里那份，没打开的从库里读。
 */
export async function searchAll(query: string, limit = 40): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const state = useStore.getState();
  const pages: PageRow[] = state.pages;
  const results: SearchResult[] = [];

  for (const page of pages) {
    const hits: SearchHit[] = [];

    // 1) 标题命中（排在前面）
    const title = page.title || "无标题";
    const titleAt = title.toLowerCase().indexOf(q);
    if (titleAt >= 0) {
      const { snippet, start, end } = makeSnippet(title, titleAt, q.length);
      hits.push({ pageId: page.id, title, blockId: "", snippet, start, end });
    }

    // 2) 正文命中
    const doc = (state.docs[page.id] as unknown[]) ?? (await repo.getDoc(page.id)) ?? [];
    for (const { blockId, text } of extractBlocksText(doc)) {
      const at = text.toLowerCase().indexOf(q);
      if (at < 0) continue;
      const { snippet, start, end } = makeSnippet(text, at, q.length);
      hits.push({ pageId: page.id, title, blockId, snippet, start, end });
      if (hits.length >= 5) break; // 单页最多展示几条，避免一篇长文刷屏
    }

    if (hits.length) results.push({ pageId: page.id, title, hits });
    if (results.length >= limit) break;
  }

  // 标题命中的排前面
  results.sort((a, b) => Number(b.hits[0].blockId === "") - Number(a.hits[0].blockId === ""));
  return results;
}

/* ---------------- 点搜索结果后跳到那一块 ---------------- */

let pendingBlock: string | null = null;

/**
 * 记住"要看哪一块"并立刻开始尝试跳过去。
 *
 * 这里刻意**不依赖 React 的 effect**：在同一篇页面内点搜索结果时，页面没变、
 * 渲染完成状态也没变，effect 根本不会重跑——那样就会出现"点了没反应"。
 * 改成自己带重试：编辑器是异步渲染的，找不到就隔一会儿再找，找不到就放弃。
 */
export function setPendingBlockFocus(blockId: string | null): void {
  pendingBlock = blockId;
  if (blockId) runPendingFocus();
}

/** 立刻尝试一次；找不到就排下一次重试。返回本次是否成功定位 */
export function runPendingFocus(tries = 0): boolean {
  if (!pendingBlock) return true;

  const el =
    document.querySelector(`.bn-block-outer[data-id="${pendingBlock}"]`) ??
    document.querySelector(`[data-id="${pendingBlock}"]`);

  if (el) {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("block-flash");
    window.setTimeout(() => el.classList.remove("block-flash"), 1200);
    pendingBlock = null;
    return true;
  }

  // 约 2 秒还找不到就放弃（比如那块已被删掉），不要把定时器一直挂着
  if (tries >= 16) {
    pendingBlock = null;
    return false;
  }
  window.setTimeout(() => runPendingFocus(tries + 1), 120);
  return false;
}

/** 测试用：当前是否有待跳转目标 */
export function peekPendingBlock(): string | null {
  return pendingBlock;
}
