/**
 * 页面标签（M02）
 *
 * 标签就是 PageRow 上的字符串数组，跟着页面行一起存、一起走同步（payload 整行上送）。
 * 「全局标签视图」= 在内存 pages 上归并统计，不另建表：页面量级下这是最便宜、
 * 也永远不会和页面数据打架的做法。软删页不计入。
 */
import type { PageRow } from "./db";

const CN_COLLATOR = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });

/** 归一一个标签输入：去首尾空白、内部空白折叠成一个空格；空串丢弃由调用方处理 */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** 活页上的全部标签：计数，按次数降序、同次数按中文序 */
export function collectTags(pages: PageRow[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of pages) {
    if (p.deletedAt != null) continue;
    for (const t of p.tags ?? []) {
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || CN_COLLATOR.compare(a.tag, b.tag));
}

/** 打了某标签的活页，按修改时间新→旧 */
export function pagesWithTag(pages: PageRow[], tag: string): PageRow[] {
  return pages
    .filter((p) => p.deletedAt == null && (p.tags ?? []).includes(tag))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
