import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { CollectionRow, FieldDef, FieldType, RecordRow, ViewDef } from "../data/db";
import { OPTION_COLORS } from "../data/db";
import {
  applyView,
  groupRecords,
  summarizeRecords,
  asChecked,
  asDateMs,
  evaluateFormula,
  computeRollup,
  numericValueOf,
  asFiles,
  asNumber,
  asStringList,
  asText,
  DEFAULT_COL_WIDTH,
  FIELD_TYPE_LABEL,
  operatorsFor,
  TITLE_COL_WIDTH,
} from "../data/collections";
import { CLIP_COLLECTION_NAME, useStore } from "../data/store";
import { uploadAsset } from "../data/assets";
import { clipReadState, isClipUnread } from "../data/clipBox";
import {
  countClipStatuses,
  filterClipRecords,
  type ClipInboxFilter,
} from "../data/clipInbox";
import { AppIcon } from "../design/icons";
import { useLang } from "../i18n";
import { AiBatchDialog } from "./AiBatchDialog";
import { ViewBar } from "./ViewBar";
import { KanbanView } from "./KanbanView";
import { GalleryView } from "./GalleryView";
import { CatalogView } from "./CatalogView";
import { TimelineView } from "./TimelineView";
import { CalendarView } from "./CalendarView";

/** 按字段类型渲染只读值 */
function recordTitle(collection: CollectionRow | undefined, record: RecordRow): string {
  const first = collection?.fields.find((f) => f.type === "text");
  const t = first ? asText(record.values[first.id]) : "";
  return t || "无标题记录";
}

