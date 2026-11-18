import { useEffect, useRef, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { useActiveDoc, useActivePage, useStore } from "../data/store";
import { useStarred } from "../data/starred";
import { getCurrentEditor } from "../editor/editorRef";
import { downloadText, pageToHtml, pageToMarkdown, safeFileName } from "../data/exporters";
import { AppIcon } from "../design/icons";

/**
 * 页面「⋯」更多菜单（W46）
 *
 * 规格：03 §4 —— 三组 17 项。落地原则：
 *  - 能真做的全部真做（撤销/重做、导出、移动、快速访问、复制链接、页面信息）；
 *  - 观复没有对应能力的诚实置灰并写明（评论位置/锁定/动态/历史/已解决评论）；
 *  - 「转换为模板」按规格甲 观复不做；
 *  - 既有的「创建副本 / 移到回收站」保留（观复自有，规格未列，放组 2 末尾）。
 */
type Sub = null | "export" | "move";

export function PageMenu() {
  const page = useActivePage();
  const doc = useActiveDoc();
  const pages = useStore((s) => s.pages);
  const iconSet = useStore((s) => s.iconSet);
  const duplicatePage = useStore((s) => s.duplicatePage);
  const moveToTrash = useStore((s) => s.moveToTrash);
  const setParent = useStore((s) => s.setParent);
  const toggleRightPanel = useStore((s) => s.toggleRightPanel);
  const starredIds = useStarred((s) => s.ids);
  const toggleStar = useStarred((s) => s.toggle);

  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<Sub>(null);
  const [toast, setToast] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSub(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  if (!page) return null;
  const blocks = (doc ?? []) as PartialBlock[];
  const starred = starredIds.includes(page.id);

  const doExportMarkdown = () => {
    setOpen(false);
    setSub(null);
    try {
      downloadText(safeFileName(page.title, "md"), pageToMarkdown(page.title, blocks), "text/markdown");
      flash("已导出 Markdown");
    } catch (e) {
      flash("导出失败：" + (e as Error).message);
    }
  };
  const doExportHtml = () => {
    setOpen(false);
    setSub(null);
    try {
      downloadText(safeFileName(page.title, "html"), pageToHtml(page.title, blocks), "text/html");
      flash("已导出 HTML");
    } catch (e) {
      flash("导出失败：" + (e as Error).message);
    }
  };
  const doCopyMarkdown = async () => {
    setOpen(false);
    setSub(null);
    try {
      await navigator.clipboard.writeText(pageToMarkdown(page.title, blocks));
      flash("整页 Markdown 已复制");
    } catch {
      flash("复制失败");
    }
  };

  const disabled: [string, string][] = [
    ["页面评论位置", "评论体系待专项"],
    ["锁定页面", "锁定能力待专项"],
    ["页面动态", "动态记录待专项"],
    ["页面历史", "历史版本待专项"],
    ["已解决评论", "评论体系待专项"],
  ];

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        className="icon-btn"
        title="页面菜单"
        onClick={() => {
          setOpen((v) => !v);
          setSub(null);
        }}
      >
        <AppIcon name="more" set={iconSet} />
      </button>

      {toast && <span className="toolbar__toast">{toast}</span>}

      {open && (
        <div className="popover pagemenu">
          {sub === "export" ? (
            <>
              <button className="menu-item menu-item--back" onClick={() => setSub(null)}>
                ← 导出页面
              </button>
              <button className="menu-item" onClick={doExportMarkdown}>
                导出为 Markdown
              </button>
              <button className="menu-item" onClick={doExportHtml}>
                导出为 HTML
              </button>
              <button className="menu-item" onClick={() => void doCopyMarkdown()}>
                复制整页为 Markdown
              </button>
            </>
          ) : sub === "move" ? (
            <>
              <button className="menu-item menu-item--back" onClick={() => setSub(null)}>
                ← 移动到
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  if (setParent(page.id, null)) flash("已移到顶层");
                  setOpen(false);
                  setSub(null);
                }}
              >
                顶层
              </button>
              {pages
                .filter((p) => p.id !== page.id)
                .slice(0, 20)
                .map((p) => (
                  <button
                    key={p.id}
                    className="menu-item"
                    onClick={() => {
                      if (!setParent(page.id, p.id)) flash("不能移到自己或自己的子页面下");
                      else flash("已移动");
                      setOpen(false);
                      setSub(null);
                    }}
                  >
                    {p.title || "无标题"}
                  </button>
                ))}
            </>
          ) : (
            <>
              {/* 组 1：撤销 / 重做 */}
              <button
                className="menu-item"
                onClick={() => {
                  getCurrentEditor()?.undo();
                  setOpen(false);
                }}
              >
                撤销
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  getCurrentEditor()?.redo();
                  setOpen(false);
                }}
              >
                重做
              </button>

              <div className="menu-sep" />

              {/* 组 2：页面设置与操作 */}
              <button
                className="menu-item"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent("guanfu:open-appearance"));
                }}
              >
                页面字体及布局设置
              </button>
              {disabled.slice(0, 2).map(([label, why]) => (
                <div key={label} className="menu-item menu-item--muted" title={`${why}（【暂定】）`}>
                  <span>{label}</span>
                  <span className="menu-tag">待专项</span>
                </div>
              ))}
              <button className="menu-item" onClick={() => setSub("export")}>
                导出页面 <span className="menu-item__caret">›</span>
              </button>
              <button className="menu-item" onClick={() => setSub("move")}>
                移动到 <span className="menu-item__caret">›</span>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  toggleStar(page.id);
                  flash(starred ? "已从快速访问移除" : "已加入快速访问");
                }}
              >
                {starred ? "从快速访问移除" : "添加到快速访问"}
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(`${location.origin}${location.pathname}?page=${page.id}`)
                    .then(() => flash("页面访问链接已复制"))
                    .catch(() => flash("复制失败"));
                }}
              >
                复制页面访问链接
              </button>

              <div className="menu-sep" />

              {/* 组 3：页面信息 / 动态 / 历史 */}
              <button
                className="menu-item"
                onClick={() => {
                  toggleRightPanel();
                  setOpen(false);
                }}
              >
                页面信息
              </button>
              {disabled.slice(2).map(([label, why]) => (
                <div key={label} className="menu-item menu-item--muted" title={`${why}（【暂定】）`}>
                  <span>{label}</span>
                  <span className="menu-tag">待专项</span>
                </div>
              ))}

              <div className="menu-sep" />

              {/* 观复自有（规格未列，保留既有能力） */}
              <button
                className="menu-item"
                onClick={() => {
                  void duplicatePage(page.id);
                  setOpen(false);
                }}
              >
                创建副本
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  void moveToTrash(page.id);
                  setOpen(false);
                }}
              >
                移到回收站
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}