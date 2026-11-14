/**
 * 网页划线（H03 客户端渲染）
 *
 * 服务端把划线存成 quoted fragment（exact + 前后引文，H02 的表）；
 * 这里把对应剪藏页面的划线取回来，在详情页正文里定位并渲染成高亮摘录。
 * 定位复用 extension/locator.js 的 matchInText，不复制逻辑——活页和快照两边的
 * 空白折叠规则必须一字不差才能互相命中（H01 的教训）。
 *
 * locator.js 的 UMD 包装在不同运行时挂的点不一样：
 *   浏览器（Vite 构建）→ root.kfTextLocator（self/window 全局）；
 *   vitest（Vite SSR 把它当 CJS）→ module.exports 进模块命名空间。
 * 所以三处都找一遍：全局 → default → 模块本体。
 */
// @ts-expect-error UMD 脚本没有类型声明（manifest 之外的原生 JS，extension 里独立维护）
import * as locatorModule from "../../../extension/locator.js";
import { loadClipServerUrl, loadClipToken } from "./clipApi";

export type HighlightItem = {
  id: string;
  pageUrl: string;
  title: string;
  quote: { exact: string; prefix: string; suffix: string };
  createdAt: number;
};

type TextLocator = {
  matchInText: (text: string, sel: { exact: string; prefix?: string; suffix?: string }) => number;
};

function locator(): TextLocator {
  const globalApi = (globalThis as { kfTextLocator?: TextLocator }).kfTextLocator;
  const mod = locatorModule as unknown as { default?: TextLocator } & Partial<TextLocator>;
  const moduleApi: TextLocator | undefined =
    typeof mod.matchInText === "function" ? { matchInText: mod.matchInText } : undefined;
  const api = globalApi ?? mod.default ?? moduleApi;
  if (!api) throw new Error("kfTextLocator 未加载（locator.js 导入失败）");
  return api;
}

/** 取某页面的全部划线；服务器不可达/未部署/无划线一律空数组（详情页静默降级，不弹错） */
export async function fetchHighlights(pageUrl: string): Promise<HighlightItem[]> {
  if (!pageUrl) return [];
  try {
    const server = await loadClipServerUrl();
    const token = await loadClipToken();
    const res = await fetch(`${server}/api/highlights?pageUrl=${encodeURIComponent(pageUrl)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return [];
    const data = (await res.json().catch(() => null)) as { ok?: boolean; items?: HighlightItem[] } | null;
    return data?.ok ? (data.items ?? []) : [];
  } catch {
    return [];
  }
}

export type MarkedExcerpt = {
  id: string;
  before: string;
  mark: string;
  after: string;
};

/** 摘录前后各带的上下文字数：够认出在哪一段，又不至于把整段抄一遍 */
const RADIUS = 48;

/** 与 locator.js matchInText 内部的空白折叠一字不差（含正则）——两边必须在同一坐标系里说话 */
const FOLD_RE = /[\s ]+/g;

/**
 * 在正文文本里定位每条划线，生成摘录（前后带上下文，命中段用 mark 包起来）。
 * 先把文本按 locator 的规则折叠，再匹配、再切片——matchInText 返回的下标是折叠后
 * 文本里的，直接拿去切原文会在有换行/缩进的地方错位（单测逮到的第一个真 bug）。
 * 多条共存按出现顺序排；互相重叠的只留先出现的那条（绝不叠 mark）。
 * 定位不到的条目跳过不报错——正文可能已被编辑，引文对不上属正常。
 */
export function highlightExcerpts(text: string, items: HighlightItem[]): MarkedExcerpt[] {
  if (!text || items.length === 0) return [];
  const textFolded = String(text).replace(FOLD_RE, " ");
  const hits: Array<{ id: string; start: number; end: number }> = [];
  for (const item of items) {
    if (!item?.quote?.exact) continue;
    const start = locator().matchInText(textFolded, item.quote);
    if (start < 0) continue;
    hits.push({ id: item.id, start, end: start + item.quote.exact.length });
  }
  hits.sort((a, b) => a.start - b.start || a.end - b.end);
  const excerpts: MarkedExcerpt[] = [];
  let lastEnd = -1;
  for (const hit of hits) {
    if (hit.start < lastEnd) continue; // 与上一条重叠
    lastEnd = hit.end;
    const from = Math.max(0, hit.start - RADIUS);
    const to = Math.min(textFolded.length, hit.end + RADIUS);
    excerpts.push({
      id: hit.id,
      before: (from > 0 ? "…" : "") + textFolded.slice(from, hit.start),
      mark: textFolded.slice(hit.start, hit.end),
      after: textFolded.slice(hit.end, to) + (to < textFolded.length ? "…" : ""),
    });
  }
  return excerpts;
}
