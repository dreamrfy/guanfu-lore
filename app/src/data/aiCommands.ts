/**
 * 斜杠菜单等入口触发的 AI 命令。
 *
 * 走 store 而不是事件总线：命令不会因为「右侧面板当时是关着的」而丢失，
 * 面板打开后会立刻取到并执行（dispatch 时顺手把面板打开）。
 */
export type AiCommandKind = "summary" | "points" | "rewriteBlock";

export type AiCommand = {
  kind: AiCommandKind;
  /** rewriteBlock 用：要改写的块 id */
  blockId?: string;
  /** rewriteBlock 用：块里的原文 */
  text?: string;
};
