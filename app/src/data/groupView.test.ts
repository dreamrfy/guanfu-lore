import { describe, expect, it } from "vitest";
import { applyView, groupRecords, makeCollection } from "./collections";
import type { FieldDef, RecordRow, ViewDef } from "./db";

const rec = (values: Record<string, unknown>): RecordRow => ({
  id: "r" + Math.random().toString(36).slice(2, 8),
  collectionId: "c1",
  values,
  createdAt: 1,
  updatedAt: 1,
});

const selectField = (name: string, optionNames: string[]): FieldDef => ({
  id: name,
  name,
  type: "select",
  options: optionNames.map((n, i) => ({ id: "o" + i, name: n, color: "grey" })),
  width: 100,
});

describe("分组视图（V01）", () => {
  it("select 分组：按选项序排组、（空）垫底、计数正确", () => {
    const field = selectField("状态", ["未开始", "进行中", "已完成"]);
    const records = [
      rec({ 状态: "o2" }),
      rec({ 状态: "o0" }),
      rec({ 状态: "o0" }),
      rec({}),
    ];
    const groups = groupRecords(records, field);
    expect(groups.map((g) => [g.label, g.records.length])).toEqual([
      ["未开始", 2],
      ["已完成", 1],
      ["（空）", 1],
    ]);
    // 没有进行中 → 不出现空组
    expect(groups.every((g) => g.records.length > 0)).toBe(true);
  });

  it("multiSelect：一条记录可进多个组；全空进（空）", () => {
    const field: FieldDef = {
      id: "标签", name: "标签", type: "multiSelect", width: 100,
      options: [
        { id: "a", name: "A", color: "grey" },
        { id: "b", name: "B", color: "grey" },
      ],
    };
    const groups = groupRecords(
      [rec({ 标签: ["a", "b"] }), rec({ 标签: ["b"] }), rec({})],
      field
    );
    expect(groups.map((g) => [g.label, g.records.length])).toEqual([
      ["A", 1],
      ["B", 2],
      ["（空）", 1],
    ]);
    // 总人次 = 每条记录至少出现一次
    const total = groups.reduce((s, g) => s + g.records.length, 0);
    expect(total).toBeGreaterThanOrEqual(3);
  });

  it("checkbox：已勾选在前；text：中文序、（空）垫底", () => {
    const cb: FieldDef = { id: "完", name: "完", type: "checkbox", width: 100 };
    const cbGroups = groupRecords([rec({ 完: false }), rec({ 完: true })], cb);
    expect(cbGroups.map((g) => g.label)).toEqual(["已勾选", "未勾选"]);

    const tx: FieldDef = { id: "名", name: "名", type: "text", width: 100 };
    const txGroups = groupRecords([rec({ 名: "磷化工" }), rec({ 名: "安卓壳" }), rec({ 名: "" })], tx);
    expect(txGroups[txGroups.length - 1].label).toBe("（空）");
    expect(txGroups.slice(0, -1).map((g) => g.label).sort()).toEqual(["安卓壳", "磷化工"]);
  });

  it("与筛选/排序共存：applyView 先生效，分组只叠展示", () => {
    const c = makeCollection("表");
    const status = c.fields.find((f) => f.type === "select")!;
    const view: ViewDef = {
      ...c.views[0],
      filters: [{ id: "f1", fieldId: status.id, operator: "is", value: status.options![0].id }],
      sorts: [],
      groupById: status.id,
    };
    const records = [
      rec({ [status.id]: status.options![0].id }),
      rec({ [status.id]: status.options![1].id }),
      rec({}),
    ];
    const rows = applyView(records, c, view);
    expect(rows).toHaveLength(1); // 筛选先生效
    const groups = groupRecords(rows, status);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("未开始");
  });

  it("组内保持传入顺序（= 排序结果）", () => {
    const field = selectField("状态", ["进行中"]);
    const r1 = rec({ 状态: "o0" });
    const r2 = rec({ 状态: "o0" });
    const groups = groupRecords([r1, r2], field);
    expect(groups[0].records.map((r) => r.id)).toEqual([r1.id, r2.id]);
  });
});
