import { useEffect, useRef, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { useActiveDoc, useActivePage, useStore } from "../data/store";
import { downloadText, pageToHtml, pageToMarkdown, safeFileName } from "../data/exporters";
import { AppIcon } from "../design/icons";

/**
 * 页面菜单（右上 ⋯）
 * 这里每一项都是**真能用**的：导出会真的下载文件、复制会真的进剪贴板、删除会真的进回收站。
 */
export function PageMenu() {
  const page = useActivePage();
  const doc = useActiveDoc();
  const iconSet = useStore((s) => s.iconSet);
  const duplicatePage = useStore((s) => s.duplicatePage);
  const moveToTrash = useStore((s) => s.moveToTrash);

  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  const doExportMarkdown = () => {
    setOpen(false);
    try {
      downloadText(safeFileName(page.title, "md"), pageToMarkdown(page.title, blocks), "text/markdown");
      flash("已导出 Markdown 文件");
    } catch (e) {
      flash(`导出失败：${(e as Error).message}`);
    }
  };

  const doExportHtml = () => {
    setOpen(false);
    try {
      downloadText(safeFileName(page.title, "html"), pageToHtml(page.title, blocks), "text/html");
      flash("已导出 HTML 文件");
    } catch (e) {
      flash(`导出失败：${(e as Error).message}`);
    }
  };

  const doCopyMarkdown = async () => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(pageToMarkdown(page.title, blocks));
      flash("整页已复制为 Markdown");
    } catch {
      flash("复制失败：浏览器不允许访问剪贴板");
    }
  };

  const doDuplicate = async () => {
    setOpen(false);
    await duplicatePage(page.id);
    flash("已创建副本");
  };

  const doDelete = async () => {
    setOpen(false);
    await moveToTrash(page.id);
    flash("已移到回收站");
  };

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button className="icon-btn" title="页面菜单" onClick={() => setOpen((v) => !v)}>
        <AppIcon name="more" set={iconSet} />
      </button>

      {toast && <span className="toolbar__toast">{toast}</span>}

      {open && (
        <div className="popover">
          <button className="menu-item" onClick={doExportMarkdown}>
            导出为 Markdown
          </button>
          <button className="menu-item" onClick={doExportHtml}>
            导出为 HTML
          </button>
          <button className="menu-item" onClick={() => void doCopyMarkdown()}>
            复制整页为 Markdown
          </button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => void doDuplicate()}>
            创建副本
          </button>
          <button className="menu-item" onClick={() => void doDelete()}>
            移到回收站
          </button>
          <div className="menu-sep" />
          <div className="menu-item menu-item--muted">
            <span>页面历史</span>
            <span className="menu-tag">第二批</span>
          </div>
          <div className="menu-item menu-item--muted">
            <span>分享页面</span>
            <span className="menu-tag">第二批</span>
          </div>
        </div>
      )}
    </div>
  );
}
