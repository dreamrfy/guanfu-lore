/**
 * 目录视图（W73，04 §1.1 + 48 号观测）
 *
 * 形态：**纯标题列表**——每行 = 页面图标 + 标题，**行间一条分隔线**；
 *       无表头、无列、无卡片装饰；列表底部一行「＋ 创建记录」。
 * 观测依据：ops/观测/android/66-视图-目录（行高约 154px@1080 宽、标题在图标右侧、
 *          分隔线贯通、「创建记录」左对齐在列表末尾）。
 * 桌面端按 22 §3.5 List「行 40」用较紧凑的行高（观复自有【暂定】，桌面规格未取到）。
 */
import type { CollectionRow, RecordRow, ViewDef } from "../data/db";
import { asText } from "../data/collections";
import { useStore } from "../data/store";
import { AppIcon } from "../design/icons";

export function CatalogView({
  collection,
  view,
  rows,
}: {
  collection: CollectionRow;
  view: ViewDef;
  rows: RecordRow[];
}) {
  const openRecord = useStore((s) => s.openRecord);
  const addRecord = useStore((s) => s.addRecord);
  const iconSet = useStore((s) => s.iconSet);

  const titleField = collection.fields.find((f) => f.type === "text");
  const titleOf = (rec: RecordRow) => {
    const t = titleField ? asText(rec.values[titleField.id]) : "";
    return t || "无标题记录";
  };

  return (
    <div className="catalog" data-view={view.id}>
      <div className="catalog__list">
        {rows.map((rec) => (
          <div
            key={rec.id}
            className="catalog__row"
            title="打开记录"
            onClick={() => openRecord(collection.id, rec.id)}
          >
            <span className="catalog__icon">
              <AppIcon name="file" set={iconSet} size={16} />
            </span>
            <span className="catalog__title">{titleOf(rec)}</span>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="catalog__empty">无记录，点击创建新记录，或调整视图筛选设置</p>
        )}
      </div>
      <button className="catalog__add" onClick={() => void addRecord(collection.id)}>
        ＋ 创建记录
      </button>
    </div>
  );
}
