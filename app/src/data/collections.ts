/**
 * 多维表格的纯逻辑：建表、建字段、筛选、排序。
 *
 * 刻意与界面分开：这里不碰 DOM、不碰 React，方便单测。
 * 时间一律存成毫秒数（date 字段），排序/比较都在这一层统一。
 */
import {
  newId,
  type CollectionRow,
  type FieldDef,
  type FieldType,
  type FilterCondition,
  type RecordRow,
  type SortDef,
  type ViewDef,
} from "./db";

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "文本",
  number: "数字",
  select: "单选",
  multiSelect: "多选",
  date: "日期",
  checkbox: "勾选框",
  url: "网址",
  email: "邮箱",
  phone: "电话",
};

export const DEFAULT_COL_WIDTH = 180;
export const TITLE_COL_WIDTH = 260;

export function makeField(type: FieldType, name?: string): FieldDef {
  return {
    id: newId(),
    name: name ?? FIELD_TYPE_LABEL[type],
    type,
    ...(type === "select" || type === "multiSelect" ? { options: [] } : {}),
    width: type === "text" ? TITLE_COL_WIDTH : DEFAULT_COL_WIDTH,
  };
}

export function makeView(name = "表格"): ViewDef {
  return { id: newId(), name, type: "table", filterOp: "and", filters: [], sorts: [] };
}

/**
 * 新建表：默认给两个字段（标题 + 状态单选），照 FlowUs 新建表的样子。
 * 用户随时可以改。
 */
export function makeCollection(name = "新建表格"): CollectionRow {
  const now = Date.now();
  const title = makeField("text", "标题");
  const status: FieldDef = {
    ...makeField("select", "状态"),
    options: [
      { id: newId(), name: "未开始", color: "grey" },
      { id: newId(), name: "进行中", color: "blue" },
      { id: newId(), name: "已完成", color: "green" },
    ],
  };
  return {
    id: newId(),
    name,
    icon: "🗂️",
    fields: [title, status],
    views: [makeView()],
    createdAt: now,
    updatedAt: now,
  };
}

export function makeRecord(collectionId: string, values: Record<string, unknown> = {}): RecordRow {
  const now = Date.now();
  return { id: newId(), collectionId, values, createdAt: now, updatedAt: now };
}

/* ---------------- 取值归一化 ---------------- */

export function asText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function asDateMs(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

export function asChecked(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
}

export function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v === null || v === undefined || v === "") return [];
  return [String(v)];
}

/* ---------------- 筛选 ---------------- */

const CN_COLLATOR = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });

export function matchesFilter(record: RecordRow, field: FieldDef, cond: { operator: string; value?: unknown }): boolean {
  const raw = record.values[field.id];
  const op = cond.operator;

  if (op === "isEmpty") return isBlank(raw);
  if (op === "isNotEmpty") return !isBlank(raw);

  switch (field.type) {
    case "number": {
      const a = asNumber(raw);
      const b = asNumber(cond.value);
      if (a === null || b === null) return false;
      if (op === "is") return a === b;
      if (op === "gt") return a > b;
      if (op === "lt") return a < b;
      if (op === "gte") return a >= b;
      if (op === "lte") return a <= b;
      return false;
    }
    case "date": {
      const a = asDateMs(raw);
      const b = asDateMs(cond.value);
      if (a === null || b === null) return false;
      if (op === "is") return sameDay(a, b);
      if (op === "before") return a < b;
      if (op === "after") return a > b;
      return false;
    }
    case "checkbox": {
      return asChecked(raw) === Boolean(cond.value);
    }
    case "select": {
      const a = asText(raw);
      const b = asText(cond.value);
      if (op === "is") return a === b;
      if (op === "isNot") return a !== b;
      return false;
    }
    case "multiSelect": {
      const list = asStringList(raw);
      if (op === "is") return list.includes(asText(cond.value));
      if (op === "isNot") return !list.includes(asText(cond.value));
      return false;
    }
    default: {
      // 文本类：包含 / 等于 / 不等于（大小写不敏感，中文直接子串匹配）
      const a = asText(raw).toLowerCase();
      const b = asText(cond.value).toLowerCase();
      // 条件刚加上、值还没填（空串）时视为"这条条件还没生效"，
      // 否则一加条件整张表就变空，用户会以为数据丢了。
      if (op === "contains") return b === "" || a.includes(b);
      if (op === "is") return a === b;
      if (op === "isNot") return a !== b;
      return false;
    }
  }
}

