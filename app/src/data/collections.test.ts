import { describe, expect, it } from "vitest";
import {
  applyView,
  asChecked,
  asDateMs,
  asNumber,
  compareByField,
  defaultValueFor,
  makeCollection,
  makeField,
  makeFilter,
  makeRecord,
  makeSort,
  makeView,
  matchesFilter,
  needsValue,
  operatorsFor,
} from "./collections";
import type { FieldDef, RecordRow } from "./db";

const field = (type: FieldDef["type"], id = "f1"): FieldDef => ({ ...makeField(type), id });
const rec = (values: Record<string, unknown>, id = "r1"): RecordRow => ({
  id,
  collectionId: "c1",
  values,
  createdAt: 1,
  updatedAt: 1,
});

describe("建表", () => {
  it("默认给标题与状态两列，且有一份默认视图", () => {
    const c = makeCollection("剪藏库");
    expect(c.name).toBe("剪藏库");
    expect(c.fields).toHaveLength(2);
    expect(c.fields[0].type).toBe("text");
    expect(c.fields[1].type).toBe("select");
    expect(c.fields[1].options).toHaveLength(3);
    expect(c.views).toHaveLength(1);
  });
});

describe("筛选/排序的界面辅助", () => {
  it("运算符按字段类型给，日期不能「包含」", () => {
    expect(operatorsFor("date")).toContain("before");
    expect(operatorsFor("date")).not.toContain("contains");
    expect(operatorsFor("number")).toContain("gt");
    expect(operatorsFor("select")).toEqual(["is", "isNot", "isEmpty", "isNotEmpty"]);
    expect(operatorsFor("checkbox")).toEqual(["is"]);
  });

  it("只有「为空 / 不为空」不需要填值", () => {
    expect(needsValue("isEmpty")).toBe(false);
    expect(needsValue("isNotEmpty")).toBe(false);
    expect(needsValue("contains")).toBe(true);
    expect(needsValue("gt")).toBe(true);
  });

  it("默认值：数字 0、日期有值、勾选框 true、单选取第一个选项", () => {
    const num = field("number");
    expect(defaultValueFor(num)).toBe(0);
    const date = field("date");
    expect(typeof defaultValueFor(date)).toBe("number");
    expect(defaultValueFor(field("checkbox"))).toBe(true);

    const sel = makeField("select", "状态");
    sel.options = [{ id: "o1", name: "未开始", color: "grey" }];
    expect(defaultValueFor(sel)).toBe("o1");
  });

  it("新条件用该字段第一个合法的运算符，并带默认值", () => {
    const text = makeField("text", "标题");
    const f = makeFilter(text);
    expect(f.fieldId).toBe(text.id);
    expect(f.operator).toBe("contains");
    expect(f.value).toBe("");
    expect(f.id).toBeTruthy();

    const f2 = makeFilter(makeField("checkbox", "完成"));
    expect(f2.operator).toBe("is");
    expect(f2.value).toBe(true);
  });

  it("新排序默认升序，方向可改", () => {
    expect(makeSort("f1")).toEqual({ fieldId: "f1", direction: "asc" });
    expect(makeSort("f1", "desc").direction).toBe("desc");
  });

  it("文本「包含」还没填值时不算筛选（保护刚加条件的瞬间）", () => {
    const t = field("text");
    expect(matchesFilter(rec({ f1: "苹果笔记" }), t, { operator: "contains", value: "" })).toBe(true);
    expect(matchesFilter(rec({ f1: "" }), t, { operator: "contains", value: "" })).toBe(true);
    expect(matchesFilter(rec({ f1: "苹果笔记" }), t, { operator: "contains", value: "香蕉" })).toBe(false);
  });

  it("日期「早于/晚于」真的能筛（和界面运算符对齐）", () => {
    const d = field("date");
    const r = rec({ f1: Date.parse("2026-01-02") });
    expect(matchesFilter(r, d, { operator: "before", value: Date.parse("2026-01-03") })).toBe(true);
    expect(matchesFilter(r, d, { operator: "after", value: Date.parse("2026-01-03") })).toBe(false);
  });

  it("勾选框「等于」按布尔值筛", () => {
    const c = field("checkbox");
    expect(matchesFilter(rec({ f1: true }), c, { operator: "is", value: true })).toBe(true);
    expect(matchesFilter(rec({ f1: false }), c, { operator: "is", value: true })).toBe(false);
  });
});

