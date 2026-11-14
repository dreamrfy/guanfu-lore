import { describe, expect, it, vi } from "vitest";
import type { CollectionRow, RecordRow } from "./db";
import {
  aiFieldIds,
  aiStatusOptionId,
  buildRecordSummaryMessages,
  recordText,
  recordTitle,
  runBatch,
  selectBatchRecords,
} from "./aiBatch";
import { AI_STATUS_FIELD, AI_SUMMARY_FIELD } from "./aiFields";
import { makeField } from "./collections";
import { useStore } from "./store";

const config = { baseUrl: "https://x/v1", apiKey: "k", model: "m", temperature: 0 };

function collection(): CollectionRow {
  const title = makeField("text", "标题");
  const status = {
    ...makeField("select", AI_STATUS_FIELD),
    options: [
      { id: "st-none", name: "未生成", color: "grey" },
      { id: "st-run", name: "生成中", color: "blue" },
      { id: "st-done", name: "已生成", color: "green" },
      { id: "st-fail", name: "失败", color: "red" },
    ],
  };
  const summary = makeField("text", AI_SUMMARY_FIELD);
  return {
    id: "c1",
    name: "剪藏库",
    icon: "📥",
    fields: [title, status, summary],
    views: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

const C = collection();

function record(id: string, title: string, text: string, status = ""): RecordRow {
  return {
    id,
    collectionId: "c1",
    values: { [C.fields[0].id]: title, [C.fields[1].id]: status },
    doc: text
      ? [{ id: `b-${id}`, type: "paragraph", content: [{ type: "text", text }] }]
      : [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("批量 AI：字段与取值", () => {
  it("按字段名找到摘要列与状态列", () => {
    const ids = aiFieldIds(C);
    expect(ids.summaryId).toBeTruthy();
    expect(ids.statusId).toBeTruthy();
    expect(aiStatusOptionId(C, "已生成")).toBe("st-done");
  });

  it("正文抽纯文本，标题取第一个文本字段", () => {
    const c = C;
    const rec = record("r1", "文章标题", "第一段正文");
    expect(recordText(rec)).toBe("第一段正文");
    expect(recordTitle(c, rec)).toBe("文章标题");
  });

  it("没有正文就不发请求", () => {
    expect(buildRecordSummaryMessages(C, record("r1", "空标题", ""))).toBeNull();
  });
});

describe("批量 AI：选记录", () => {
  it("missing 排除已生成的，all 全要", () => {
    const c = C;
    const done = record("r1", "已做", "正文", "st-done");
    const todo = record("r2", "没做", "正文", "st-none");
    const fresh = record("r3", "全新", "正文", "");
    expect(selectBatchRecords([done, todo, fresh], c, "missing").map((r) => r.id)).toEqual([
      "r2",
      "r3",
    ]);
    expect(selectBatchRecords([done, todo, fresh], c, "all")).toHaveLength(3);
  });
});

describe("批量 AI：执行", () => {
  it("成功写摘要与已生成；没正文的记为失败且不发请求", async () => {
    const c = C;
    const chatFn = vi.fn(async () => ({ ok: true as const, text: "这是摘要" }));
    const apply = vi.fn();

    const result = await runBatch({
      collection: c,
      records: [record("r1", "有正文", "正文内容"), record("r2", "空正文", "")],
      config,
      apply,
      chatFn,
    });

    expect(result).toEqual({ done: 1, failed: 1, cancelled: false });
    expect(chatFn).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith("r1", { status: "生成中" });
    expect(apply).toHaveBeenCalledWith("r1", { summary: "这是摘要", status: "已生成" });
    expect(apply).toHaveBeenCalledWith("r2", { status: "失败" });
  });

  it("模型报错时记为失败，不写摘要", async () => {
    const c = C;
    const chatFn = vi.fn(async () => ({ ok: false as const, error: "限流" }));
    const apply = vi.fn();
    const result = await runBatch({
      collection: c,
      records: [record("r1", "有正文", "正文内容")],
      config,
      apply,
      chatFn,
    });
    expect(result).toEqual({ done: 0, failed: 1, cancelled: false });
    expect(apply).toHaveBeenCalledWith("r1", { status: "失败" });
  });

  it("可以中途停止，已完成的保留", async () => {
    const c = C;
    const apply = vi.fn();
    let calls = 0;
    const chatFn = vi.fn(async () => {
      calls += 1;
      return { ok: true as const, text: "摘要" };
    });
    const result = await runBatch({
      collection: c,
      records: [record("r1", "一", "正文"), record("r2", "二", "正文")],
      config,
      apply,
      chatFn,
      isCancelled: () => calls >= 1,
    });
    expect(result.cancelled).toBe(true);
    expect(result.done).toBe(1);
    expect(chatFn).toHaveBeenCalledTimes(1);
  });

  it("进度回调给出序号与标题", async () => {
    const c = C;
    const onProgress = vi.fn();
    await runBatch({
      collection: c,
      records: [record("r1", "第一篇", "正文")],
      config,
      apply: vi.fn(),
      chatFn: async () => ({ ok: true as const, text: "x" }),
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledWith({ index: 1, total: 1, title: "第一篇" });
  });
});

describe("批量 AI：建列", () => {
  it("ensureAiFields 会补上摘要列与状态列，重复调用不重复加", async () => {
    useStore.setState({
      collections: [
        {
          id: "c9",
          name: "剪藏库",
          icon: null,
          fields: [makeField("text", "标题")],
          views: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      records: {},
    });
    const first = await useStore.getState().ensureAiFields("c9");
    expect(first?.fields.map((f) => f.name)).toContain(AI_SUMMARY_FIELD);
    expect(first?.fields.map((f) => f.name)).toContain(AI_STATUS_FIELD);
    const second = await useStore.getState().ensureAiFields("c9");
    expect(second!.fields).toHaveLength(first!.fields.length);
  });
});
