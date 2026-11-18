import { useEffect, useState } from "react";
import type { Block, BlockNoteEditor, PartialBlock } from "@blocknote/core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEditor = BlockNoteEditor<any, any, any>;
import { useStore } from "../data/store";
import { repo } from "../data/db";
import { resolveAssetRefs } from "../data/assets";

/**
 * 块右键菜单（W54，07 §3 桌面 14 项全量）
 *
 * 逐项落地原则：能真做的真做；观复没有的能力诚实置灰。
 *  - 复制/剪切/创建副本/删除/上下方插入/复制块链接/颜色/转换为：编辑器原生能力，真实现
 *  - AI 助手：走现有 dispatchAiCommand（改写本段）
 *  - 移动到：把块搬到另一页（读目标页文档后追加、从本页删掉）
 *  - 复制并移动到页面：当前只复制文字到剪贴板并提示【暂定】
 *  - 添加评论 / 右侧添加分栏：未实现 → 置灰
 */
type Sub = null | "convert" | "color" | "move";

const CONVERT_TARGETS: { label: string; type: string; text: string }[] = [
  { label: "正文", type: "paragraph", text: "正文" },
  { label: "标题1", type: "heading", text: "标题1" },
  { label: "标题2", type: "heading", text: "标题2" },
  { label: "标题3", type: "heading", text: "标题3" },
  { label: "标题4", type: "heading", text: "标题4" },
  { label: "项目列表", type: "bulletListItem", text: "项目列表" },
  { label: "编号列表", type: "numberedListItem", text: "编号列表" },
  { label: "待办列表", type: "checkListItem", text: "待办列表" },
  { label: "折叠列表", type: "toggleListItem", text: "折叠列表" },
  { label: "引述文字", type: "quote", text: "引述文字" },
  { label: "代码片段", type: "codeBlock", text: "代码片段" },
  { label: "着重文字", type: "callout", text: "着重文字" },
  { label: "页面", type: "pageBlock", text: "页面" },
];

const COLORS: { label: string; value: string }[] = [
  { label: "默认", value: "default" },
  { label: "灰", value: "gray" },
  { label: "黄", value: "yellow" },
  { label: "红", value: "red" },
  { label: "蓝", value: "blue" },
  { label: "绿", value: "green" },
];

function blockText(block: Block<any, any, any>): string {
  const walk = (node: unknown): string => {
    if (!node) return "";
    if (Array.isArray(node)) return node.map(walk).join("");
    if (typeof node !== "object") return "";
    const o = node as { text?: string; content?: unknown; children?: unknown };
    if (typeof o.text === "string") return o.text;
    return walk(o.content) + walk(o.children);
  };
  return walk(block.content).trim();
}

