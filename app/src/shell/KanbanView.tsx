/**
 * 看板视图（W71，04 §1.1）
 *
 * 形态：按某个「单选」字段分组列；列头 = 组名 + 计数 + ⋯；卡片 = 页面标题；
 *       每列底部「创建记录」；卡片可拖到另一列（改该字段值）。
 * 观复落地：分组字段取 view.groupById（若是单选/多选），否则取第一个单选框字段；
 *           都没有时给引导（先去建一个单选属性）。
 */
import { useState } from "react";
import type { CollectionRow, RecordRow, ViewDef } from "../data/db";
import { asStringList, asText } from "../data/collections";
import { useStore } from "../data/store";
import { AppIcon } from "../design/icons";

export function KanbanView({
  collection,
  view,
  rows,
}: {
  collection: CollectionRow;
  view: ViewDef;
  rows: RecordRow[];
}) {
  const setCell = useStore((s) => s.setCell);
  const addRecord = useStore((s) => s.addRecord);
  const updateView = useStore((s) => s.updateView);
  const iconSet = useStore((s) => s.iconSet);
  const openRecord = useStore((s) => s.openRecord);
  const [dragId, setDragId] = useState<string | null>(null);

  const groupField =
    collection.fields.find((f) => f.id === view.groupById && (f.type === "select" || f.type === "multiSelect")) ??
    collection.fields.find((f) => f.type === "select");

  if (!groupField) {
    return (
      <div className="kanban kanban--empty">
        <p>看板需要先有一个「单选」字段作为分列依据。</p>
        <button className="btn" onClick={() => void addRecord(collection.id)}>
          先建一条记录
        </button>
      </div>
    );
  }

  // 看板按该字段分列：绑定时顺便把视图分组设上，切回表格时分组也一致
  const options = groupField.options ?? [];
  const columns = [
    ...options.map((o) => ({ id: o.id, label: o.name })),
    { id: "", label: "（空）" },
  ];
  const valueOf = (rec: RecordRow) =>
    groupField.type === "multiSelect" ? asStringList(rec.values[groupField.id])[0] ?? "" : asStringList(rec.values[groupField.id])[0] ?? asText(rec.values[groupField.id]);

  const putInto = (recId: string, colId: string) => {
    setCell(collection.id, recId, groupField.id, colId);
  };

  const titleOf = (rec: RecordRow) => {
    const t = collection.fields.find((f) => f.type === "text");
    return (t ? asText(rec.values[t.id]) : "") || "无标题";
  };

  return (
    <div className="kanban">
      {columns.map((col) => {
        const cards = rows.filter((r) => (valueOf(r) ?? "") === col.id);
        return (
          <div
            key={col.id || "__empty"}
            className="kanban__col"
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) putInto(dragId, col.id);
              setDragId(null);
            }}
          >
            <div className="kanban__head">
              <span className="kanban__name">{col.label}</span>
              <span className="kanban__count">{cards.length}</span>
              <button
                className="icon-btn kanban__menu"
                title="列设置"
                onClick={() => updateView(collection.id, view.id, { groupById: groupField.id })}
              >
                <AppIcon name="more" set={iconSet} size={13} />
              </button>
            </div>
            <div className="kanban__cards">
              {cards.map((rec) => (
                <div
                  key={rec.id}
                  className="kanban__card"
                  draggable
                  onDragStart={() => setDragId(rec.id)}
                  onDragEnd={() => setDragId(null)}
                  onClick={() => openRecord(collection.id, rec.id)}
                >
                  {titleOf(rec)}
                </div>
              ))}
              <button
                className="kanban__add"
                onClick={async () => {
                  await addRecord(collection.id);
                  const list = useStore.getState().records[collection.id] ?? [];
                  const last = list[list.length - 1];
                  if (last) putInto(last.id, col.id);
                }}
              >
                ＋ 创建记录
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}