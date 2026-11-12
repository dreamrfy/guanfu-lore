import { useStore } from "../data/store";
import { AppIcon } from "../design/icons";

export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const pages = useStore((s) => s.pages);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab = useStore((s) => s.closeTab);
  const createPage = useStore((s) => s.createPage);
  const iconSet = useStore((s) => s.iconSet);

  return (
    <div className="tabbar">
      {tabs.map((id) => {
        const page = pages.find((p) => p.id === id);
        if (!page) return null;
        return (
          <div
            key={id}
            className={`tab${id === activeTabId ? " tab--active" : ""}`}
            onClick={() => setActiveTab(id)}
            title={page.title}
          >
            {page.icon && <span>{page.icon}</span>}
            <span className="tab__label">{page.title || "无标题"}</span>
            {tabs.length > 1 && (
              <span
                className="tab__close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(id);
                }}
              >
                <AppIcon name="close" set={iconSet} size={13} />
              </span>
            )}
          </div>
        );
      })}
      <div className="tabbar__new" title="新建页面" onClick={() => createPage(null)}>
        <AppIcon name="plus" set={iconSet} size={14} />
      </div>
    </div>
  );
}
