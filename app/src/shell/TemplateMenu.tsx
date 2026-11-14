import { useEffect, useRef, useState } from "react";
import {
  createPageFromTemplate,
  deleteTemplate,
  listTemplates,
  savePageAsTemplate,
  type PageTemplate,
} from "../data/templates";
import { useStore } from "../data/store";
import { AppIcon } from "../design/icons";

/**
 * 侧栏底部的「模板」入口：
 *  - 点某个模板 = 用它新建一页
 *  - 「把当前页存为模板」= 快照当前页
 */
export function TemplateMenu() {
  const activeTabId = useStore((s) => s.activeTabId);
  const iconSet = useStore((s) => s.iconSet);
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<PageTemplate[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  const refresh = () => {
    void listTemplates().then(setTemplates);
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="tpl" ref={ref}>
      <button
        className="icon-btn"
        style={{ width: "100%", justifyContent: "flex-start" }}
        onClick={() => {
          setOpen((v) => !v);
          refresh();
          setSaved(null);
        }}
      >
        <AppIcon name="file" set={iconSet} />
        模板{templates.length > 0 ? `（${templates.length}）` : ""}
      </button>

      {open && (
        <div className="tpl__pop">
          <button
            className="tpl__action"
            disabled={!activeTabId}
            onClick={async () => {
              if (!activeTabId) return;
              const tpl = await savePageAsTemplate(activeTabId);
              if (tpl) {
                setSaved(tpl.name);
                refresh();
              }
            }}
          >
            ＋ 把当前页存为模板
          </button>
          {saved && <div className="tpl__saved">已保存「{saved}」</div>}

          <div className="tpl__list">
            {templates.length === 0 && <div className="tpl__empty">还没有模板</div>}
            {templates.map((tpl) => (
              <div className="tpl__item" key={tpl.id}>
                <button
                  className="tpl__use"
                  title="用这个模板新建页面"
                  onClick={async () => {
                    await createPageFromTemplate(tpl);
                    setOpen(false);
                  }}
                >
                  <span>{tpl.icon ?? "📄"}</span>
                  <span className="tpl__name">{tpl.name}</span>
                </button>
                <button
                  className="icon-btn"
                  title="删除模板"
                  onClick={async () => {
                    if (!confirm(`删除模板「${tpl.name}」？`)) return;
                    await deleteTemplate(tpl.id);
                    refresh();
                  }}
                >
                  <AppIcon name="close" set={iconSet} size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
