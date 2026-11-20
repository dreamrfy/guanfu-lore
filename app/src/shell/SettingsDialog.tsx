import { useEffect, useState } from "react";

/** W100 · 设置弹层骨架（11 号 §2）：居中大弹层 ~950×660，左侧竖导航 + 右侧内容 + 右上 ×。
 *  页签分组照录 11 号 §2：账号组（账号设置/通用设置，其余商业化置灰）、空间组、底部退出登录。
 *  W101 负责把各页签内容逐项做实——本骨架右侧仅渲染最小占位。 */

export type SettingsTab =
  | "account"
  | "general"
  | "activity"
  | "commission"
  | "spaceInfo"
  | "spaceSettings"
  | "members"
  | "publicShare"
  | "mcp"
  | "customModels"
  | "authorizedApps"
  | "upgrade"
  | "orders";

/** 11 号 §2 分组结构；商业化 3+2 项保留导航位但置灰（W102 处理槽位替换） */
const NAV: { group: string; items: { id: SettingsTab; label: string; badge?: string; disabled?: boolean }[] }[] = [
  {
    group: "账号",
    items: [
      { id: "account", label: "账号设置" },
      { id: "general", label: "通用设置" },
      { id: "activity", label: "活动中心", badge: "红点", disabled: true },
      { id: "commission", label: "推荐佣金", badge: "赚佣金", disabled: true },
    ],
  },
  {
    group: "空间",
    items: [
      { id: "spaceInfo", label: "空间信息" },
      { id: "spaceSettings", label: "空间设置" },
      { id: "members", label: "成员" },
      { id: "publicShare", label: "公开分享" },
      { id: "mcp", label: "MCP & SKILL" },
      { id: "customModels", label: "自定义模型", disabled: true },
      { id: "authorizedApps", label: "已授权应用", disabled: true },
      { id: "upgrade", label: "升级", disabled: true },
      { id: "orders", label: "订单", disabled: true },
    ],
  },
];

/** W101 页签标题映射——骨架期右侧只显示标题 + 占位说明 */
const TAB_TITLE: Record<SettingsTab, string> = {
  account: "账号设置",
  general: "通用设置",
  activity: "活动中心",
  commission: "推荐佣金",
  spaceInfo: "空间信息",
  spaceSettings: "空间设置",
  members: "成员",
  publicShare: "公开分享",
  mcp: "MCP & SKILL",
  customModels: "自定义模型",
  authorizedApps: "已授权应用",
  upgrade: "升级",
  orders: "订单",
};

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>("account");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="setdlg" data-testid="settings-dialog" onMouseDown={onClose}>
      <div className="setdlg__card" onMouseDown={(e) => e.stopPropagation()}>
        <aside className="setdlg__nav">
          {NAV.map((g) => (
            <div key={g.group} className="setdlg__group">
              <div className="setdlg__group-name">{g.group}</div>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  className={`setdlg__item${tab === it.id ? " setdlg__item--on" : ""}${it.disabled ? " setdlg__item--off" : ""}`}
                  disabled={it.disabled}
                  onClick={() => setTab(it.id)}
                >
                  {it.label}
                  {it.badge && <span className="setdlg__badge">{it.badge}</span>}
                </button>
              ))}
            </div>
          ))}
          <div className="setdlg__group setdlg__group--bottom">
            <button className="setdlg__item setdlg__item--quit">退出登录</button>
          </div>
        </aside>
        <section className="setdlg__body">
          <button className="setdlg__close" title="关闭" onClick={onClose}>
            ×
          </button>
          <h2 className="setdlg__title">{TAB_TITLE[tab]}</h2>
          <div className="setdlg__content" data-testid="settings-content">
            {/* W101 起逐页签做实；骨架期占位 */}
            <div className="setdlg__placeholder">此页签内容将在设置内容批（W101）做实。</div>
          </div>
        </section>
      </div>
    </div>
  );
}
