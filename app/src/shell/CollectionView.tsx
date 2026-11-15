import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { CollectionRow, FieldDef, FieldType, RecordRow } from "../data/db";
import { OPTION_COLORS } from "../data/db";
import {
  applyView,
  groupRecords,
  summarizeRecords,
  asChecked,
  asDateMs,
  asNumber,
  asStringList,
  asText,
  DEFAULT_COL_WIDTH,
  FIELD_TYPE_LABEL,
  TITLE_COL_WIDTH,
} from "../data/collections";
import { CLIP_COLLECTION_NAME, useStore } from "../data/store";
import { clipReadState, isClipUnread } from "../data/clipBox";
import { AppIcon } from "../design/icons";
import { useLang } from "../i18n";
import { AiBatchDialog } from "./AiBatchDialog";
import { ViewBar } from "./ViewBar";

/** 按字段类型渲染只读值 */
function CellValue({ field, record }: { field: FieldDef; record: RecordRow }) {
  const v = record.values[field.id];

  if (field.type === "checkbox") {
    return <span className="cell-check">{asChecked(v) ? "✓" : ""}</span>;
  }

  if (field.type === "select") {
    const opt = field.options?.find((o) => o.id === v) ?? field.options?.find((o) => o.name === v);
    if (!opt) return <span className="cell-empty" />;
    const color = OPTION_COLORS[opt.color] ?? OPTION_COLORS.grey;
    return (
      <span className="pill" style={{ background: color.bg, color: color.fg }}>
        {opt.name}
      </span>
    );
  }

  if (field.type === "multiSelect") {
    const ids = asStringList(v);
    if (ids.length === 0) return <span className="cell-empty" />;
    return (
      <span className="pill-row">
        {ids.map((id) => {
          const opt = field.options?.find((o) => o.id === id) ?? field.options?.find((o) => o.name === id);
          if (!opt) return null;
          const color = OPTION_COLORS[opt.color] ?? OPTION_COLORS.grey;
          return (
            <span key={id} className="pill" style={{ background: color.bg, color: color.fg }}>
              {opt.name}
            </span>
          );
        })}
      </span>
    );
  }

  if (field.type === "date") {
    const ms = asDateMs(v);
    return <span>{ms ? new Date(ms).toLocaleDateString("zh-CN") : ""}</span>;
  }

  if (field.type === "number") {
    const n = asNumber(v);
    return <span>{n === null ? "" : String(n)}</span>;
  }

  const text = asText(v);
  if (field.type === "url" && text) {
    return (
      <a className="cell-link" href={text} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        {text}
      </a>
    );
  }
  // 第一列（文本）加粗一点，当作"标题列"
  return <span className={field.type === "text" ? "cell-title" : undefined}>{text}</span>;
}

