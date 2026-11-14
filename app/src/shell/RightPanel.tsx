import { useEffect, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { useStore, useActiveDoc } from "../data/store";
import { assetUrl } from "../data/assets";
import type { CollectionRow, PageRow, RecordRow } from "../data/db";
import { asText } from "../data/collections";
import { extractBlocksText } from "../data/search";
import { AppIcon } from "../design/icons";
import { PageEditor } from "../editor/PageEditor";
import { AiPanel } from "./AiPanel";
import { CellEditor } from "./CollectionView";

const fmt = (t: number) => new Date(t).toLocaleString("zh-CN", { hour12: false });

/** 统计页面里的纯文本字数（真实计算，不是假数） */
function countChars(blocks: unknown): number {
  let n = 0;
  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (typeof obj.text === "string") n += obj.text.length;
      if (Array.isArray(obj.content)) walk(obj.content);
      if (Array.isArray(obj.children)) walk(obj.children);
    }
  };
  walk(blocks);
  return n;
}

/** 统计块数量（含嵌套） */
function countBlocks(blocks: unknown): number {
  if (!Array.isArray(blocks)) return 0;
  let n = 0;
  const walk = (list: unknown[]) => {
    for (const node of list) {
      n++;
      const children = (node as { children?: unknown[] })?.children;
      if (Array.isArray(children)) walk(children);
    }
  };
  walk(blocks);
  return n;
}

const EMPTY_RECORDS: RecordRow[] = [];

/**
 * 记录详情：属性区（与表格单元格同一套输入控件）+ 正文。
 * 属性区和正文都直接写库（属性立即、正文防抖），没有"保存"按钮。
 */
function RecordPanel({ collection, record }: { collection: CollectionRow; record: RecordRow }) {
  const setCell = useStore((s) => s.setCell);
  const setRecordDoc = useStore((s) => s.setRecordDoc);
  const closeRecord = useStore((s) => s.closeRecord);
  const theme = useStore((s) => s.theme);
  const uploadFile = useStore((s) => s.uploadFile);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);

  // 剪藏记录的原文快照：从附件库换成可下载的 blob 地址
  useEffect(() => {
    let alive = true;
    const id = record.snapshotAssetId;
    if (!id) {
      setSnapshotUrl(null);
      return;
    }
    void assetUrl(id).then((url) => {
      if (alive) setSnapshotUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [record.snapshotAssetId]);

  // 第一个文本字段当标题列（和表格里的粗体标题列一致），属性区里不再重复列一次
  const titleField = collection.fields.find((f) => f.type === "text") ?? null;
  const propFields = titleField ? collection.fields.filter((f) => f.id !== titleField.id) : collection.fields;

  // 记录页的 AI 上下文：标题 + 正文（剪藏文章的总结/提炼就靠它）
  const recordTitle = titleField ? asText(record.values[titleField.id]) : "记录";
  const recordText = extractBlocksText((record.doc as unknown[]) ?? [])
    .map((block) => block.text)
    .join("\n");

  return (
    <>
      <div className="panel__header">
        <span className="panel__crumb">
          {collection.icon ?? "🗂️"} {collection.name}
        </span>
        <button className="icon-btn panel__close" title="关闭记录" onClick={closeRecord}>
          ×
        </button>
      </div>

      <div className="record">
        {titleField ? (
          <input
            className="record__title"
            value={asText(record.values[titleField.id])}
            placeholder="无标题"
            onChange={(e) => setCell(collection.id, record.id, titleField.id, e.target.value)}
          />
        ) : (
          <div className="record__title record__title--static">无标题</div>
        )}

        <div className="record__props">
          {propFields.map((f) => (
            <div className="record__prop" key={f.id}>
              <span className="record__label">{f.name}</span>
              <div className="record__value">
                <CellEditor
                  field={f}
                  record={record}
                  onCommit={(value) => setCell(collection.id, record.id, f.id, value)}
                />
              </div>
            </div>
          ))}
        </div>

        {snapshotUrl && (
          <div className="record__snapshot">
            <span>原文备份</span>
            <a className="btn btn--sm" href={snapshotUrl} download={`${asText(record.values[titleField?.id ?? ""]) || "剪藏"}.html`}>
              下载 HTML
            </a>
            <a className="btn btn--sm" href={snapshotUrl} target="_blank" rel="noreferrer">
              打开快照
            </a>
          </div>
        )}

        <div className="record__body">
          <div className="record__body-label">正文</div>
          <PageEditor
            key={record.id}
            initialBlocks={(record.doc as PartialBlock[]) ?? []}
            theme={theme}
            onChange={(blocks) => setRecordDoc(collection.id, record.id, blocks)}
            uploadFile={(file) => uploadFile(file, "image", null)}
          />
        </div>

        <AiPanel context={{ title: recordTitle, text: recordText }} contextKey={record.id} />
      </div>
    </>
  );
}

export function RightPanel({ page }: { page: PageRow | null }) {
  const iconSet = useStore((s) => s.iconSet);
  const doc = useActiveDoc();
  const openRecordRef = useStore((s) => s.openRecordRef);
  const collection = useStore((s) =>
    openRecordRef ? s.collections.find((c) => c.id === openRecordRef.collectionId) ?? null : null
  );
  const record = useStore((s) => {
    if (!openRecordRef) return null;
    return (s.records[openRecordRef.collectionId] ?? EMPTY_RECORDS).find((r) => r.id === openRecordRef.recordId) ?? null;
  });

  if (openRecordRef && collection && record) {
    // key：换记录时重建属性输入框。CellEditor 里很多输入是非受控的（defaultValue），
    // 不重建会留着上一条记录的值（正文靠 key 重建，属性区现在也一样）。
    return <RecordPanel key={record.id} collection={collection} record={record} />;
  }

  return (
    <>
      <div className="panel__header">
        <AppIcon name="panelRight" set={iconSet} size={15} />
        页面信息
      </div>
      <div className="panel__body">
        {!page ? (
          <div className="empty-state">没有打开的页面</div>
        ) : (
          <>
            <div className="panel__row">
              <span>标题</span>
              <b>{page.title || "无标题"}</b>
            </div>
            <div className="panel__row">
              <span>字数</span>
              <b>{doc ? countChars(doc) : "载入中"}</b>
            </div>
            <div className="panel__row">
              <span>块数</span>
              <b>{doc ? countBlocks(doc) : "载入中"}</b>
            </div>
            <div className="panel__row">
              <span>创建</span>
              <b>{fmt(page.createdAt)}</b>
            </div>
            <div className="panel__row">
              <span>最后修改</span>
              <b>{fmt(page.updatedAt)}</b>
            </div>
            <div className="panel__row">
              <span>存放位置</span>
              <b>本地数据库</b>
            </div>

            <AiPanel />
          </>
        )}
      </div>
    </>
  );
}