describe("取值归一化", () => {
  it("数字：空与非法都是 null", () => {
    expect(asNumber("12.5")).toBe(12.5);
    expect(asNumber("")).toBeNull();
    expect(asNumber("abc")).toBeNull();
  });

  it("日期：支持毫秒数与字符串", () => {
    expect(asDateMs(1700000000000)).toBe(1700000000000);
    expect(asDateMs("2026-11-12")).toBe(Date.parse("2026-11-12"));
    expect(asDateMs("")).toBeNull();
  });

  it("勾选：多种真值写法都认", () => {
    expect(asChecked(true)).toBe(true);
    expect(asChecked("true")).toBe(true);
    expect(asChecked(1)).toBe(true);
    expect(asChecked(false)).toBe(false);
  });
});

describe("筛选", () => {
  it("文本：包含 / 等于 / 不等于", () => {
    const f = field("text");
    const r = rec({ f1: "磷酸铁锂的工艺" });
    expect(matchesFilter(r, f, { operator: "contains", value: "铁锂" })).toBe(true);
    expect(matchesFilter(r, f, { operator: "is", value: "磷酸铁锂的工艺" })).toBe(true);
    expect(matchesFilter(r, f, { operator: "isNot", value: "别的" })).toBe(true);
  });

  it("数字：大于 / 小于 / 等于", () => {
    const f = field("number");
    const r = rec({ f1: 10 });
    expect(matchesFilter(r, f, { operator: "gt", value: 5 })).toBe(true);
    expect(matchesFilter(r, f, { operator: "lt", value: 5 })).toBe(false);
    expect(matchesFilter(r, f, { operator: "is", value: 10 })).toBe(true);
  });

  it("日期：早于 / 晚于 / 同一天", () => {
    const f = field("date");
    const r = rec({ f1: Date.parse("2026-11-12T10:00:00") });
    expect(matchesFilter(r, f, { operator: "is", value: Date.parse("2026-11-12T23:00:00") })).toBe(true);
    expect(matchesFilter(r, f, { operator: "before", value: Date.parse("2026-11-13") })).toBe(true);
    expect(matchesFilter(r, f, { operator: "after", value: Date.parse("2026-11-13") })).toBe(false);
  });

  it("勾选：按真假匹配", () => {
    const f = field("checkbox");
    expect(matchesFilter(rec({ f1: true }), f, { operator: "is", value: true })).toBe(true);
    expect(matchesFilter(rec({ f1: false }), f, { operator: "is", value: true })).toBe(false);
  });

  it("空值判断", () => {
    const f = field("text");
    expect(matchesFilter(rec({}), f, { operator: "isEmpty" })).toBe(true);
    expect(matchesFilter(rec({ f1: "  " }), f, { operator: "isEmpty" })).toBe(true);
    expect(matchesFilter(rec({ f1: "x" }), f, { operator: "isNotEmpty" })).toBe(true);
  });

  it("多选：是否包含某个选项", () => {
    const f = field("multiSelect");
    const r = rec({ f1: ["a", "b"] });
    expect(matchesFilter(r, f, { operator: "is", value: "a" })).toBe(true);
    expect(matchesFilter(r, f, { operator: "is", value: "c" })).toBe(false);
    expect(matchesFilter(r, f, { operator: "isNot", value: "c" })).toBe(true);
  });
});

describe("排序", () => {
  it("中文按拼音排（不是按内部编码瞎排）", () => {
    const f = field("text");
    const a = rec({ f1: "磷" }, "a");
    const b = rec({ f1: "正" }, "b");
    // 拼音 ling < zheng
    expect(compareByField(a, b, f) < 0).toBe(true);
  });

  it("数字按数值排", () => {
    const f = field("number");
    expect(compareByField(rec({ f1: 2 }), rec({ f1: 10 }), f) < 0).toBe(true);
  });

  it("空值永远排最后（不管升序降序都别把空行夹在中间）", () => {
    const f = field("number");
    expect(compareByField(rec({}), rec({ f1: 1 }), f)).toBe(1);
  });
});

