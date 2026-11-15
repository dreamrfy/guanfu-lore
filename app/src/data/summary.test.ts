import { describe, expect, it } from "vitest";
import { applyView, makeCollection, summarizeRecords } from "./collections";
import type { FieldDef, RecordRow, ViewDef } from "./db";

const rec = (values: Record<string, unknown>): RecordRow => ({
  id: "r" + Math.random().toString(36).slice(2, 8),
  collectionId: "c1",
  values,
  createdAt: 1,
  updatedAt: 1,
});

const numField: FieldDef = { id: "金额", name: "金额", type: "number", width: 100 };
const dateField: FieldDef = { id: "日期", name: "日期", type: "date", width: 100 };

describe("列尾汇总（V02）", () => {
  it("number：求和/均值/计数，空值不进公式，浮点收两位", () => {
    const rows = [rec({ 金额: 10 }), rec({ 金额: "2.5" }), rec({ 金额: null }), rec({})];
    const s = summarizeRecords(rows, numField)!;
    expect(s.count).toBe(2);
    expect(s.sum).toBe(12.5);
    expect(s.avg).toBe(6.25);
    expect(s.label).toBe("计数 2 · 求和 12.5 · 均值 6.25");
  });

  it("number：0.1+0.2 显示 0.3（不露出 0.30000000000000004）", () => {
    const s = summarizeRecords([rec({ 金额: 0.1 }), rec({ 金额: 0.2 })], numField)!;
    expect(s.label).not.toContain("3000000000000000");
    expect(s.label).toContain("求和 0.3");
  });

  it("number：全空 → 空串口径的『空』；均值不除零", () => {
    const s = summarizeRecords([rec({}), rec({ 金额: null })], numField)!;
    expect(s.count).toBe(0);
    expect(s.avg).toBeNull();
    expect(s.label).toBe("空");
  });

  it("date：只给已填计数；text/select 列不出汇总", () => {
    const s = summarizeRecords([rec({ 日期: Date.parse("2026-11-15") }), rec({})], dateField)!;
    expect(s.count).toBe(1);
    expect(s.label).toBe("已填 1");

    const tx: FieldDef = { id: "名", name: "名", type: "text", width: 100 };
    expect(summarizeRecords([rec({ 名: "x" })], tx)).toBeNull();
  });

  it("与筛选共存：汇总只算筛选后的行", () => {
    const c = makeCollection("表");
    const status = c.fields.find((f) => f.type === "select")!;
    c.fields.push(numField); // 金额列
    const view: ViewDef = {
      ...c.views[0],
      filters: [{ id: "f1", fieldId: status.id, operator: "is", value: status.options![0].id }],
      sorts: [],
    };
    const rows = [
      rec({ [status.id]: status.options![0].id, [numField.id]: 100 }),
      rec({ [status.id]: status.options![1].id, [numField.id]: 999 }),
    ];
    const filtered = applyView(rows, c, view);
    const s = summarizeRecords(filtered, numField)!;
    expect(s.sum).toBe(100); // 999 那条被筛选掉了
  });
});