function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/* ---------------- 排序 ---------------- */

export function compareByField(a: RecordRow, b: RecordRow, field: FieldDef): number {
  const va = a.values[field.id];
  const vb = b.values[field.id];

  switch (field.type) {
    case "number": {
      const na = asNumber(va);
      const nb = asNumber(vb);
      if (na === null && nb === null) return 0;
      if (na === null) return 1; // 空值永远排最后，别让用户看到一堆空行夹在中间
      if (nb === null) return -1;
      return na - nb;
    }
    case "date": {
      const da = asDateMs(va);
      const db = asDateMs(vb);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    }
    case "checkbox": {
      return Number(asChecked(va)) - Number(asChecked(vb));
    }
    case "multiSelect": {
      return CN_COLLATOR.compare(asStringList(va).join("、"), asStringList(vb).join("、"));
    }
    default:
      return CN_COLLATOR.compare(asText(va), asText(vb));
  }
}

/* ---------------- 把视图应用到记录上 ---------------- */

export function applyView(records: RecordRow[], collection: CollectionRow, view: ViewDef | undefined): RecordRow[] {
  let rows = records;

  if (view && view.filters.length > 0) {
    const byId = new Map(collection.fields.map((f) => [f.id, f]));
    rows = rows.filter((r) => {
      const checks = view.filters.map((c) => {
        const f = byId.get(c.fieldId);
        return f ? matchesFilter(r, f, c) : true;
      });
      return view.filterOp === "and" ? checks.every(Boolean) : checks.some(Boolean);
    });
  }

  if (view && view.sorts.length > 0) {
    const byId = new Map(collection.fields.map((f) => [f.id, f]));
    rows = [...rows].sort((a, b) => {
      for (const s of view.sorts) {
        const f = byId.get(s.fieldId);
        if (!f) continue;
        const c = compareByField(a, b, f);
        if (c !== 0) return s.direction === "asc" ? c : -c;
      }
      return 0;
    });
  }

  return rows;
}

/* ---------------- 分组（V01） ----------------
 *
 * 分组只是"展示层"：筛选、排序照旧先生效，groupRecords 在结果上把行分桶。
 * 组内保持传入顺序（= 排序结果），组间顺序：单选/多选按选项序、勾选框已勾在前、
 * 其余按中文序，（空）永远垫底。多选一条可以进多个组（同 Notion 语义）。
 */

export type RecordGroup = { key: string; label: string; records: RecordRow[] };

