import { useStore, useActiveDoc } from "../data/store";
import type { PageRow } from "../data/db";
import { AppIcon } from "../design/icons";

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

export function RightPanel({ page }: { page: PageRow | null }) {
  const iconSet = useStore((s) => s.iconSet);
  const doc = useActiveDoc();

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

            <div className="panel__placeholder">
              AI 面板（总结 / 改写 / Skill / MCP）在第 5 步接入。
              这里现在放的是**真实数据**——故意不放"点一下没反应"的假按钮。
            </div>
          </>
        )}
      </div>
    </>
  );
}
