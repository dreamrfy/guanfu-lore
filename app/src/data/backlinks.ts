/**
 * 反向链接：谁在正文里 @ 了本页。
 *
 * 数据层只扫本机库（个人知识库量级够用）。正文可能还没被打开过，
 * 所以内存里没有就去库里读——和全文搜索一样，不假设"所有正文都在内存"。
 */
import { repo } from "./db";
import { useStore } from "./store";

export type Backlink = {
  pageId: string;
  title: string;
  blockId: string;
  /** 提及所在块的纯文本，界面用来给出上下文 */
  snippet: string;
};

const MENTION_TYPE = "pageMention";

/** 块内联内容里是否 @了目标页 */
function containsMention(node: unknown, targetId: string): boolean {
  if (!node) return false;
  if (Array.isArray(node)) return node.some((n) => containsMention(n, targetId));
  if (typeof node !== "object") return false;
  const obj = node as Record<string, unknown>;
  if (obj.type === MENTION_TYPE) {
    const props = obj.props as { pageId?: string } | undefined;
    if (props?.pageId === targetId) return true;
  }
  return containsMention(obj.content, targetId) || containsMention(obj.children, targetId);
}

/** 把块里可读的文字拼出来（提及节点用它的标题代替） */
function blockText(block: Record<string, unknown>): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (typeof obj.text === "string") parts.push(obj.text);
    if (obj.type === MENTION_TYPE) {
      const props = obj.props as { title?: string } | undefined;
      parts.push(`@${props?.title ?? "页面"}`);
    }
    if (Array.isArray(obj.content)) walk(obj.content);
    if (Array.isArray(obj.children)) walk(obj.children);
  };
  walk(block.content);
  return parts.join("").trim();
}

/** 在块树里找第一个提到目标页的块 */
export function findBlockWithMention(
  blocks: unknown,
  targetId: string
): { id: string; text: string } | null {
  if (!Array.isArray(blocks)) return null;
  for (const node of blocks) {
    if (!node || typeof node !== "object") continue;
    const block = node as Record<string, unknown>;
    if (containsMention(block.content, targetId)) {
      return { id: String(block.id ?? ""), text: blockText(block) };
    }
    const nested = findBlockWithMention(block.children, targetId);
    if (nested) return nested;
  }
  return null;
}

/** 遍历全部存活页面，找出提到 targetId 的页面（每页最多一条，够用于引用条） */
export async function findBacklinks(targetId: string): Promise<Backlink[]> {
  const { pages, docs } = useStore.getState();
  const out: Backlink[] = [];
  for (const page of pages) {
    if (page.id === targetId) continue;
    const blocks = docs[page.id] ?? (await repo.getDoc(page.id)) ?? [];
    const hit = findBlockWithMention(blocks, targetId);
    if (hit) {
      out.push({
        pageId: page.id,
        title: page.title || "无标题",
        blockId: hit.id,
        snippet: hit.text.slice(0, 120),
      });
    }
  }
  return out;
}
