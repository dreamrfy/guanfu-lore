import { useEffect, useRef, useState } from "react";
import { useStore } from "../data/store";
import { exportBackup, importBackupFile } from "../data/backup";
import { dropLeadingTitleBlock, markdownToBlocks, titleFromMarkdown } from "../data/exporters";
import { AppIcon, ICON_SETS, type IconSetId } from "../design/icons";
import { FONT_THEMES } from "../design/fonts";
import { PageMenu } from "./PageMenu";
import { AiPanel } from "./AiPanel";
import { SyncButton } from "./SyncButton";

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

export function TopToolbar() {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const iconSet = useStore((s) => s.iconSet);
  const setIconSet = useStore((s) => s.setIconSet);
  const fontTheme = useStore((s) => s.fontTheme);
  const setFontTheme = useStore((s) => s.setFontTheme);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const toggleRightPanel = useStore((s) => s.toggleRightPanel);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useStore((s) => s.toggleSidebar);

  const [openMenu, setOpenMenu] = useState<null | "appearance" | "more">(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const mdRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useOutsideClose(() => setOpenMenu(null));
  const createPageWithBlocks = useStore((s) => s.createPageWithBlocks);
  // W40 顶栏：页面路径（面包屑）+ 规格五图标
  const pages = useStore((s) => s.pages);
  const activeTabId = useStore((s) => s.activeTabId);
  const openTab = useStore((s) => s.openTab);
  const flash = (msg: string) => {
    setBusy(msg);
    window.setTimeout(() => setBusy(null), 1800);
  };
  const crumbs = (() => {
    const byId = new Map(pages.map((p) => [p.id, p]));
    const out: { id: string; title: string }[] = [];
    let cur = activeTabId ? byId.get(activeTabId) : undefined;
    while (cur && out.length < 8) {
      out.unshift({ id: cur.id, title: cur.title });
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return out;
  })();

  // 侧栏图标行（W21）联动：AI / 更多 两个入口由 Sidebar 派发事件
  useEffect(() => {
    const onOpenAi = () => setChatOpen(true);
    const onImport = () => mdRef.current?.click();
    window.addEventListener("guanfu:open-ai", onOpenAi);
    const onAppearance = () => setOpenMenu("appearance");
    window.addEventListener("guanfu:import-file", onImport);
    window.addEventListener("guanfu:open-appearance", onAppearance);
    return () => {
      window.removeEventListener("guanfu:open-ai", onOpenAi);
      window.removeEventListener("guanfu:import-file", onImport);
      window.removeEventListener("guanfu:open-appearance", onAppearance);
    };
  }, []);

  const onPickMarkdown = async (file: File) => {
    setBusy("正在导入…");
    try {
      const text = await file.text();
      const title = titleFromMarkdown(text, file.name.replace(/\.(md|markdown|txt)$/i, ""));
      // 标题已经进"页面标题"了，正文里那一行同名 H1 要去掉，免得重复
      const blocks = dropLeadingTitleBlock(title, markdownToBlocks(text));
      await createPageWithBlocks(title, blocks);
      setBusy(`已导入「${title}」`);
      setTimeout(() => setBusy(null), 2500);
    } catch (e) {
      setBusy(`导入失败：${(e as Error).message}`);
      setTimeout(() => setBusy(null), 4000);
    }
  };

  const doExport = async () => {
    setBusy("正在导出…");
    try {
      const r = await exportBackup();
      setBusy(`已导出 ${r.pages} 篇页面`);
      setTimeout(() => setBusy(null), 2500);
    } catch (e) {
      setBusy(`导出失败：${(e as Error).message}`);
      setTimeout(() => setBusy(null), 4000);
    }
  };

  const onPickFile = async (file: File) => {
    if (!confirm("从备份恢复会**覆盖当前全部数据**（当前内容将被替换）。\n建议先自己导出一份留底。确定继续？")) return;
    setBusy("正在恢复…");
    try {
      const r = await importBackupFile(file);
      setBusy(`已恢复 ${r.pages} 篇页面，正在重新载入…`);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setBusy(`恢复失败：${(e as Error).message}`);
      setTimeout(() => setBusy(null), 5000);
    }
  };

  return (
    <div className="toolbar" ref={menuRef}>
      {sidebarCollapsed && (
        <button className="icon-btn" title="展开侧栏" onClick={toggleSidebar}>
          <AppIcon name="panelLeft" set={iconSet} />
        </button>
      )}

      {busy && <span className="toolbar__toast">{busy}</span>}

      {/* W40 页面路径（手册 §2/03 §3：桌面顶栏左=页面路径） */}
      <nav className="toolbar__crumbs">
        {crumbs.map((c, i) => (
          <span key={c.id} className="toolbar__crumb-wrap">
            {i > 0 && <span className="toolbar__crumb-sep">/</span>}
            <button className="toolbar__crumb" title={c.title || "无标题"} onClick={() => openTab(c.id)}>
              {c.title || "无标题"}
            </button>
          </span>
        ))}
      </nav>

      <div className="toolbar__spacer" />

      {/* W40 规格五图标：分享 / 评论 / ⚡ / ⋯ / 搜索（03 §3 桌面细条右侧顺序） */}
      <button
        className="icon-btn"
        title="分享"
        onClick={() => {
          void navigator.clipboard
            .writeText(`${location.origin}${location.pathname}?page=${activeTabId ?? ""}`)
            .then(() => flash("页面链接已复制（分享面板待 W110）"))
            .catch(() => flash("复制失败"));
        }}
      >
        <AppIcon name="share" set={iconSet} />
      </button>
      <button className="icon-btn" title="评论（待评论体系专项）" disabled>
        <AppIcon name="comment" set={iconSet} />
      </button>
      <button className="icon-btn" title="⚡ AI" onClick={() => setChatOpen(true)}>
        <AppIcon name="bolt" set={iconSet} />
      </button>
      <PageMenu />
      <button
        className="icon-btn"
        title="搜索"
        onClick={() => {
          if (useStore.getState().sidebarCollapsed) toggleSidebar();
          setTimeout(() => {
            const input = document.querySelector<HTMLInputElement>(".sidebar__search input");
            input?.focus();
          }, 80);
        }}
      >
        <AppIcon name="search" set={iconSet} />
      </button>

      <span className="toolbar__sep" />

      {/* 【暂定】以下为观复自有工具入口，W100 设置弹层落位后收进设置页 */}
      <SyncButton />

      
      {/* 外观：主题 / 字体 / 图标风格 */}
      <div style={{ position: "relative" }}>
        <button
          className="icon-btn"
          title="外观"
          onClick={() => setOpenMenu(openMenu === "appearance" ? null : "appearance")}
        >
          <AppIcon name="palette" set={iconSet} />
        </button>
        {openMenu === "appearance" && (
          <div className="popover popover--wide">
            <div className="panel__row">
              <b>主题</b>
              <button className="icon-btn" onClick={toggleTheme}>
                <AppIcon name={theme === "light" ? "moon" : "sun"} set={iconSet} />
                {theme === "light" ? "深色" : "浅色"}
              </button>
            </div>

            <div style={{ marginTop: 8 }}>
              <b>字体</b>
              <select
                className="select"
                value={fontTheme}
                onChange={(e) => setFontTheme(e.target.value)}
              >
                {FONT_THEMES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: 8 }}>
              <b>图标风格</b>
              <select
                className="select"
                value={iconSet}
                onChange={(e) => setIconSet(e.target.value as IconSetId)}
              >
                {ICON_SETS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}（{s.license}）
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* AI 面板 */}
      <button
        className="icon-btn"
        title="页面信息面板"
        onClick={toggleRightPanel}
        style={{ color: rightPanelOpen ? "var(--text)" : undefined }}
      >
        <AppIcon name="ai" set={iconSet} />
      </button>

      <span className="toolbar__sep" />

      {/* 设置与数据（应用级：备份 / 恢复 / 导入）—— 用齿轮区分页面菜单的 ⋯，避免两个省略号分不清 */}
      <div style={{ position: "relative" }}>
        <button
          className="icon-btn"
          title="设置与数据"
          onClick={() => setOpenMenu(openMenu === "more" ? null : "more")}
        >
          <AppIcon name="settings" set={iconSet} />
        </button>
        {openMenu === "more" && (
          <div className="popover">
            <button className="menu-item" onClick={() => void doExport()}>
              <AppIcon name="inbox" set={iconSet} size={14} />
              导出整库备份
            </button>
            <button className="menu-item" onClick={() => fileRef.current?.click()}>
              <AppIcon name="file" set={iconSet} size={14} />
              从备份恢复…
            </button>
            <button className="menu-item" onClick={() => mdRef.current?.click()}>
              <AppIcon name="text" set={iconSet} size={14} />
              导入 Markdown 文件…
            </button>
            <div className="menu-sep" />
            <div className="menu-item menu-item--muted">
              <span>分享页面</span>
              <span className="menu-tag">第二批</span>
            </div>
            <div className="menu-item menu-item--muted">
              <span>评论</span>
              <span className="menu-tag">第二批</span>
            </div>
            <div className="menu-item menu-item--muted">
              <span>导出 PDF / 图片 / Word</span>
              <span className="menu-tag">第二批</span>
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ""; // 允许重复选同一个文件
          if (f) void onPickFile(f);
        }}
      />

      <input
        ref={mdRef}
        type="file"
        accept=".md,.markdown,.txt,text/markdown"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onPickMarkdown(f);
        }}
      />
      {chatOpen && (
        <div className="modal" role="dialog" aria-modal="true" onMouseDown={() => setChatOpen(false)}>
          <div className="modal__card chatmodal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <b>AI 对话</b>
              <button className="icon-btn" title="关闭" onClick={() => setChatOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal__body chatmodal__body">
              <AiPanel initialTab="chat" hideTabs />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
