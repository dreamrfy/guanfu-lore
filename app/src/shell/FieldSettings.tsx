/**
 * 属性编辑面板（W76「设置属性」）
 *
 * 04 §2 记的编辑属性面板（已有字段）带：改名 / 类型 / 日期格式 / 升序 / 降序 等。
 * 这里是记录页内联版本（面板开在属性名下面），桌面点属性名 →「设置属性」进来。
 */
import type { CollectionRow, FieldDef, FieldType } from "../data/db";
import { FIELD_TYPE_LABEL } from "../data/collections";
import { useStore } from "../data/store";

export function FieldSettings({
  collection,
  field,
  onClose,
}: {
  collection: CollectionRow;
  field: FieldDef;
  onClose: () => void;
}) {
  const updateField = useStore((s) => s.updateField);
  const updateView = useStore((s) => s.updateView);

  const sortBy = (direction: "asc" | "desc") => {
    const v = collection.views[0];
    if (v) updateView(collection.id, v.id, { sorts: [{ fieldId: field.id, direction }] });
    onClose();
  };

  return (
    <div className="popover prop-menu">
      <div className="col-menu__section">
        <label className="col-menu__label">属性名</label>
        <input
          className="cell-input"
          defaultValue={field.name}
          /* 点外面时菜单先卸载输入框、blur 不触发，所以 onChange 也提交一次 */
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

      <div className="menu-sep" />
      <button className="menu-item" onClick={() => sortBy("asc")}>
        升序
      </button>
      <button className="menu-item" onClick={() => sortBy("desc")}>
        降序
      </button>
      <div className="menu-sep" />
      <button className="menu-item" onClick={onClose}>
        完成
      </button>
    </div>
  );
}