export function BlockContextMenu({ editor }: { editor: AnyEditor }) {
  const [ctx, setCtx] = useState<{ blockId: string; x: number; y: number } | null>(null);
  const [sub, setSub] = useState<Sub>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pages = useStore((s) => s.pages);
  const dispatchAiCommand = useStore((s) => s.dispatchAiCommand);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const host = e.target as HTMLElement;
      const blockEl = host.closest?.(".bn-block[data-id]") as HTMLElement | null;
      if (!blockEl) return;
      const id = blockEl.getAttribute("data-id");
      if (!id) return;
      e.preventDefault();
      setCtx({ blockId: id, x: e.clientX, y: e.clientY });
      setSub(null);
    };
    const onDown = (e: MouseEvent) => {
      const host = e.target as HTMLElement;
      if (host.closest?.(".blockmenu")) return;
      setCtx(null);
      setSub(null);
    };
    window.addEventListener("contextmenu", onCtx);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("mousedown", onDown);
    };
  }, []);

  // 菜单关了也要把刚才的操作提示显示完（否则点完菜单 toast 跟着一起消失）
  if (!ctx) return toast ? <span className="toolbar__toast">{toast}</span> : null;
  const block = editor.getBlock(ctx.blockId);
  if (!block) return null;
  const curType = block.type as string;

  const remove = () => editor.removeBlocks([block]);
  const copyText = (text: string, then?: () => void) => {
    void navigator.clipboard.writeText(text).then(() => {
      flash("已复制");
      then?.();
    });
  };
  const close = () => {
    setCtx(null);
    setSub(null);
  };
  const insertSibling = (pos: "before" | "after") => {
    editor.insertBlocks([{ type: "paragraph" } as PartialBlock], block, pos);
    close();
  };

  return (
    <>
      {toast && <span className="toolbar__toast">{toast}</span>}
      <div className="blockmenu tabctx" style={{ left: ctx.x, top: ctx.y }}>
        {sub === "convert" ? (
          <>
            <div className="tabctx__item tabctx__item--head" onMouseDown={(e) => { e.stopPropagation(); setSub(null); }}>
              ← 转换为
            </div>
            {CONVERT_TARGETS.map((t) => (
              <div
                key={t.label}
                className={`tabctx__item${t.type === curType ? " tabctx__item--on" : ""}`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const props: Record<string, unknown> = {};
                  if (t.type === "heading") props.level = Number(t.text.replace("标题", "")) || 1;
                  if (t.type === "pageBlock") props.mode = "ref";
                  editor.updateBlock(block, { type: t.type, props } as never);
                  close();
                }}
              >
                {t.type === curType ? "✓ " : ""}
                {t.label}
              </div>
            ))}
          </>
        ) : sub === "color" ? (
          <>
            <div className="tabctx__item tabctx__item--head" onMouseDown={(e) => { e.stopPropagation(); setSub(null); }}>
              ← 颜色
            </div>
            {COLORS.map((c) => (
              <div
                key={c.value}
                className="tabctx__item"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  editor.updateBlock(block, { props: { backgroundColor: c.value } } as never);
                  close();
                }}
              >
                {c.label}
              </div>
            ))}
          </>
        ) : sub === "move" ? (
          <>
            <div className="tabctx__item tabctx__item--head" onMouseDown={(e) => { e.stopPropagation(); setSub(null); }}>
              ← 移动到页面
            </div>
            {pages.map((p) => (
              <div
                key={p.id}
                className="tabctx__item"
                onMouseDown={async (e) => {
                  e.stopPropagation();
                  try {
                    const raw = (await repo.getDoc(p.id)) ?? [];
                    const resolved = await resolveAssetRefs(raw as never);
                    await repo.putDoc(p.id, [...(resolved as unknown[]), block] as never);
                    remove();
                    flash(`已移动到「${p.title || "无标题"}」`);
                  } catch {
                    flash("移动失败");
                  }
                  close();
                }}
              >
                {p.title || "无标题"}
              </div>
            ))}
          </>
        ) : (
          <>
            <div
              className="tabctx__item"
              onMouseDown={(e) => {
                e.stopPropagation();
                dispatchAiCommand({ kind: "rewriteBlock", blockId: block.id, text: blockText(block) });
                close();
              }}
            >
              ✨ AI 助手
            </div>
            <div className="tabctx__item" onMouseDown={(e) => { e.stopPropagation(); copyText(blockText(block)); }}>
              📄 复制
            </div>
            <div
              className="tabctx__item"
              onMouseDown={(e) => {
                e.stopPropagation();
                copyText(blockText(block), () => {
                  remove();
                  close();
                });
              }}
            >
              ✂ 剪切
            </div>
            <div
              className="tabctx__item"
              onMouseDown={(e) => {
                e.stopPropagation();
                editor.insertBlocks([block as PartialBlock], block, "after");
                close();
              }}
            >
              📑 创建副本
            </div>
            <div
              className="tabctx__item"
              onMouseDown={(e) => {
                e.stopPropagation();
                copyText(blockText(block));
                flash("已复制文字（跨页移动待专项）【暂定】");
              }}
            >
              复制并移动到页面
            </div>
            <div
              className="tabctx__item"
              onMouseDown={(e) => {
                e.stopPropagation();
                setSub("convert");
              }}
            >
              ⇄ 转换为 ›
            </div>
            <div
              className="tabctx__item"
              onMouseDown={(e) => {
                e.stopPropagation();
                const pageId = useStore.getState().activeTabId ?? "";
                copyText(`${location.origin}${location.pathname}?page=${pageId}#block=${block.id}`);
              }}
            >
              🔗 复制块链接
            </div>
            <div className="tabctx__item" onMouseDown={(e) => { e.stopPropagation(); remove(); close(); }}>
              🗑 删除
            </div>
            <div className="tabctx__item" onMouseDown={(e) => { e.stopPropagation(); setSub("move"); }}>
              ↪ 移动到 ›
            </div>
            <div className="tabctx__item" onMouseDown={(e) => { e.stopPropagation(); setSub("color"); }}>
              🎨 颜色 ›
            </div>
            <div className="tabctx__item tabctx__item--off" title="评论体系待专项（【暂定】）">
              💬 添加评论
            </div>
            <div className="tabctx__item" onMouseDown={(e) => { e.stopPropagation(); insertSibling("before"); }}>
              ↑ 在上方插入
            </div>
            <div className="tabctx__item" onMouseDown={(e) => { e.stopPropagation(); insertSibling("after"); }}>
              ↓ 在下方插入
            </div>
            <div className="tabctx__item tabctx__item--off" title="分栏容器待专项（【暂定】）">
              ▦ 在右侧添加分栏
            </div>
          </>
        )}
      </div>
    </>
  );
}