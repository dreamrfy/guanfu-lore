/**
 * 最近浏览（W80 搜索浮层默认态的「最近浏览」分组）
 *
 * 规格来源：08 §1「默认态列表：『在 [当前页] 中问 AI』行 +『最近浏览』分组（图标+标题，
 * **含已删除页面——回收站内容仍在最近浏览里**）」。
 *
 * 数据来源：导航历史栈（useNavHistory.stack，最近访问顺序）+ 回收站页（store.trash）。
 * 之所以不用 navHistory 单靠它：栈里不含已删页，而规格明确要求回收站内容仍在最近浏览里。
 *
 * 为什么现算而不是另建一张表：
 *  - 「最近浏览」本身是 FlowUs 的入口级功能，但桌面/网页**没有独立的最近浏览页面**（/recent 404），
 *    只在搜索浮层里露一个分组 → 落库一张表不值得。
 *  - 每次开浮层现算一次，成本是 O(栈长 + 回收站条数)，个人库量级完全可接受。
 */
import { useNavHistory } from "./navHistory";
import { useStore } from "./store";
import type { PageRow } from "./db";

export type RecentItem = {
  pageId: string;
  title: string;
  icon: string | null;
  /** 在回收站里（已删除） */
  deleted: boolean;
  /** 访问/编辑时间，倒序用 */
  at: number;
};

/** 最近浏览最多列几条（浮层里露一个分组，不铺满屏） */
const MAX_RECENT = 8;

/**
 * 算「最近浏览」列表：按访问时间倒序，**含已删除页**。
 *
 * 排序口径：导航栈里的页按栈位置（越靠后越近）算时间，回收站里的页按 deletedAt 兜底。
 * 同一个页既在栈里又在回收站里 → 以栈位置为准（仍在标记为已删除）。
 */
export function getRecentItems(limit = MAX_RECENT): RecentItem[] {
  const state = useStore.getState();
  const { stack } = useNavHistory.getState();

  // 页 id → 元信息（含回收站的）
  const byId = new Map<string, PageRow>();
  for (const p of state.pages) byId.set(p.id, p);
  for (const p of state.trash) byId.set(p.id, p);

  // 栈里越靠后 = 越近；用栈长度做基数，回收站页用 deletedAt 折算到同一尺度
  const stackBase = stack.length;
  const out: RecentItem[] = [];
  const seen = new Set<string>();

  stack.forEach((pageId, i) => {
    const page = byId.get(pageId);
    if (!page) return;
    seen.add(pageId);
    // 栈位置 i 越靠后越新；用一个随栈长度递减的序号当时间戳
    out.push({
      pageId,
      title: page.title,
      icon: page.icon ?? null,
      deleted: page.deletedAt !== null,
      at: stackBase - i,
    });
  });

  // 回收站里但不在栈里的页：按删除时间倒序接在后面
  const trashOnly = state.trash
    .filter((p) => !seen.has(p.id))
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
    .map((p) => ({
      pageId: p.id,
      title: p.title,
      icon: p.icon ?? null,
      deleted: true,
      at: 0,
    }));

  return [...out, ...trashOnly].slice(0, limit);
}
