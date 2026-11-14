/**
 * 多维表块：在页面正文里放一张已有多维表的入口。
 *
 * 第一版刻意不做"表内直接编辑"：表格本身有自己的整页视图和记录面板，
 * 嵌在正文里再复制一套交互，容易两边行为不一致。这里给的是**同一份数据**的入口卡，
 * 打开的是主区的同一张表（不是副本）。
 */
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { useStore } from "../../data/store";

export const CollectionBlock = createReactBlockSpec(
  {
    type: "collectionBlock",
    propSchema: {
      ...defaultProps,
      collectionId: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      // 这两个 hook 在块组件里可用：BlockNote 的 render 就是一个 React 组件
      const collections = useStore((s) => s.collections);
      const openCollection = useStore((s) => s.openCollection);
      const collectionId = block.props.collectionId as string;
      const collection = collections.find((c) => c.id === collectionId);

      if (!collection) {
        return (
          <div className="collection-embed collection-embed--empty" contentEditable={false}>
            <span className="collection-embed__icon">🗂️</span>
            <select
              className="collection-embed__select"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) editor.updateBlock(block, { props: { collectionId: e.target.value } });
              }}
            >
              <option value="" disabled>
                选择一张多维表
              </option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {collections.length === 0 && <span className="collection-embed__hint">还没有多维表</span>}
          </div>
        );
      }

      return (
        <div className="collection-embed" contentEditable={false}>
          <span className="collection-embed__icon">{collection.icon ?? "🗂️"}</span>
          <div className="collection-embed__meta">
            <b className="collection-embed__name">{collection.name}</b>
            <span className="collection-embed__sub">{collection.fields.length} 个字段</span>
          </div>
          <button className="btn btn--sm" onClick={() => openCollection(collection.id)}>
            打开表格
          </button>
          <button
            className="icon-btn"
            title="更换表格"
            onClick={() => editor.updateBlock(block, { props: { collectionId: "" } })}
          >
            ×
          </button>
        </div>
      );
    },
    toExternalHTML: ({ block }) => (
      <p>多维表（{String(block.props.collectionId || "未选择")}）</p>
    ),
  }
);
