/**
 * 导出（Markdown / HTML）与导入（Markdown）
 *
 * 刻意不自己写块 → Markdown 的转换：BlockNote 自带
 *   blocksToMarkdownLossy()  块 → Markdown
 *   blocksToFullHTML()       块 → 完整 HTML
 *   tryParseMarkdownToBlocks() Markdown → 块
 * 自己写一版只会更差（列表嵌套、行内样式、代码块围栏这些坑它都踩过了）。
 */
import type { PartialBlock } from "@blocknote/core";
import { getCurrentEditor } from "../editor/editorRef";
import { newId } from "./db";

/** 触发浏览器下载一段文本 */
export function downloadText(filename: string, text: string, mime = "text/plain"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 文件名里不能出现的字符换成下划线，避免用户取了个带 / 的标题导致下载失败 */
export function safeFileName(title: string, ext: string): string {
  const base = (title || "无标题").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
  return `${base}.${ext}`;
}

/**
 * 整页导出为 Markdown。
 * 标题单独加一行 `# 标题`——因为标题在我们模型里是页面字段、不在块里，
 * 不补的话导出的文件会丢掉标题。
 */
export function pageToMarkdown(title: string, blocks: PartialBlock[]): string {
  const editor = getCurrentEditor();
  const body = editor ? editor.blocksToMarkdownLossy(blocks as never) : "";
  const t = title?.trim();

  // 正文开头已经是同名的一级标题时不要再补一行——否则导出文件里标题出现两次
  // （从 Markdown 导入的页面最容易这样：`# 标题` 既成了页面标题、又留在正文第一块）
  const alreadyHasTitle = t ? body.trimStart().startsWith(`# ${t}`) : false;
  const head = t && !alreadyHasTitle ? `# ${t}\n\n` : "";
  return `${head}${body}\n`;
}

/**
 * 导入时用：如果正文第一块就是和页面标题相同的一级标题，把它去掉。
 * 因为那个标题已经进"页面标题"字段了，再留一块在正文里就重复了。
 */
export function dropLeadingTitleBlock(title: string, blocks: PartialBlock[]): PartialBlock[] {
  const first = blocks[0] as { type?: string; props?: { level?: number }; content?: unknown } | undefined;
  if (!first || first.type !== "heading") return blocks;

  const level = Number(first.props?.level ?? 1);
  if (level !== 1) return blocks;

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

  return textOf(first.content).trim() === title.trim() ? blocks.slice(1) : blocks;
}

/** 整页导出为 HTML（自带完整样式类名，可直接塞进网页） */
export function pageToHtml(title: string, blocks: PartialBlock[]): string {
  const editor = getCurrentEditor();
  const body = editor ? editor.blocksToFullHTML(blocks as never) : "";
  const safeTitle = (title || "无标题").replace(/[<>&]/g, "");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
</head>
<body>
${body}
</body>
</html>
`;
}

/** Markdown 文本 → 块（导入用） */
export function markdownToBlocks(markdown: string): PartialBlock[] {
  const editor = getCurrentEditor();
  if (!editor) throw new Error("编辑器还没准备好，稍后再试");
  return editor.tryParseMarkdownToBlocks(markdown) as unknown as PartialBlock[];
}

/** 从 Markdown 里取一个标题当页面名（第一个 # 开头行），取不到就用文件名 */
export function titleFromMarkdown(markdown: string, fallback: string): string {
  const m = markdown.match(/^\s*#\s+(.+)$/m);
  return (m?.[1] ?? fallback).trim().slice(0, 120);
}

/** 生成一个不与现有 id 冲突的副本 id（副本要独立，不能共用 id） */
export const copyId = () => newId();
