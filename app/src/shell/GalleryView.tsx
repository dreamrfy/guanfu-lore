/**
 * 画廊视图（W72，04 §1.1 + 22 §3.5）
 *
 * 形态：卡片网格。卡片 = 封面区（16:9）+ 标题条（页面标题）；hover 有反馈。
 * 封面来源：取记录的「文件媒体」字段里第一张图片（mime 以 image/ 开头）；
 *           没有图片时给占位底色 + 图标（观复自有【暂定】，规格未取到空封面形态）。
 * 卡片宽 220（22 §组件规格 Gallery：卡片 220；封面 16:9）。
 */
import { useEffect, useMemo, useState } from "react";
import type { CollectionRow, RecordRow, ViewDef } from "../data/db";
import { asFiles, asText } from "../data/collections";
import { assetUrl } from "../data/assets";
import { useStore } from "../data/store";
import { AppIcon } from "../design/icons";

/** 取一条记录的封面图地址（第一张图片附件）；取不到返回 null */
function coverAssetId(collection: CollectionRow, rec: RecordRow): string | null {
  const fileField = collection.fields.find((f) => f.type === "files");
  if (!fileField) return null;
  for (const f of asFiles(rec.values[fileField.id])) {
    if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(f.name)) return f.assetId;
  }
  return null;
}

export function GalleryView({
  collection,
  view,
  rows,
}: {
  collection: CollectionRow;
  view: ViewDef;
  rows: RecordRow[];
}) {
  const openRecord = useStore((s) => s.openRecord);
  const [covers, setCovers] = useState<Record<string, string>>({});

  // 解析封面地址（assetUrl 是异步的，且带缓存，不能同步拿）
  const ids = useMemo(
    () => rows.map((r) => coverAssetId(collection, r)).filter((x): x is string => Boolean(x)),
    [collection, rows],
  );
  const idKey = ids.join(",");
  useEffect(() => {
    let alive = true;
    const want = idKey ? idKey.split(",") : [];
    for (const id of want) {
      if (covers[id]) continue;
      void assetUrl(id).then((u) => {
        if (alive && u) setCovers((s) => ({ ...s, [id]: u }));
      });
    }
    return () => {
      alive = false;
    };
  }, [idKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const titleField = collection.fields.find((f) => f.type === "text");
  const titleOf = (rec: RecordRow) => {
    const t = titleField ? asText(rec.values[titleField.id]) : "";
    return t || "无标题记录";
  };

  if (rows.length === 0) {
    return (
      <div className="gallery gallery--empty">
        <p>无记录，点击创建新记录，或调整视图筛选设置</p>
      </div>
    );
  }

  return (
    <div className="gallery" data-view={view.id}>
      {rows.map((rec) => {
        const cid = coverAssetId(collection, rec);
        const cover = cid ? covers[cid] : undefined;
        return (
          <article
            key={rec.id}
            className="gallery__card"
            title="打开记录"
            onClick={() => openRecord(collection.id, rec.id)}
          >
            <div className="gallery__cover">
              {cover ? (
                <img className="gallery__img" src={cover} alt="" />
              ) : (
                <div className="gallery__placeholder">
                  <AppIcon name="image" size={24} />
                </div>
              )}
            </div>
            <div className="gallery__title">{titleOf(rec)}</div>
          </article>
        );
      })}
    </div>
  );
}