function CellValue({ field, record, collection }: { field: FieldDef; record: RecordRow; collection: CollectionRow }) {
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
    if (!ms) return <span />;
    const d = new Date(ms);
    // W61：按字段显示格式（仅日期 / 日期+时间）
    return (
      <span>
        {field.dateFormat === "datetime"
          ? d.toLocaleString("zh-CN", { hour12: false })
          : d.toLocaleDateString("zh-CN")}
      </span>
    );
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
  // W61 新类型（只读派生 + 人员 + 文件媒体）
  if (field.type === "createdTime") {
    const ms = record.createdAt;
    if (!ms) return <span className="cell-empty" />;
    const d = new Date(ms);
    const s =
      field.dateFormat === "datetime"
        ? d.toLocaleString("zh-CN", { hour12: false })
        : d.toLocaleDateString("zh-CN");
    return <span className="cell-derive">{s}</span>;
  }

  if (field.type === "createdBy") {
    return <span className="cell-derive">本地用户</span>;
  }

  if (field.type === "person") {
    const name = asText(v);
    if (!name) return <span className="cell-empty" />;
    return (
      <span className="cell-person">
        <span className="cell-person__avatar">{name.slice(0, 1)}</span>
        {name}
      </span>
    );
  }

  if (field.type === "files") {
    const list = asFiles(v);
    if (list.length === 0) return <span className="cell-empty" />;
    return (
      <span className="pill-row">
        {list.map((f) => (
          <span key={f.assetId} className="pill pill--file" title={f.name}>
            📎 {f.name}
          </span>
        ))}
      </span>
    );
  }

  // W62 高级型：关联 / 汇总 / 公式
  const collections = useStore((s) => s.collections);
  const recordsMap = useStore((s) => s.records);
  const ensureRecords = useStore((s) => s.ensureRecords);
  const relCol = field.relationCollectionId
    ? collections.find((c) => c.id === field.relationCollectionId)
    : undefined;

  useEffect(() => {
    if (relCol) void ensureRecords(relCol.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relCol?.id]);

  if (field.type === "relation") {
    const ids = asStringList(v);
    if (ids.length === 0) return <span className="cell-empty" />;
    const rows = recordsMap[relCol?.id ?? ""] ?? [];
    return (
      <span className="pill-row">
        {ids.map((id) => {
          const r = rows.find((x) => x.id === id);
          return (
            <span key={id} className="pill" title={r ? recordTitle(relCol, r) : "记录已不存在"}>
              🔗 {r ? recordTitle(relCol, r) : "已删除"}
            </span>
          );
        })}
      </span>
    );
  }

  if (field.type === "rollup") {
    const srcIds = asStringList(record.values[field.rollupSourceFieldId ?? ""]);
    const rows = recordsMap[relCol?.id ?? ""] ?? [];
    const total = computeRollup({
      sourceIds: srcIds,
      rows,
      op: field.rollupOp ?? "count",
      targetFieldId: field.rollupTargetFieldId,
    });
    return <span>{total}</span>;
  }

  if (field.type === "formula") {
    const expr = field.formula ?? "";
    if (!expr.trim()) return <span className="cell-empty" />;
    const result = evaluateFormula(expr, (name) => {
      const f = collection.fields.find((x) => x.name === name);
      return f ? numericValueOf(record.values, f.id) : null;
    });
    return <span className="cell-derive">{result === null ? "—" : String(Math.round(result * 100) / 100)}</span>;
  }

  return <span className={field.type === "text" ? "cell-title" : undefined}>{text}</span>;
}

/** 单元格编辑：表格里双击进入，记录详情页里常驻 */
export function CellEditor({
  field,
  record,
  collection,
  onCommit,
  mode = "inline",
}: {
  field: FieldDef;
  record: RecordRow;
  collection?: CollectionRow;
  onCommit: (value: unknown) => void;
  /** panel = 记录详情：下拉/日历先收起，点一下再展开（否则整页都是展开的选择器） */
  mode?: "inline" | "panel";
}) {
  const v = record.values[field.id];
  const [openEditor, setOpenEditor] = useState(false);

  if (
    mode === "panel" &&
    !openEditor &&
    (field.type === "select" || field.type === "multiSelect" || field.type === "date")
  ) {
    return (
      <button
        type="button"
        className="record__value-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpenEditor(true);
        }}
      >
        {collection ? <CellValue field={field} record={record} collection={collection} /> : <span />}
      </button>
    );
  }

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
      <SelectPanel
        field={field}
        collection={collection}
        value={asText(v)}
        multiple={false}
        onCommit={(value) => {
          onCommit(value);
          if (mode === "panel") setOpenEditor(false);
        }}
      />
    );
  }

  if (field.type === "multiSelect") {
    return (
      <SelectPanel
        field={field}
        collection={collection}
        value={asStringList(v)}
        multiple
        onCommit={(value) => {
          onCommit(value);
          if (mode === "panel") setOpenEditor(false);
        }}
      />
    );
  }

  if (field.type === "date") {
    return (
      <MonthCalendar
        ms={asDateMs(v)}
        onCommit={(value) => {
          onCommit(value);
          if (mode === "panel") setOpenEditor(false);
        }}
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

  // W62 高级型
  if (field.type === "formula" || field.type === "rollup") {
    return <span className="cell-derive">自动计算（只读）</span>;
  }

  if (field.type === "relation") {
    const ids = asStringList(v);
    const relCol = collection
      ? useStore.getState().collections.find((c) => c.id === field.relationCollectionId)
      : undefined;
    const rows = relCol ? useStore.getState().records[relCol.id] ?? [] : [];
    return (
      <div className="cell-relation" onClick={(e) => e.stopPropagation()}>
        {rows.length === 0 && <span className="cell-empty">先在关联表里建记录</span>}
        {rows.slice(0, 12).map((r) => {
          const checked = ids.includes(r.id);
          return (
            <label key={r.id} className="cell-relation__item">
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onCommit(checked ? ids.filter((x) => x !== r.id) : [...ids, r.id])
                }
              />
              {recordTitle(relCol, r)}
            </label>
          );
        })}
      </div>
    );
  }

  // W61 新类型编辑器
  if (field.type === "createdTime" || field.type === "createdBy") {
    return <span className="cell-derive">系统生成（只读）</span>;
  }

  if (field.type === "person") {
    return (
      <input
        className="cell-input"
        defaultValue={asText(v)}
        placeholder="填成员名"
        onBlur={(e) => onCommit(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  if (field.type === "files") {
    const list = asFiles(v);
    return (
      <div className="cell-files" onClick={(e) => e.stopPropagation()}>
        {list.map((f) => (
          <span key={f.assetId} className="cell-files__chip" title={f.name}>
            📎 {f.name}
            <button
              className="cell-files__x"
              onClick={() => onCommit(list.filter((x) => x.assetId !== f.assetId))}
              title="移除附件"
            >
              ×
            </button>
          </span>
        ))}
        <label className="cell-files__add">
          ＋ 上传
          <input
            type="file"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const { assetId } = await uploadAsset(file, null, "record");
              onCommit([...list, { assetId, name: file.name }]);
            }}
          />
        </label>
      </div>
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
  viewId,
  frozenFieldIds,
  onClose,
}: {
  collection: CollectionRow;
  field: FieldDef;
  viewId: string;
  frozenFieldIds: string[];
  onClose: () => void;
}) {
  const updateField = useStore((s) => s.updateField);
  const removeField = useStore((s) => s.removeField);
  const updateView = useStore((s) => s.updateView);
  const insertFieldAt = useStore((s) => s.insertFieldAt);
  const duplicateField = useStore((s) => s.duplicateField);
  const collections = useStore((s) => s.collections);
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
          /* 点外面会先触发菜单的 mousedown 关闭 → 输入框被卸载 → blur 不触发，
             改名就丢了。所以这里 onChange 也提交一次（onBlur 保留，处理按回车不改的情况）。 */
          onChange={(e) => updateField(collection.id, field.id, { name: e.target.value || "未命名" })}
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

      {/* W61：日期显示格式（04 §2 记录页属性菜单里的「日期格式」，这里先在列头提供） */}
      {field.type === "date" && (
        <div className="col-menu__section">
          <label className="col-menu__label">日期格式</label>
          <select
            className="cell-input"
            value={field.dateFormat ?? "date"}
            onChange={(e) =>
              updateField(collection.id, field.id, { dateFormat: e.target.value as "date" | "datetime" })
            }
          >
            <option value="date">仅日期</option>
            <option value="datetime">日期 + 时间</option>
          </select>
        </div>
      )}

      {/* W61：04 §2「编辑属性面板带升序/降序」——按此字段排序的快捷入口 */}
      <div className="col-menu__section">
        <label className="col-menu__label">排序</label>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="menu-item"
            onClick={() => {
              const v = collection.views[0];
              if (v) updateView(collection.id, v.id, { sorts: [{ fieldId: field.id, direction: "asc" }] });
            }}
          >
            升序
          </button>
          <button
            className="menu-item"
            onClick={() => {
              const v = collection.views[0];
              if (v) updateView(collection.id, v.id, { sorts: [{ fieldId: field.id, direction: "desc" }] });
            }}
          >
            降序
          </button>
        </div>
      </div>

      {/* W62 关联：选目标表 */}
      {field.type === "relation" && (
        <div className="col-menu__section">
          <label className="col-menu__label">关联表</label>
          <select
            className="cell-input"
            value={field.relationCollectionId ?? ""}
            onChange={(e) => updateField(collection.id, field.id, { relationCollectionId: e.target.value || undefined })}
          >
            <option value="">选择表…</option>
            {collections.filter((c) => c.id !== collection.id).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* W62 汇总：来源关联字段 / 目标字段 / 运算 */}
      {field.type === "rollup" && (
        <div className="col-menu__section">
          <label className="col-menu__label">汇总</label>
          <select
            className="cell-input"
            value={field.rollupSourceFieldId ?? ""}
            onChange={(e) => updateField(collection.id, field.id, { rollupSourceFieldId: e.target.value || undefined })}
          >
            <option value="">来源关联字段…</option>
            {collection.fields.filter((f) => f.type === "relation").map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <select
            className="cell-input"
            value={field.rollupOp ?? "count"}
            onChange={(e) => updateField(collection.id, field.id, { rollupOp: e.target.value as "count" | "sum" })}
          >
            <option value="count">计数</option>
            <option value="sum">求和</option>
          </select>
        </div>
      )}

      {/* W62 公式：写 {字段名} 表达式 */}
      {field.type === "formula" && (
        <div className="col-menu__section">
          <label className="col-menu__label">{"公式（如 {单价} * {数量}）"}</label>
          <input
            className="cell-input"
            defaultValue={field.formula ?? ""}
            placeholder={"{单价} * {数量}"}
            onBlur={(e) => updateField(collection.id, field.id, { formula: e.target.value })}
          />
        </div>
      )}


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
      {/* W66：04 §3 列头菜单 11 项的其余项 */}
      <button
        className="menu-item"
        onClick={() => {
          const idx = collection.fields.findIndex((f) => f.id === field.id);
          void insertFieldAt(collection.id, "text", idx);
          onClose();
        }}
      >
        在左侧插入
      </button>
      <button
        className="menu-item"
        onClick={() => {
          const idx = collection.fields.findIndex((f) => f.id === field.id);
          void insertFieldAt(collection.id, "text", idx + 1);
          onClose();
        }}
      >
        在右侧插入
      </button>
      <button
        className="menu-item"
        onClick={() => {
          const v = collection.views[0];
          if (v) {
            const op = operatorsFor(field.type)[0];
            updateView(collection.id, v.id, {
              filters: [...v.filters, { id: crypto.randomUUID(), fieldId: field.id, operator: op }],
            });
          }
          onClose();
        }}
      >
        筛选
      </button>
      <button
        className="menu-item"
        onClick={() => {
          updateField(collection.id, field.id, { hidden: true });
          onClose();
        }}
      >
        隐藏
      </button>
      {/* W66 补齐：冻结/解冻列（作用于当前视图）。td sticky 用真实浏览器点验兜底 */}
      <button
        className="menu-item"
        onClick={() => {
          const frozen = frozenFieldIds.includes(field.id);
          const next = frozen ? frozenFieldIds.filter((id) => id !== field.id) : [...frozenFieldIds, field.id];
          updateView(collection.id, viewId, { frozenFieldIds: next });
        }}
      >
        {frozenFieldIds.includes(field.id) ? "取消冻结列" : "冻结列"}
      </button>

      <button
        className="menu-item"
        onClick={() => {
          void duplicateField(collection.id, field.id);
          onClose();
        }}
      >
        拷贝副本
      </button>
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
  // W64 单元格语义：单击选中（蓝框）/ 双击编辑；ESC 取消选中与编辑（取消时不吃掉本次提交）
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const cancelCommitRef = useRef(false);
  // W64：ESC 取消编辑（不吃掉本次提交）或取消选中
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editingCell) {
        cancelCommitRef.current = true;
        setEditingCell(null);
        window.setTimeout(() => {
          cancelCommitRef.current = false;
        }, 0);
      } else {
        setSelectedCell(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingCell]);

  const [menuFieldId, setMenuFieldId] = useState<string | null>(null);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  /**
   * 拖列宽时先只改这里的临时值，松手才写库。
   * 如果 pointermove 里直接 updateField，每移动 1px 就往 IndexedDB 写一次整张表。
   */
  const [drag, setDrag] = useState<{ id: string; width: number } | null>(null);
  const { t } = useLang();
  // W120 收集箱页：状态页签 + 本地搜索（只影响当前页，不写视图筛选）
  const [clipFilter, setClipFilter] = useState<ClipInboxFilter>("all");
  const [clipQuery, setClipQuery] = useState("");
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

  // W68：按 store 里记录的当前视图取 view；没有则用第一个
  const activeViewId = useStore((s) => (collection ? s.activeViewByCollection[collection.id] : undefined));
  const setActiveView = useStore((s) => s.setActiveView);
  const addView = useStore((s) => s.addView);
  const removeView = useStore((s) => s.removeView);
  const view = collection
    ? (collection.views.find((v) => v.id === activeViewId) ?? collection.views[0])
    : undefined;
  const isClipInbox = collection?.name === CLIP_COLLECTION_NAME;
  const clipCounts = useMemo(
    () =>
      collection && isClipInbox
        ? countClipStatuses(collection, records)
        : { all: 0, pending: 0, archived: 0, failed: 0 },
    [collection, records, isClipInbox],
  );
  // 收集箱的页签/搜索先过滤，再交给通用视图逻辑（排序/分组/每页大小仍生效）
  const inboxRecords = useMemo(
    () =>
      collection && isClipInbox
        ? filterClipRecords(collection, records, clipFilter, clipQuery)
        : records,
    [collection, records, isClipInbox, clipFilter, clipQuery],
  );
  const rows = useMemo(
    () => {
      if (!collection) return [];
      const all = applyView(inboxRecords, collection, view);
      // W69 每页大小（未设置时按 50 条，规格默认）
      const size = view?.pageSize ?? 50;
      return all.slice(0, size);
    },
    [collection, inboxRecords, view]
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
  // W66：隐藏列不进网格；冻结列（首列恒冻结）按累计宽度给出 sticky left
  const visibleFields = collection.fields.filter((f) => !f.hidden);
  const frozenIds = view?.frozenFieldIds ?? [];
  const frozenLeft = new Map<string, number>();
  {
    let left = 66; // No. 列宽
    for (const f of visibleFields) {
      const isFrozen = f.id === visibleFields[0]?.id || frozenIds.includes(f.id);
      if (!isFrozen) continue;
      frozenLeft.set(f.id, left);
      left += widthOf(f);
    }
  }

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
        <button
          className="btn"
          onClick={async () => {
            // W76（04 §6）：「创建」直接新建一条记录并打开记录页（不是菜单）
            const id = await addRecord(collection.id);
            openRecord(collection.id, id);
          }}
        >
          ＋ {t("newRecord")}
        </button>
        {collection.name === CLIP_COLLECTION_NAME && (
          <button className="btn" onClick={() => setBatchOpen(true)}>
            AI 总结
          </button>
        )}
      </div>

      {isClipInbox && (
        <div className="clipinbox" data-testid="clip-inbox">
          <div className="clipinbox__tabs" role="tablist" aria-label={t("clipInboxTitle")}>
            {([
              ["all", t("clipInboxAll"), clipCounts.all],
              ["pending", t("clipInboxPending"), clipCounts.pending],
              ["archived", t("clipInboxArchived"), clipCounts.archived],
              ["failed", t("clipInboxFailed"), clipCounts.failed],
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                role="tab"
                aria-selected={clipFilter === key}
                className={`clipinbox__tab${clipFilter === key ? " clipinbox__tab--active" : ""}`}
                onClick={() => setClipFilter(key)}
              >
                {label}
                <span className="clipinbox__count">{count}</span>
              </button>
            ))}
          </div>
          <label className="clipinbox__search">
            <AppIcon name="search" set={iconSet} size={13} />
            <input
              value={clipQuery}
              onChange={(e) => setClipQuery(e.target.value)}
              placeholder={t("clipInboxSearch")}
            />
          </label>
        </div>
      )}

      {view && <ViewTabs collection={collection} view={view} />}
      {view && <ViewBar collection={collection} view={view} />}

      {view?.type === "kanban" ? (
        <KanbanView collection={collection} view={view} rows={rows} />
      ) : view?.type === "gallery" ? (
        <GalleryView collection={collection} view={view} rows={rows} />
      ) : view?.type === "catalog" ? (
        <CatalogView collection={collection} view={view} rows={rows} />
      ) : view?.type === "timeline" ? (
        <TimelineView collection={collection} view={view} rows={rows} />
      ) : view?.type === "calendar" ? (
        <CalendarView collection={collection} view={view} rows={rows} />
      ) : (
      <div className="collection__scroll">
        <table className={`grid${view?.autoRowHeight ? " grid--auto-row" : ""}`} style={{ width: gridWidth, tableLayout: "fixed" }}>
          <thead>
            <tr>
              {view?.showIndex !== false && <th className="grid__idx grid__idx--head">#</th>}
              {visibleFields.map((f, colIdx) => (
                <th
                  className={frozenLeft.has(f.id) ? "grid__th--frozen" : undefined}
                  style={frozenLeft.has(f.id) ? { position: "sticky", left: frozenLeft.get(f.id), zIndex: 3, width: widthOf(f) } : { width: widthOf(f) }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenuFieldId(f.id);
                  }}
                  key={f.id}
                >
                  <div className="grid__th">
                    <button className="grid__th-btn" onClick={() => setMenuFieldId(f.id)} title="列设置">
                      <span className="grid__th-name">{f.name}</span>
                      <span className="grid__th-type">{FIELD_TYPE_LABEL[f.type]}</span>
                    </button>
                    {menuFieldId === f.id && (
                      <ColumnMenu
                        collection={collection}
                        field={f}
                        viewId={view?.id ?? collection.views[0]!.id}
                        frozenFieldIds={view?.frozenFieldIds ?? []}
                        onClose={() => setMenuFieldId(null)}
                      />
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
                {view?.showIndex !== false && (
                <td className="grid__idx">
                  {isClipUnread(collection, rec) ? <span className="unread-dot" title="未读" /> : i + 1}
                </td>
                )}
                {visibleFields.map((f, colIdx) => {
                  const key = `${rec.id}:${f.id}`;
                  const editing = editingCell === key;
                  return (
                    <td
                      key={f.id}
                      className={`grid__cell${frozenLeft.has(f.id) ? " grid__frozen" : ""}${
                        selectedCell === key ? " grid__cell--selected" : ""
                      }${editing ? " grid__cell--editing" : ""}`}
                      style={frozenLeft.has(f.id) ? { position: "sticky", left: frozenLeft.get(f.id) } : undefined}
                      onClick={(e) => {
                        // 单选/多选：单击直接开编辑面板（04 §3）；其它类型单击=选中
                        if (f.type === "select" || f.type === "multiSelect") {
                          e.stopPropagation();
                          cancelOpen();
                          setSelectedCell(key);
                          setEditingCell(key);
                          return;
                        }
                        setSelectedCell(key);
                      }}
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
                          collection={collection}
                          onCommit={(value) => {
                            if (cancelCommitRef.current) return;
                            setCell(collection.id, rec.id, f.id, value);
                            // 复选框/下拉不需要一直开着编辑态；多选例外（要连着勾多个）
                            if (f.type !== "multiSelect") {
                              setEditingCell(null);
                            }
                          }}
                        />
                      ) : (
                        <CellValue field={f} record={rec} collection={collection} />
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
                  {t(
                    !isClipInbox
                      ? "emptyRecords"
                      : clipQuery.trim()
                        ? "searchNoResult"
                        : clipFilter === "pending"
                          ? "clipInboxEmptyPending"
                          : clipFilter === "archived"
                            ? "clipInboxEmptyArchived"
                            : clipFilter === "failed"
                              ? "clipInboxEmptyFailed"
                              : "clipInboxEmpty"
                  )}
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
      )}


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


/** W65 单选/多选编辑面板：已选 chips + 「选择或创建一个选项」+ 选项列表（04 §3） */
function SelectPanel({
  field,
  collection,
  value,
  multiple,
  onCommit,
}: {
  field: FieldDef;
  collection?: CollectionRow;
  value: string | string[];
  multiple: boolean;
  onCommit: (v: unknown) => void;
}) {
  const updateField = useStore((s) => s.updateField);
  const [q, setQ] = useState("");
  const chosen = new Set(multiple ? (value as string[]) : value ? [value as string] : []);
  const options = field.options ?? [];
  const filtered = options.filter((o) => !q.trim() || o.name.toLowerCase().includes(q.trim().toLowerCase()));

  const toggle = (id: string) => {
    if (!multiple) {
      onCommit(id);
      return;
    }
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onCommit([...next]);
  };

  const createOption = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || !collection) return;
    const palette = Object.keys(OPTION_COLORS);
    const opt = {
      id: crypto.randomUUID(),
      name: trimmed,
      color: palette[options.length % palette.length],
    };
    updateField(collection.id, field.id, { options: [...options, opt] });
    toggle(opt.id);
    setQ("");
  };

  return (
    <div className="cell-select" onClick={(e) => e.stopPropagation()}>
      {chosen.size > 0 && (
        <div className="cell-select__chips">
          {[...chosen].map((id) => {
            const o = options.find((x) => x.id === id);
            if (!o) return null;
            return (
              <span key={id} className="cell-select__chip">
                {o.name}
                <button
                  className="cell-select__x"
                  onClick={() => toggle(id)}
                  title="移除"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      <input
        className="cell-select__input"
        value={q}
        placeholder="选择或创建一个选项"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (filtered.length > 0) toggle(filtered[0].id);
          else createOption(q);
        }}
      />
      <div className="cell-select__list">
        {filtered.map((o) => (
          <button
            key={o.id}
            className={`cell-select__opt${chosen.has(o.id) ? " cell-select__opt--on" : ""}`}
            onClick={() => toggle(o.id)}
          >
            {o.name}
            {chosen.has(o.id) && <span className="cell-select__check">✓</span>}
          </button>
        ))}
        {filtered.length === 0 && q.trim() !== "" && (
          <button className="cell-select__opt cell-select__opt--create" onClick={() => createOption(q)}>
            ＋ 创建「{q.trim()}」
          </button>
        )}
      </div>
    </div>
  );
}

/** W65 日期月历面板（04 §3：年月 + 星期表头 + 日期网格） */
function MonthCalendar({ ms, onCommit }: { ms: number | null; onCommit: (v: unknown) => void }) {
  const base = ms ? new Date(ms) : new Date();
  const [cursor, setCursor] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const firstDay = new Date(y, m, 1).getDay(); // 0=周日
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  // 一~日 打头（04 §3）：周日排到最后 → 映射 offset
  const offset = (firstDay + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="cell-cal" onClick={(e) => e.stopPropagation()}>
      <div className="cell-cal__head">
        <button className="cell-cal__nav" onClick={() => setCursor(new Date(y, m - 1, 1))}>
          ‹
        </button>
        <span className="cell-cal__title">
          {y}年{m + 1}月
        </span>
        <button className="cell-cal__nav" onClick={() => setCursor(new Date(y, m + 1, 1))}>
          ›
        </button>
      </div>
      <div className="cell-cal__week">
        {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
          <span key={w} className="cell-cal__wd">
            {w}
          </span>
        ))}
      </div>
      <div className="cell-cal__grid">
        {cells.map((d, i) =>
          d === null ? (
            <span key={`e${i}`} className="cell-cal__cell cell-cal__cell--empty" />
          ) : (
            <button
              key={d}
              className={`cell-cal__cell${
                ms && new Date(ms).getFullYear() === y && new Date(ms).getMonth() === m && new Date(ms).getDate() === d
                  ? " cell-cal__cell--on"
                  : ""
              }`}
              onClick={() => onCommit(Date.parse(`${y}-${pad(m + 1)}-${pad(d)}T00:00:00`))}
            >
              {d}
            </button>
          ),
        )}
      </div>
    </div>
  );
}


/** W68 视图标签栏（04 §1.2 桌面）：视图名 | ＋；当前项下划线；超 5 个显示「N 更多…」 */
function ViewTabs({ collection, view }: { collection: CollectionRow; view: ViewDef }) {
  const setActiveView = useStore((s) => s.setActiveView);
  const addView = useStore((s) => s.addView);
  const removeView = useStore((s) => s.removeView);
  const updateView = useStore((s) => s.updateView);
  const copyView = useStore((s) => s.copyView);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState("view");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const views = collection.views;
  const MAX = 5;
  const visible = views.length > MAX ? views.slice(0, MAX) : views;
  const hidden = views.length > MAX ? views.slice(MAX) : [];

  return (
    <>
      <div className="viewtabs">
        {visible.map((v) => (
          <div key={v.id} className={`viewtab${v.id === view.id ? " viewtab--on" : ""}`}>
            <button className="viewtab__name" onClick={() => setActiveView(collection.id, v.id)}>
              {v.name}
            </button>
            <button
              className="viewtab__menu"
              title="视图设置"
              onClick={() => setMenuFor(menuFor === v.id ? null : v.id)}
            >
              ⋯
            </button>
            {menuFor === v.id && (
              <div className="viewtab__pop">
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenuFor(null);
                    setTab("view");
                    setSettingsOpen(true);
                  }}
                >
                  视图设置
                </button>
                <button
                  className="menu-item menu-item--danger"
                  onClick={() => {
                    setMenuFor(null);
                    setConfirmDel(v.id);
                  }}
                >
                  删除视图
                </button>
              </div>
            )}
          </div>
        ))}
        {hidden.length > 0 && (
          <div className="viewtab viewtab--more">
            <button className="viewtab__name" onClick={() => setMoreOpen((o) => !o)}>
              {hidden.length} 更多…
            </button>
            {moreOpen && (
              <div className="viewtab__pop">
                {hidden.map((v) => (
                  <button
                    key={v.id}
                    className="menu-item"
                    onClick={() => {
                      setActiveView(collection.id, v.id);
                      setMoreOpen(false);
                    }}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button className="viewtab__add" title="新建视图" onClick={() => void addView(collection.id)}>
          ＋
        </button>
      </div>

      {settingsOpen && (
        <div className="confirm-mask" onMouseDown={() => setSettingsOpen(false)}>
          <div className="viewsettings" onMouseDown={(e) => e.stopPropagation()}>
            <div className="viewsettings__head">
              <span>视图设置</span>
              <button className="viewsettings__close" onClick={() => setSettingsOpen(false)}>
                ×
              </button>
            </div>
            <div className="viewsettings__tabs">
              {[
                ["view", "视图"],
                ["props", "属性"],
                ["filter", "筛选"],
                ["sort", "排序"],
                ["group", "分组"],
                ["child", "子记录"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={`viewsettings__tab${tab === id ? " viewsettings__tab--on" : ""}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="viewsettings__body">
              {tab === "view" ? (
                <>
                  <label className="vs-row">
                    <span>视图名称</span>
                    <input
                      className="cell-input"
                      defaultValue={view.name}
                      onBlur={(e) => updateView(collection.id, view.id, { name: e.target.value || view.name })}
                    />
                  </label>
                  <label className="vs-row">
                    <span>视图类型</span>
                    <select
                      className="cell-input"
                      value={view.type}
                      onChange={(e) => {
                        const type = e.target.value as ViewDef["type"];
                        const label =
                          type === "kanban"
                            ? "看板"
                            : type === "gallery"
                              ? "画廊"
                              : type === "catalog"
                                ? "目录"
                                : type === "timeline"
                                  ? "时间轴"
                                  : type === "calendar"
                                    ? "日历"
                                    : "表格";
                        const firstSelect = collection.fields.find((f) => f.type === "select");
                        updateView(collection.id, view.id, {
                          type,
                          name: label,
                          groupById:
                            type === "kanban" ? (view.groupById ?? firstSelect?.id ?? null) : view.groupById,
                        });
                      }}
                    >
                      <option value="table">表格</option>
                      <option value="kanban">看板</option>
                      <option value="gallery">画廊</option>
                      <option value="catalog">目录</option>
                      <option value="timeline">时间轴</option>
                      <option value="calendar">日历</option>
                    </select>
                  </label>
                  <label className="vs-row">
                    <span>自适应行高</span>
                    <input
                      type="checkbox"
                      checked={Boolean(view.autoRowHeight)}
                      onChange={(e) => updateView(collection.id, view.id, { autoRowHeight: e.target.checked })}
                    />
                  </label>
                  <label className="vs-row">
                    <span>显示序号</span>
                    <input
                      type="checkbox"
                      checked={view.showIndex !== false}
                      onChange={(e) => updateView(collection.id, view.id, { showIndex: e.target.checked })}
                    />
                  </label>
                  <label className="vs-row">
                    <span>每页大小</span>
                    <select
                      className="cell-input"
                      value={String(view.pageSize ?? 50)}
                      onChange={(e) => updateView(collection.id, view.id, { pageSize: Number(e.target.value) })}
                    >
                      {[10, 20, 30, 50, 100].map((n) => (
                        <option key={n} value={n}>
                          {n} 条
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="vs-row vs-row--muted" title="固定滑动加载（【暂定】）">
                    <span>加载方式</span>
                    <span>滑动加载</span>
                  </div>
                  <div className="vs-row vs-row--muted" title="待专项（【暂定】）">
                    <span>打开记录方式</span>
                    <span>整页打开</span>
                  </div>
                  <div className="vs-row vs-row--muted" title="待专项（【暂定】）">
                    <span>显示页面图标</span>
                    <span>待专项</span>
                  </div>
                  <button
                    className="menu-item"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(`${location.origin}${location.pathname}?view=${view.id}`)
                        .catch(() => {});
                    }}
                  >
                    复制引用视图链接
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => {
                      void copyView(collection.id, view.id);
                      setSettingsOpen(false);
                    }}
                  >
                    拷贝视图
                  </button>
                  <button
                    className="menu-item menu-item--danger"
                    onClick={() => {
                      setSettingsOpen(false);
                      setConfirmDel(view.id);
                    }}
                  >
                    删除视图
                  </button>
                </>
              ) : (
                <div className="vs-placeholder">
                  该页签内容待 W70 统一接入（筛选 / 排序 / 分组目前可在下方视图栏直接操作）
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="confirm-mask" onMouseDown={() => setConfirmDel(null)}>
          <div className="confirm" onMouseDown={(e) => e.stopPropagation()}>
            <div className="confirm__title">是否确认删除该视图？</div>
            <div className="confirm__actions">
              <button
                className="confirm__btn confirm__btn--danger"
                onClick={() => {
                  void removeView(collection.id, confirmDel);
                  setConfirmDel(null);
                }}
              >
                确定
              </button>
              <button className="confirm__btn" onClick={() => setConfirmDel(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
