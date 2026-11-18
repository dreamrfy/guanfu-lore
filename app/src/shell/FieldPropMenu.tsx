/**
 * 记录页的「属性行菜单」（W76，04 §2 照录）
 *
 * 位置：记录页属性区，点**属性名字**（不是值）弹出。
 * 菜单项（照录规格）：更换类型 / 日期格式（仅日期类型专有）/ 设置属性 / 显示 / 拷贝副本 / 删除
 *
 * 说明：
 * - 「显示」= 隐藏该属性（数据保留）→ 复用 FieldDef.hidden（W66 列头菜单同语义）
 * - 「拷贝副本」= 复制一个同名同类型的新属性
 * - 「删除」= 删掉这个属性（数据一并去掉）
 * - 「设置属性」= 打开属性编辑面板（改名 / 类型 / 排序等，沿用列头菜单那套）
 */
import { useEffect, useRef } from "react";
import type { CollectionRow, FieldDef, FieldType } from "../data/db";
import { FIELD_TYPE_LABEL } from "../data/collections";
import { useStore } from "../data/store";

export function FieldPropMenu({
  collection,
  field,
  onClose,
  onOpenSettings,
}: {
  collection: CollectionRow;
  field: FieldDef;
  onClose: () => void;
  /** 「设置属性」→ 打开属性编辑面板 */
  onOpenSettings: () => void;
}) {
  const updateField = useStore((s) => s.updateField);
  const removeField = useStore((s) => s.removeField);
  const duplicateField = useStore((s) => s.duplicateField);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  return (
    <div className="popover prop-menu" ref={ref}>
      {/* 更换类型 */}
      <div className="col-menu__section">
        <label className="col-menu__label">更换类型</label>
        <select
          className="cell-input"
          value={field.type}
          onChange={(e) => {
            updateField(collection.id, field.id, { type: e.target.value as FieldType });
            onClose();
          }}
        >
          {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
            <option key={t} value={t}>
              {FIELD_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      {/* 日期格式（日期专有） */}
      {field.type === "date" && (
        <div className="col-menu__section">
          <label className="col-menu__label">日期格式</label>
          <select
            className="cell-input"
            value={field.dateFormat ?? "date"}
            onChange={(e) => {
              updateField(collection.id, field.id, { dateFormat: e.target.value as "date" | "datetime" });
              onClose();
            }}
          >
            <option value="date">仅日期</option>
            <option value="datetime">日期 + 时间</option>
          </select>
        </div>
      )}

      <div className="menu-sep" />

      <button
        className="menu-item"
        onClick={() => {
          onOpenSettings();
          onClose();
        }}
      >
        设置属性
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
        className="menu-item menu-item--danger"
        onClick={() => {
          removeField(collection.id, field.id);
          onClose();
        }}
      >
        删除
      </button>
    </div>
  );
}
