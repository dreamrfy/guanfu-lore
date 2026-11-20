/**
 * 收集箱页（W120）的纯逻辑：状态归类、筛选、搜索、计数。
 *
 * 界面只负责画；这里保证「未读/待整理 → 待整理」「已读/已归档 → 已归档」
 * 的映射只有一份，筛选与角标不会各说各话。
 */
import { asText } from "./collections";
import type { CollectionRow, FieldDef, RecordRow } from "./db";

export type ClipInboxFilter = "all" | "pending" | "archived" | "failed";
export type ClipInboxStatus = Exclude<ClipInboxFilter, "all">;

const STATUS_FIELD_NAME = "状态";
const SEARCH_FIELD_NAMES = ["标题", "作者", "原文链接", "来源", "状态"] as const;

function fieldByName(collection: CollectionRow, name: string): FieldDef | undefined {
  return collection.fields.find((f) => f.name === name);
}

/** select 字段可能是选项 id，也可能是选项名；统一成可读名称 */
function optionName(field: FieldDef | undefined, value: unknown): string {
  if (!field || value === null || value === undefined || value === "") return "";
  const raw = String(value);
  const opt = field.options?.find((o) => o.id === raw || o.name === raw);
  return (opt?.name ?? raw).trim();
}

/**
 * 收集箱语义：
 * - 失败 / error / 抓取失败 → failed
 * - 已读 / 已归档 / archived / done → archived
 * - 未读 / 待整理 / 空 / 其他 → pending
 */
export function clipRecordStatus(collection: CollectionRow, record: RecordRow): ClipInboxStatus {
  const statusField = fieldByName(collection, STATUS_FIELD_NAME);
  const name = optionName(statusField, statusField ? record.values[statusField.id] : "").toLowerCase();
  if (!name) return "pending";
  if (["失败", "抓取失败", "failed", "error", "错误"].includes(name)) return "failed";
  if (["已读", "已归档", "archived", "done", "完成"].includes(name)) return "archived";
  return "pending";
}

/** 收集箱搜索范围：标题、作者、原文链接、来源、状态 */
export function clipSearchText(collection: CollectionRow, record: RecordRow): string {
  const parts: string[] = [];
  for (const name of SEARCH_FIELD_NAMES) {
    const field = fieldByName(collection, name);
    if (!field) continue;
    parts.push(asText(record.values[field.id]));
  }
  return parts.join(" ").toLowerCase();
}

export function filterClipRecords(
  collection: CollectionRow,
  records: readonly RecordRow[],
  filter: ClipInboxFilter,
  query: string,
): RecordRow[] {
  const q = query.trim().toLowerCase();
  return records.filter((record) => {
    if (filter !== "all" && clipRecordStatus(collection, record) !== filter) return false;
    if (!q) return true;
    return clipSearchText(collection, record).includes(q);
  });
}

export type ClipInboxCounts = Record<ClipInboxFilter, number>;

export function countClipStatuses(
  collection: CollectionRow,
  records: readonly RecordRow[],
): ClipInboxCounts {
  const counts: ClipInboxCounts = { all: records.length, pending: 0, archived: 0, failed: 0 };
  for (const record of records) counts[clipRecordStatus(collection, record)] += 1;
  return counts;
}