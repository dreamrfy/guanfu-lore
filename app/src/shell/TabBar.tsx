import { useStore } from "../data/store";
import { AppIcon } from "../design/icons";

/**
 * 页签栏（手册 §1）：横贯整窗，高 38px。
 * 左区导航钮区宽 228（=侧栏宽，视觉连体；按钮 W12 落位），
 * 页签固定 180×38，关闭钮 20×20 常显，新建钮 28×28。
 */
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
      <div className="tabbar__nav" />
      <div className="tabbar__tabs">
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
              {page.icon && <span className="tab__icon">{page.icon}</span>}
              <span className="tab__label">{page.title || "无标题"}</span>
              <span
                className="tab__close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(id);
                }}
                title="关闭页签"
              >
                <AppIcon name="close" set={iconSet} size={13} />
              </span>
            </div>
          );
        })}
        <div className="tabbar__new" title="新建页面" onClick={() => createPage(null)}>
          <AppIcon name="plus" set={iconSet} size={14} />
        </div>
      </div>
    </div>
  );
}