export function groupRecords(records: RecordRow[], field: FieldDef): RecordGroup[] {
  const EMPTY_KEY = "__empty";
  const EMPTY_LABEL = "（空）";
  const buckets = new Map<string, { key: string; label: string; records: RecordRow[] }>();
  const put = (key: string, label: string, rec: RecordRow) => {
    let b = buckets.get(key);
    if (!b) {
      b = { key, label, records: [] };
      buckets.set(key, b);
    }
    b.records.push(rec);
  };
  const optionById = new Map((field.options ?? []).map((o) => [o.id, o]));

  for (const rec of records) {
    const raw = rec.values[field.id];
    if (field.type === "select") {
      const opt = optionById.get(String(raw ?? ""));
      if (opt) put(opt.id, opt.name, rec);
      else if (!isBlank(raw)) put("x:" + asText(raw), asText(raw), rec); // 老数据可能存名字而非 id
      else put(EMPTY_KEY, EMPTY_LABEL, rec);
    } else if (field.type === "multiSelect") {
      const ids = asStringList(raw);
      if (ids.length === 0) put(EMPTY_KEY, EMPTY_LABEL, rec);
      else
        for (const id of ids) {
          const opt = optionById.get(id) ?? optionById.get(asText(id));
          put(opt ? opt.id : "x:" + id, opt ? opt.name : asText(id), rec);
        }
    } else if (field.type === "checkbox") {
      put(asChecked(raw) ? "1" : "0", asChecked(raw) ? "已勾选" : "未勾选", rec);
    } else if (field.type === "number") {
      const n = asNumber(raw);
      if (n === null) put(EMPTY_KEY, EMPTY_LABEL, rec);
      else put("n:" + n, String(n), rec);
    } else if (field.type === "date") {
      const ms = asDateMs(raw);
      if (ms === null) put(EMPTY_KEY, EMPTY_LABEL, rec);
      else {
        const d = new Date(ms);
        const label =
          d.getFullYear() +
          "-" +
          String(d.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(d.getDate()).padStart(2, "0");
        put("d:" + label, label, rec);
      }
    } else {
      const t = asText(raw);
      if (t.trim() === "") put(EMPTY_KEY, EMPTY_LABEL, rec);
      else put("t:" + t, t, rec);
    }
  }

  const optionCount = field.options?.length ?? 0;
  const orderOf = (key: string, label: string): number => {
    if (key === EMPTY_KEY) return Number.MAX_SAFE_INTEGER;
    if (field.type === "select" || field.type === "multiSelect") {
      const idx = (field.options ?? []).findIndex((o) => o.id === key || o.name === label);
      return idx === -1 ? optionCount : idx;
    }
    if (field.type === "checkbox") return key === "1" ? 0 : 1;
    return 0;
  };

  return [...buckets.values()].sort((a, b) => {
    const oa = orderOf(a.key, a.label);
    const ob = orderOf(b.key, b.label);
    if (oa !== ob) return oa - ob;
    if (oa !== Number.MAX_SAFE_INTEGER) return CN_COLLATOR.compare(a.label, b.label);
    return 0;
  });
}

/* ---------------- 筛选/排序的界面辅助 ----------------
 *
 * 界面只负责"摆控件"，哪些运算符对哪种字段有意义仍然由这里说了算。
 * 这样加控件时不会把「日期不能比大小」这种规则漏在界面层。
 */

export const OPERATOR_LABEL: Record<FilterCondition["operator"], string> = {
  contains: "包含",
  is: "等于",
  isNot: "不等于",
  isEmpty: "为空",
  isNotEmpty: "不为空",
  gt: "大于",
  lt: "小于",
  gte: "大于等于",
  lte: "小于等于",
  before: "早于",
  after: "晚于",
};

export function operatorsFor(type: FieldType): FilterCondition["operator"][] {
  switch (type) {
    case "number":
      return ["is", "gt", "lt", "gte", "lte", "isEmpty", "isNotEmpty"];
    case "date":
      return ["is", "before", "after", "isEmpty", "isNotEmpty"];
    case "select":
    case "multiSelect":
      return ["is", "isNot", "isEmpty", "isNotEmpty"];
    case "checkbox":
      return ["is"];
    default:
      return ["contains", "is", "isNot", "isEmpty", "isNotEmpty"];
  }
}

/** 这个运算符后面要不要填一个值 */
export function needsValue(op: FilterCondition["operator"]): boolean {
  return op !== "isEmpty" && op !== "isNotEmpty";
}

/** 新条件的默认值：按字段类型给一个能立刻成立的值，避免"加了条件却永远筛不出东西" */
export function defaultValueFor(field: FieldDef): unknown {
  switch (field.type) {
    case "number":
      return 0;
    case "date":
      return Date.now();
    case "checkbox":
      return true;
    case "select":
    case "multiSelect":
      return field.options?.[0]?.id ?? "";
    default:
      return "";
  }
}

/** 为新字段拼一条默认条件（字段没了/类型换了，调用方负责重建） */
export function makeFilter(field: FieldDef): FilterCondition {
  const operator = operatorsFor(field.type)[0];
  return {
    id: newId(),
    fieldId: field.id,
    operator,
    ...(needsValue(operator) ? { value: defaultValueFor(field) } : {}),
  };
}

export function makeSort(fieldId: string, direction: SortDef["direction"] = "asc"): SortDef {
  return { fieldId, direction };
}
