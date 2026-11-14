/**
 * 批量 AI 总结：剪藏库里一条条跑，逐条落库，随时可停。
 *
 * 设计成纯逻辑 + 注入 apply/chat：
 *  - 界面负责把状态/摘要写进 store（apply）；
 *  - 测试可以完全离线跑（注入假 chat），不烧 token。
 */
import type { CollectionRow, RecordRow } from "./db";
import { AI_STATUS_FIELD, AI_SUMMARY_FIELD, type AiStatus } from "./aiFields";
import { buildPageMessages, chat, type AiConfig, type ChatMessage } from "./ai";

export type BatchScope = "missing" | "all";

export type BatchResult = {
  done: number;
  failed: number;
  cancelled: boolean;
};

export function aiFieldIds(collection: CollectionRow): {
  summaryId: string | null;
  statusId: string | null;
} {
  return {
    summaryId: collection.fields.find((f) => f.name === AI_SUMMARY_FIELD)?.id ?? null,
    statusId: collection.fields.find((f) => f.name === AI_STATUS_FIELD)?.id ?? null,
  };
}

export function aiStatusOptionId(collection: CollectionRow, status: AiStatus): string | null {
  const field = collection.fields.find((f) => f.name === AI_STATUS_FIELD);
  return field?.options?.find((o) => o.name === status)?.id ?? null;
}

/** 从记录正文里抽纯文本（提及节点用标题代替） */
export function recordText(record: RecordRow): string {
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
    if (obj.type === "pageMention") {
      const props = obj.props as { title?: string } | undefined;
      parts.push(`@${props?.title ?? "页面"}`);
    }
    if (Array.isArray(obj.content)) walk(obj.content);
    if (Array.isArray(obj.children)) walk(obj.children);
  };
  walk(record.doc ?? []);
  return parts.join("\n").trim();
}

/** 记录标题：第一个文本字段的值（和表格标题列一致） */
export function recordTitle(collection: CollectionRow, record: RecordRow): string {
  const field = collection.fields.find((f) => f.type === "text" && f.name !== AI_SUMMARY_FIELD);
  if (!field) return "";
  return String(record.values[field.id] ?? "");
}

/**
 * 选要处理的记录。
 * missing = 状态不是「已生成」的（含空、失败、生成中）；all = 全部。
 */
export function selectBatchRecords(
  records: RecordRow[],
  collection: CollectionRow,
  scope: BatchScope
): RecordRow[] {
  if (scope === "all") return records;
  const { statusId } = aiFieldIds(collection);
  if (!statusId) return records;
  const doneId = aiStatusOptionId(collection, "已生成");
  return records.filter((r) => !doneId || String(r.values[statusId] ?? "") !== doneId);
}

export function buildRecordSummaryMessages(
  collection: CollectionRow,
  record: RecordRow
): ChatMessage[] | null {
  return buildPageMessages("summary", recordTitle(collection, record), recordText(record));
}

export type BatchApply = (recordId: string, patch: { summary?: string; status: AiStatus }) => void;

export async function runBatch(opts: {
  collection: CollectionRow;
  records: RecordRow[];
  config: AiConfig;
  apply: BatchApply;
  onProgress?: (info: { index: number; total: number; title: string }) => void;
  isCancelled?: () => boolean;
  /** 测试注入；生产默认真实请求 */
  chatFn?: typeof chat;
}): Promise<BatchResult> {
  const { collection, records, config, apply, onProgress, isCancelled } = opts;
  const callChat = opts.chatFn ?? chat;
  let done = 0;
  let failed = 0;
  let cancelled = false;

  for (let i = 0; i < records.length; i += 1) {
    if (isCancelled?.()) {
      cancelled = true;
      break;
    }
    const record = records[i];
    const title = recordTitle(collection, record) || "无标题";
    onProgress?.({ index: i + 1, total: records.length, title });

    const messages = buildRecordSummaryMessages(collection, record);
    if (!messages) {
      apply(record.id, { status: "失败" });
      failed += 1;
      continue;
    }

    apply(record.id, { status: "生成中" });
    const result = await callChat(messages, config);
    if (result.ok) {
      apply(record.id, { summary: result.text, status: "已生成" });
      done += 1;
    } else {
      apply(record.id, { status: "失败" });
      failed += 1;
    }
  }

  return { done, failed, cancelled };
}
