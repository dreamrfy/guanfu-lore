/**
 * 批量 AI 用到的固定字段名。
 * 单独成文件是为了让 store 与 aiBatch 都能引用，而不互相 import 造成环。
 */
export const AI_SUMMARY_FIELD = "AI 摘要";
export const AI_STATUS_FIELD = "AI 状态";

export const AI_STATUS_OPTIONS = ["未生成", "生成中", "已生成", "失败"] as const;
export type AiStatus = (typeof AI_STATUS_OPTIONS)[number];