describe("视图应用（筛选 + 排序）", () => {
  const setup = () => {
    const c = makeCollection("测试表");
    const title = c.fields[0];
    const status = c.fields[1];
    const rows = [
      makeRecord(c.id, { [title.id]: "磷矿", [status.id]: status.options![0].id }),
      makeRecord(c.id, { [title.id]: "正极材料", [status.id]: status.options![1].id }),
      makeRecord(c.id, { [title.id]: "别的", [status.id]: status.options![2].id }),
    ];
    return { c, title, status, rows };
  };

  it("无条件时原样返回", () => {
    const { c, rows } = setup();
    expect(applyView(rows, c, makeView())).toHaveLength(3);
  });

  it("AND：所有条件都要满足", () => {
    const { c, title, status, rows } = setup();
    const view = {
      ...makeView(),
      filterOp: "and" as const,
      filters: [
        { id: "x", fieldId: title.id, operator: "contains" as const, value: "材料" },
        { id: "y", fieldId: status.id, operator: "is" as const, value: status.options![1].id },
      ],
    };
    const out = applyView(rows, c, view);
    expect(out).toHaveLength(1);
    expect(out[0].values[title.id]).toBe("正极材料");
  });

  it("OR：任一条件满足即可", () => {
    const { c, title, rows } = setup();
    const view = {
      ...makeView(),
      filterOp: "or" as const,
      filters: [
        { id: "x", fieldId: title.id, operator: "contains" as const, value: "磷" },
        { id: "y", fieldId: title.id, operator: "is" as const, value: "别的" },
      ],
    };
    expect(applyView(rows, c, view)).toHaveLength(2);
  });

  it("排序会改变返回顺序", () => {
    const { c, title, rows } = setup();
    const view = { ...makeView(), sorts: [{ fieldId: title.id, direction: "asc" as const }] };
    const out = applyView(rows, c, view);
    expect(out.map((r) => r.values[title.id])).toEqual(["别的", "磷矿", "正极材料"]);
  });
});

describe("W62 公式求值", async () => {
  const { evaluateFormula } = await import("./collections");
  const get = (name: string) =>
    ({ 单价: 12.5, 数量: 4, 空: null } as Record<string, number | null>)[name] ?? null;

  it("四则与字段引用", () => {
    expect(evaluateFormula("{单价} * {数量}", get)).toBe(50);
    expect(evaluateFormula("({单价} + 1) / 2", get)).toBe(6.75);
    expect(evaluateFormula("-{数量} + 10", get)).toBe(6);
  });

  it("空字段按 0 处理；除零返回 0；非法表达式返回 null", () => {
    expect(evaluateFormula("{空} + 3", get)).toBe(3);
    expect(evaluateFormula("5 / 0", get)).toBe(0);
    expect(evaluateFormula("{单价} +", get)).toBeNull();
    expect(evaluateFormula("abc", get)).toBeNull();
  });
});

describe("W62 汇总计算", async () => {
  const { computeRollup, numericValueOf } = await import("./collections");
  const rows = [
    { id: "r1", values: { n: 3 } },
    { id: "r2", values: { n: 4.5 } },
    { id: "r3", values: { n: "2" } },
  ];

  it("计数 = 关联记录数", () => {
    expect(computeRollup({ sourceIds: ["r1", "r2", "r3"], rows, op: "count" })).toBe(3);
  });

  it("求和 = 目标字段数值相加（字符串数字也算）", () => {
    expect(computeRollup({ sourceIds: ["r1", "r2", "r3"], rows, op: "sum", targetFieldId: "n" })).toBe(9.5);
  });

  it("缺失记录/缺目标字段不报错", () => {
    expect(computeRollup({ sourceIds: ["r1", "zz"], rows, op: "sum", targetFieldId: "n" })).toBe(3);
    expect(computeRollup({ sourceIds: ["r1"], rows, op: "sum" })).toBe(0);
    expect(numericValueOf({ x: "abc" }, "x")).toBeNull();
  });
});
