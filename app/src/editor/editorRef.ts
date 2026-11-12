/**
 * 当前编辑器实例的引用
 *
 * 用途：页面菜单里的"导出 Markdown / 复制为 Markdown"要用编辑器的序列化能力
 * （BlockNote 自带的 blocksToMarkdownLossy，不自己写转换）。
 * 编辑器实例只活在 PageEditor 里，这里存一个引用，让工具栏那边能拿到。
 *
 * 注意：切页面时 PageEditor 会重建，所以离开时要清掉，避免指向一个已经销毁的编辑器。
 */
import type { BlockNoteEditor } from "@blocknote/core";

// 泛型参数用 any 是刻意的：这里只做"传递引用"，不关心具体 schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEditor = BlockNoteEditor<any, any, any>;

let current: AnyEditor | null = null;

export function setCurrentEditor(editor: AnyEditor | null): void {
  current = editor;
}

export function getCurrentEditor(): AnyEditor | null {
  return current;
}