/** 单元格编辑：表格里双击进入，记录详情页里常驻 */
export function CellEditor({
  field,
  record,
  onCommit,
}: {
  field: FieldDef;
  record: RecordRow;
  onCommit: (value: unknown) => void;
}) {
  const v = record.values[field.id];

  if (field.type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={asChecked(v)}
        onChange={(e) => onCommit(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        className="cell-input"
        value={asText(v)}
        onChange={(e) => onCommit(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      >
        <option value="">（空）</option>
        {(field.options ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "multiSelect") {
    const chosen = new Set(asStringList(v));
    return (
      <div className="cell-multi" onClick={(e) => e.stopPropagation()}>
        {(field.options ?? []).map((o) => (
          <label key={o.id} className="cell-multi__item">
            <input
              type="checkbox"
              checked={chosen.has(o.id)}
              onChange={(e) => {
                const next = new Set(chosen);
                if (e.target.checked) next.add(o.id);
                else next.delete(o.id);
                onCommit([...next]);
              }}
            />
            {o.name}
          </label>
        ))}
        {(field.options ?? []).length === 0 && <span className="cell-empty">先在列头里加选项</span>}
      </div>
    );
  }

  if (field.type === "date") {
    const ms = asDateMs(v);
    return (
      <input
        type="date"
        className="cell-input"
        value={ms ? new Date(ms).toISOString().slice(0, 10) : ""}
        onChange={(e) => onCommit(e.target.value ? Date.parse(e.target.value) : null)}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        className="cell-input"
        defaultValue={asText(v)}
        onBlur={(e) => onCommit(e.target.value === "" ? null : Number(e.target.value))}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <input
      className="cell-input"
      defaultValue={asText(v)}
      placeholder={field.type === "text" ? "空" : ""}
      onBlur={(e) => onCommit(e.target.value)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** 列头菜单：改名 / 改类型 / 加选项 / 删除 */
function ColumnMenu({
  collection,
  field,
  onClose,
}: {
  collection: CollectionRow;
  field: FieldDef;
  onClose: () => void;
}) {
  const updateField = useStore((s) => s.updateField);
  const removeField = useStore((s) => s.removeField);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  return (
    <div className="popover col-menu" ref={ref}>
      <div className="col-menu__section">
        <label className="col-menu__label">列名</label>
        <input
          className="cell-input"
          defaultValue={field.name}
          onBlur={(e) => updateField(collection.id, field.id, { name: e.target.value || "未命名" })}
        />
      </div>

      <div className="col-menu__section">
        <label className="col-menu__label">类型</label>
        <select
          className="cell-input"
          value={field.type}
          onChange={(e) => updateField(collection.id, field.id, { type: e.target.value as FieldType })}
        >
          {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
            <option key={t} value={t}>
              {FIELD_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      {(field.type === "select" || field.type === "multiSelect") && (
        <div className="col-menu__section">
          <label className="col-menu__label">选项</label>
          {(field.options ?? []).map((o) => (
            <div key={o.id} className="col-menu__option">
              <input
                className="cell-input"
                defaultValue={o.name}
                onBlur={(e) =>
                  updateField(collection.id, field.id, {
                    options: (field.options ?? []).map((x) => (x.id === o.id ? { ...x, name: e.target.value } : x)),
                  })
                }
              />
              <select
                className="cell-input col-menu__color"
                value={o.color}
                onChange={(e) =>
                  updateField(collection.id, field.id, {
                    options: (field.options ?? []).map((x) => (x.id === o.id ? { ...x, color: e.target.value } : x)),
                  })
                }
              >
                {Object.keys(OPTION_COLORS).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button
            className="menu-item"
            onClick={() =>
              updateField(collection.id, field.id, {
                options: [
                  ...(field.options ?? []),
                  { id: crypto.randomUUID(), name: `选项 ${(field.options?.length ?? 0) + 1}`, color: "grey" },
                ],
              })
            }
          >
            ＋ 添加选项
          </button>
        </div>
      )}

      <div className="menu-sep" />
      <button
        className="menu-item"
        onClick={() => {
          removeField(collection.id, field.id);
          onClose();
        }}
      >
        删除这一列
      </button>
    </div>
  );
}

/**
 * ⚠️ 空数组必须是**模块级常量**。
 * 之前写成 `useStore(s => s.records[id] ?? [])`，每次返回一个新数组，
 * zustand 会认为状态一直在变 → 无限重渲染 → 白屏（getSnapshot should be cached）。
 */
const EMPTY_RECORDS: RecordRow[] = [];

export function CollectionView({ collectionId }: { collectionId: string }) {
  const collection = useStore((s) => s.collections.find((c) => c.id === collectionId));
  const recordsMap = useStore((s) => s.records);
  const records = recordsMap[collectionId] ?? EMPTY_RECORDS;
  const iconSet = useStore((s) => s.iconSet);
  const renameCollection = useStore((s) => s.renameCollection);
  const addField = useStore((s) => s.addField);
  const addRecord = useStore((s) => s.addRecord);
  const setCell = useStore((s) => s.setCell);
  const removeRecord = useStore((s) => s.removeRecord);
  const ensureRecords = useStore((s) => s.ensureRecords);
  const updateField = useStore((s) => s.updateField);
  const openRecord = useStore((s) => s.openRecord);
  const openRecordRef = useStore((s) => s.openRecordRef);

  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [menuFieldId, setMenuFieldId] = useState<string | null>(null);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  /**
   * 拖列宽时先只改这里的临时值，松手才写库。
   * 如果 pointermove 里直接 updateField，每移动 1px 就往 IndexedDB 写一次整张表。
   */
  const [drag, setDrag] = useState<{ id: string; width: number } | null>(null);
  const { t } = useLang();
  /**
   * 单击行 = 打开记录详情，双击单元格 = 原地编辑。
   * 单击必须等 220ms 再开面板：否则双击的第一下就把面板打开、布局一挪，第二下就点偏了。
   */
  const openTimer = useRef<number | null>(null);

  const cancelOpen = () => {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  };

  useEffect(() => {
    void ensureRecords(collectionId);
  }, [collectionId, ensureRecords]);

  const view = collection?.views[0];
  const rows = useMemo(
    () => (collection ? applyView(records, collection, view) : []),
    [collection, records, view]
  );
  // 分组（V01）：筛选、排序照旧先生效，这里只在结果上分桶展示。
  // useMemo 必须在提前 return 之前调用（hook 顺序不能随 collection 有无而变化）。
  const groupField =
    view?.groupById ? collection?.fields.find((f) => f.id === view.groupById) : undefined;
  const groups = useMemo(() => (groupField ? groupRecords(rows, groupField) : null), [rows, groupField]);
  // 汇总（V02）：对筛选/排序后的行算列尾汇总，与分组无关（分组只改摆放，总量不变）
  const summaries = useMemo(
    () => (collection ? collection.fields.map((f) => summarizeRecords(rows, f)) : null),
    [collection, rows]
  );

  if (!collection) return <EmptyCollectionState />;

  const filtered = rows.length !== records.length;
  const widthOf = (f: FieldDef) => drag?.id === f.id ? drag.width : f.width ?? DEFAULT_COL_WIDTH;
  const gridWidth = 48 + collection.fields.reduce((sum, f) => sum + widthOf(f), 0) + 40;

  /** 拖动列头右边缘改列宽：移动时只更新本地状态，松手才落库 */
  const startResize = (e: ReactPointerEvent, f: FieldDef) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthOf(f);
    const move = (ev: PointerEvent) => {
      setDrag({ id: f.id, width: Math.max(80, startW + ev.clientX - startX) });
    };
    const up = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      setDrag(null);
      updateField(collection.id, f.id, { width: Math.max(80, startW + ev.clientX - startX) });
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  return (
    <div className="collection">
      <div className="collection__head">
        <span className="collection__icon">{collection.icon ?? "🗂️"}</span>
        <input
          className="collection__name"
          value={collection.name}
          onChange={(e) => renameCollection(collection.id, e.target.value)}
        />
        <span className="collection__count">
          {filtered ? `${rows.length} / ${records.length} 条` : `${records.length} 条`}
        </span>
        <button className="btn" onClick={() => void addRecord(collection.id)}>
          ＋ {t("newRecord")}
        </button>
        {collection.name === CLIP_COLLECTION_NAME && (
          <button className="btn" onClick={() => setBatchOpen(true)}>
            AI 总结
          </button>
        )}
      </div>

      {view && <ViewBar collection={collection} view={view} />}

      <div className="collection__scroll">
        <table className="grid" style={{ width: gridWidth, tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th className="grid__idx grid__idx--head">#</th>
              {collection.fields.map((f, colIdx) => (
                <th
                  key={f.id}
                  className={colIdx === 0 ? "grid__frozen" : undefined}
                  style={{ width: widthOf(f) }}
                >
                  <div className="grid__th">
                    <button className="grid__th-btn" onClick={() => setMenuFieldId(f.id)} title="列设置">
                      <span className="grid__th-name">{f.name}</span>
                      <span className="grid__th-type">{FIELD_TYPE_LABEL[f.type]}</span>
                    </button>
                    {menuFieldId === f.id && (
                      <ColumnMenu collection={collection} field={f} onClose={() => setMenuFieldId(null)} />
                    )}
                    <span
                      className="grid__resize"
                      title="拖动调整列宽（双击恢复默认）"
                      onPointerDown={(e) => startResize(e, f)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        updateField(collection.id, f.id, {
                          width: f.type === "text" ? TITLE_COL_WIDTH : DEFAULT_COL_WIDTH,
                        });
                      }}
                    />
                  </div>
                </th>
              ))}
              <th className="grid__add">
                <div style={{ position: "relative" }}>
                  <button className="icon-btn" title="添加列" onClick={() => setAddFieldOpen((v) => !v)}>
                    <AppIcon name="plus" set={iconSet} size={14} />
                  </button>
                  {addFieldOpen && (
                    <div className="popover" style={{ left: 0, right: "auto", top: 30 }}>
                      {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
                        <button
                          key={t}
                          className="menu-item"
                          onClick={() => {
                            void addField(collection.id, t);
                            setAddFieldOpen(false);
                          }}
                        >
                          {FIELD_TYPE_LABEL[t]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              // 行号语义：不分组用全局序；分组时在组内重新计
              const renderRow = (rec: RecordRow, i: number) => (
              <tr
                key={rec.id}
                className={
                  openRecordRef?.recordId === rec.id && openRecordRef.collectionId === collection.id
                    ? "grid__row--open"
                    : undefined
                }
                onClick={() => {
                  cancelOpen();
                  openTimer.current = window.setTimeout(() => {
                    openRecord(collection.id, rec.id);
                    // 收集箱语义：点开一条未读就顺手标已读（写库 + 进同步队列，走 setCell）
                    const st = clipReadState(collection);
                    if (st && isClipUnread(collection, rec)) {
                      setCell(collection.id, rec.id, st.fieldId, st.readId);
                    }
                  }, 220);
                }}
              >
                <td className="grid__idx">
                  {isClipUnread(collection, rec) ? <span className="unread-dot" title="未读" /> : i + 1}
                </td>
                {collection.fields.map((f, colIdx) => {
                  const key = `${rec.id}:${f.id}`;
                  const editing = editingCell === key;
                  return (
                    <td
                      key={f.id}
                      className={`grid__cell${colIdx === 0 ? " grid__frozen" : ""}`}
                      onDoubleClick={() => {
                        cancelOpen();
                        setEditingCell(key);
                      }}
                      title={editing ? "" : "双击编辑"}
                    >
                      {editing ? (
                        <CellEditor
                          field={f}
                          record={rec}
                          onCommit={(value) => {
                            setCell(collection.id, rec.id, f.id, value);
                            // 复选框/下拉不需要一直开着编辑态；多选例外（要连着勾多个）
                            if (f.type !== "multiSelect") {
                              setEditingCell(null);
                            }
                          }}
                        />
                      ) : (
                        <CellValue field={f} record={rec} />
                      )}
                    </td>
                  );
                })}
                <td className="grid__rowmenu">
                  <button
                    className="icon-btn"
                    title="删除这一行"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("删除这条记录？")) void removeRecord(collection.id, rec.id);
                    }}
                  >
                    <AppIcon name="trash" set={iconSet} size={13} />
                  </button>
                </td>
              </tr>
              );
              const items: ReactNode[] = [];
              if (groups) {
                for (const g of groups) {
                  items.push(
                    <tr key={"g:" + g.key} className="grid__group">
                      <td colSpan={collection.fields.length + 2} className="grid__group-cell">
                        {g.label}
                        <span className="grid__group-count">{g.records.length}</span>
                      </td>
                    </tr>
                  );
                  let n = 0;
                  for (const rec of g.records) items.push(renderRow(rec, n++));
                }
              } else {
                rows.forEach((rec, i) => items.push(renderRow(rec, i)));
              }
              return items;
            })()}
            {rows.length === 0 && (
              <tr>
                <td colSpan={collection.fields.length + 2} className="grid__empty">
                  {t("emptyRecords")}
                </td>
              </tr>
            )}
          </tbody>
          {summaries && summaries.some((s) => s) && (
            <tfoot>
              <tr>
                <td className="grid__foot" />
                {collection.fields.map((f, i) => (
                  <td key={f.id} className="grid__foot">
                    {summaries[i]?.label ?? ""}
                  </td>
                ))}
                <td className="grid__foot" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {batchOpen && (
        <AiBatchDialog collection={collection} records={records} onClose={() => setBatchOpen(false)} />
      )}
    </div>
  );
}

/** 表被删掉（或还没同步进来）时的占位 —— 单独小组件，好在早退分支里用语言上下文 */
function EmptyCollectionState() {
  const { t } = useLang();
  return <div className="empty-state">{t("tableGone")}</div>;
}
