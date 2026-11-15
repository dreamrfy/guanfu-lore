import { useEffect, useRef, useState } from "react";
import type { CollectionRow, FieldDef, FilterCondition, ViewDef } from "../data/db";
import {
  defaultValueFor,
  makeFilter,
  makeSort,
  needsValue,
  OPERATOR_LABEL,
  operatorsFor,
} from "../data/collections";
import { useStore } from "../data/store";

/**
 * 多维表格的"视图栏"：筛选 + 排序的界面入口。
 *
 * 这里只做控件与取值转换；"某个运算符对某种字段有没有意义"由 collections.ts 决定，
 * 界面永远只从 operatorsFor(field.type) 里取选项，两边不会各说各话。
 * 所有改动都写回 view（updateView），立刻落库，不需要"应用"按钮。
 */

type PanelProps = {
  collection: CollectionRow;
  view: ViewDef;
  onClose: () => void;
};

/** 条件/排序里的字段下拉 */
function FieldSelect({
  fields,
  value,
  onChange,
  allowEmpty,
}: {
  fields: FieldDef[];
  value: string;
  onChange: (id: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <select className="cond__field" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">选择字段</option>}
      {fields.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );
}

/** 按字段类型给条件值一个合适的输入控件 */
function ValueInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "select" || field.type === "multiSelect") {
    return (
      <select className="cond__value" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        <option value="">（选择选项）</option>
        {(field.options ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "checkbox") {
    return (
      <select className="cond__value" value={String(Boolean(value))} onChange={(e) => onChange(e.target.value === "true")}>
        <option value="true">已勾选</option>
        <option value="false">未勾选</option>
      </select>
    );
  }

  if (field.type === "number") {
    return (
      <input
        className="cond__value"
        type="number"
        value={typeof value === "number" ? value : String(value ?? "")}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    );
  }

  if (field.type === "date") {
    const ms = typeof value === "number" ? value : Date.parse(String(value ?? ""));
    return (
      <input
        className="cond__value"
        type="date"
        value={Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : ""}
        onChange={(e) => onChange(e.target.value ? Date.parse(e.target.value) : "")}
      />
    );
  }

  return (
    <input
      className="cond__value"
      type="text"
      value={String(value ?? "")}
      placeholder="输入值"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function FilterPanel({ collection, view, onClose }: PanelProps) {
  const updateView = useStore((s) => s.updateView);
  const patch = (p: Partial<ViewDef>) => updateView(collection.id, view.id, p);
  const byId = new Map(collection.fields.map((f) => [f.id, f]));

  return (
    <div className="viewpop">
      <div className="viewpop__head">
        <span className="viewpop__title">筛选</span>
        <div className="seg">
          <button
            className={`seg__btn${view.filterOp === "and" ? " seg__btn--on" : ""}`}
            onClick={() => patch({ filterOp: "and" })}
          >
            满足全部
          </button>
          <button
            className={`seg__btn${view.filterOp === "or" ? " seg__btn--on" : ""}`}
            onClick={() => patch({ filterOp: "or" })}
          >
            满足任一
          </button>
        </div>
      </div>

      {view.filters.length === 0 && <div className="viewpop__empty">还没有筛选条件</div>}

      {view.filters.map((cond) => {
        const field = byId.get(cond.fieldId) ?? collection.fields[0];
        if (!field) return null;
        const ops = operatorsFor(field.type);
        return (
          <div className="cond" key={cond.id}>
            <FieldSelect
              fields={collection.fields}
              value={field.id}
              onChange={(id) => {
                const next = collection.fields.find((f) => f.id === id);
                if (next) {
                  // 换字段 = 换一套运算符和默认值，旧值没有意义
                  const fresh = makeFilter(next);
                  patch({ filters: view.filters.map((c) => (c.id === cond.id ? { ...fresh, id: cond.id } : c)) });
                }
              }}
            />
            <select
              className="cond__op"
              value={cond.operator}
              onChange={(e) => {
                const op = e.target.value as FilterCondition["operator"];
                patch({
                  filters: view.filters.map((c) =>
                    c.id === cond.id
                      ? {
                          ...c,
                          operator: op,
                          ...(needsValue(op)
                            ? { value: c.value ?? defaultValueFor(field) }
                            : { value: undefined }),
                        }
                      : c
                  ),
                });
              }}
            >
              {ops.map((op) => (
                <option key={op} value={op}>
                  {OPERATOR_LABEL[op]}
                </option>
              ))}
            </select>
            {needsValue(cond.operator) ? (
              <ValueInput
                field={field}
                value={cond.value}
                onChange={(v) =>
                  patch({ filters: view.filters.map((c) => (c.id === cond.id ? { ...c, value: v } : c)) })
                }
              />
            ) : (
              <span className="cond__spacer" />
            )}
            <button
              className="icon-btn"
              title="删除条件"
              onClick={() => patch({ filters: view.filters.filter((c) => c.id !== cond.id) })}
            >
              ×
            </button>
          </div>
        );
      })}

      <div className="viewpop__foot">
        <button
          className="btn btn--sm"
          disabled={collection.fields.length === 0}
          onClick={() => {
            const first = collection.fields[0];
            if (first) patch({ filters: [...view.filters, makeFilter(first)] });
          }}
        >
          ＋ 添加条件
        </button>
        {view.filters.length > 0 && (
          <button className="btn btn--sm" onClick={() => patch({ filters: [] })}>
            清空
          </button>
        )}
        <button className="icon-btn viewpop__close" title="收起" onClick={onClose}>
          ×
        </button>
      </div>
    </div>
  );
}

function SortPanel({ collection, view, onClose }: PanelProps) {
  const updateView = useStore((s) => s.updateView);
  const patch = (p: Partial<ViewDef>) => updateView(collection.id, view.id, p);
  const used = new Set(view.sorts.map((s) => s.fieldId));
  const nextFree = collection.fields.find((f) => !used.has(f.id));

  return (
    <div className="viewpop">
      <div className="viewpop__head">
        <span className="viewpop__title">排序</span>
        <span className="viewpop__hint">从上到下依次比较</span>
      </div>

      {view.sorts.length === 0 && <div className="viewpop__empty">还没有排序规则</div>}

      {view.sorts.map((sort, i) => {
        const field = collection.fields.find((f) => f.id === sort.fieldId);
        if (!field) return null;
        return (
          <div className="cond" key={`${sort.fieldId}:${i}`}>
            <FieldSelect
              fields={collection.fields}
              value={sort.fieldId}
              onChange={(id) =>
                patch({ sorts: view.sorts.map((s, j) => (j === i ? { ...s, fieldId: id } : s)) })
              }
            />
            <button
              className="btn btn--sm cond__dir"
              title="切换升降序"
              onClick={() =>
                patch({
                  sorts: view.sorts.map((s, j) =>
                    j === i ? { ...s, direction: s.direction === "asc" ? "desc" : "asc" } : s
                  ),
                })
              }
            >
              {sort.direction === "asc" ? "↑ 升序" : "↓ 降序"}
            </button>
            <span className="cond__spacer" />
            <button
              className="icon-btn"
              title="删除排序"
              onClick={() => patch({ sorts: view.sorts.filter((_, j) => j !== i) })}
            >
              ×
            </button>
          </div>
        );
      })}

      <div className="viewpop__foot">
        <button
          className="btn btn--sm"
          disabled={!nextFree}
          onClick={() => nextFree && patch({ sorts: [...view.sorts, makeSort(nextFree.id)] })}
        >
          ＋ 添加排序
        </button>
        {view.sorts.length > 0 && (
          <button className="btn btn--sm" onClick={() => patch({ sorts: [] })}>
            清空
          </button>
        )}
        <button className="icon-btn viewpop__close" title="收起" onClick={onClose}>
          ×
        </button>
      </div>
    </div>
  );
}

export function ViewBar({ collection, view }: { collection: CollectionRow; view: ViewDef }) {
  const [open, setOpen] = useState<"filter" | "sort" | "group" | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const activeCount = view.filters.length + view.sorts.length;

  return (
    <div className="viewbar" ref={ref}>
      <button
        className={`viewbar__btn${view.filters.length ? " viewbar__btn--on" : ""}`}
        onClick={() => setOpen((o) => (o === "filter" ? null : "filter"))}
      >
        筛选{view.filters.length ? ` · ${view.filters.length}` : ""}
      </button>
      <button
        className={`viewbar__btn${view.sorts.length ? " viewbar__btn--on" : ""}`}
        onClick={() => setOpen((o) => (o === "sort" ? null : "sort"))}
      >
        排序{view.sorts.length ? ` · ${view.sorts.length}` : ""}
      </button>
      <button
        className={`viewbar__btn${view.groupById ? " viewbar__btn--on" : ""}`}
        onClick={() => setOpen((o) => (o === "group" ? null : "group"))}
      >
        分组{view.groupById
          ? ` · ${(collection.fields.find((f) => f.id === view.groupById) ?? { name: "?" }).name}`
          : ""}
      </button>
      {activeCount > 0 && (
        <span className="viewbar__state">
          视图生效中：{view.filters.length ? `${view.filters.length} 个筛选` : "无筛选"}
          {view.sorts.length ? ` · ${view.sorts.length} 个排序` : ""}
        </span>
      )}

      {open === "filter" && (
        <FilterPanel collection={collection} view={view} onClose={() => setOpen(null)} />
      )}
      {open === "group" && <GroupPanel collection={collection} view={view} onClose={() => setOpen(null)} />}
      {open === "sort" && <SortPanel collection={collection} view={view} onClose={() => setOpen(null)} />}
    </div>
  );
}


/** 分组（V01）：选一个字段按它的值分桶展示；（空）垫底。与筛选/排序叠加共存 */
function GroupPanel({ collection, view }: PanelProps) {
  const updateView = useStore((s) => s.updateView);
  const patch = (p: Partial<ViewDef>) => updateView(collection.id, view.id, p);

  return (
    <div className="viewpop">
      <div className="viewpop__head">
        <span className="viewpop__title">分组</span>
        <span className="viewpop__hint">组头显示计数，组内保持排序</span>
      </div>

      <button
        className="btn btn--sm viewpop__choice"
        onClick={() => patch({ groupById: null })}
      >
        {view.groupById ? "" : "✓ "}不分组
      </button>
      {collection.fields.map((f) => (
        <button
          key={f.id}
          className="btn btn--sm viewpop__choice"
          onClick={() => patch({ groupById: f.id })}
        >
          {view.groupById === f.id ? "✓ " : ""}按「{f.name}」分组
        </button>
      ))}
    </div>
  );
}