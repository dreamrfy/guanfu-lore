/**
 * 斜杠菜单等入口触发的 AI 命令。
 *
 * 走 store 而不是事件总线：命令不会因为「右侧面板当时是关着的」而丢失，
 * 面板打开后会立刻取到并执行（dispatch 时顺手把面板打开）。
 */
export type AiCommandKind = "summary" | "points" | "rewriteBlock" | "askPage" | "selection";

export type AiCommand = {
  kind: AiCommandKind;
  /** rewriteBlock 用：要改写的块 id */
  blockId?: string;
  /** rewriteBlock / selection 用：块里的原文（W93：SelectionAi 弹层「在 AI 面板继续问」带选中原文） */
  text?: string;
  /** askPage 用：要问的问题（搜索浮层里「问问 AI「关键词」」） */
  question?: string;
};
