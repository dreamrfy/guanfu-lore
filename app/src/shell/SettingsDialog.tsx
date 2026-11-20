import { useEffect, useState } from "react";
import { useStore } from "../data/store";
import { loadAiConfig, saveAiConfig, type AiConfig } from "../data/ai";
import { loadClipServerUrl, saveClipServerUrl, loadClipToken, saveClipToken } from "../data/clipApi";
import { repo } from "../data/db";
import { FONT_THEMES } from "../design/fonts";
import { ICON_SETS, type IconSetId } from "../design/icons";
import { useLang } from "../i18n";

/** W100 · 设置弹层骨架（11 号 §2）：居中大弹层 ~950×660，左侧竖导航 + 右侧内容 + 右上 ×。
 *  页签分组照录 11 号 §2：账号组（账号设置/通用设置，其余商业化置灰）、空间组、底部退出登录。
 *  W101 · 页签内容对齐（11 号 §5 观复槽位方案）：
 *  - 账号设置 → 观复简化（昵称真改真存，其余观复自建账号体系【暂定】不放假输入）
 *  - 通用设置 → 外观（主题/字体/图标风格，接 store）/ 语言（接 i18n）/ AI 供应商（原位替换，接 ai.ts）
 *  - 空间设置 → 原位替换为「同步与凭证」（观复独有：剪藏服务端地址/Token + 同步状态真显示）
 *  - 公开分享 → 空态（观复单机自托管，无公开主页）
 *  - MCP & SKILL → 观复 mcp.ts 的设置入口（保留槽位，11 号 §5）
 *  - 商业化 6 项置灰（W102 处理槽位替换，本版保留导航位） */

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

/** W101 页签标题映射 */
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
            {tab === "account" && <AccountPane />}
            {tab === "general" && <GeneralPane />}
            {tab === "spaceSettings" && <SyncPane />}
            {tab === "publicShare" && <PublicSharePane />}
            {tab === "mcp" && <McpPane />}
            {tab === "spaceInfo" && <PlaceholderPane text="空间信息内页——重做期补采（11 号 §6），【暂定】并入「同步与凭证」。" />}
            {tab === "members" && <PlaceholderPane text="观复单机自托管，无成员体系（11 号 §5：删除或最小化）。" />}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------------- 账号设置（11 号 §2.1 观复槽位：昵称保留真存，其余简化【暂定】） ---------------- */

const NICK_KEY = "accountNick";

function AccountPane() {
  const [nick, setNickState] = useState("");
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void repo.getMeta<string>(NICK_KEY).then((v) => {
      setNickState(typeof v === "string" ? v : "");
      setDraft(typeof v === "string" ? v : "");
    });
  }, []);

  return (
    <div className="setpane">
      <div className="setpane__row">
        <label className="setpane__label">昵称</label>
        <input
          className="clip-input setpane__input"
          value={draft}
          placeholder="本地昵称（存本机数据库）"
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
          }}
          onBlur={async () => {
            const v = draft.trim();
            await repo.setMeta(NICK_KEY, v);
            setNickState(v);
            setSaved(true);
          }}
          spellCheck={false}
        />
        {saved && <span className="setpane__saved">已保存</span>}
      </div>
      <div className="setpane__hint">
        邮箱 / 手机号 / 学生教师认证 / 设备管理：观复自建账号体系，【暂定】不做（11 号 §5 槽位简化）。
      </div>
    </div>
  );
}

/* ---------------- 通用设置（11 号 §2.2 观复槽位：外观/语言/AI 供应商） ---------------- */

function GeneralPane() {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const iconSet = useStore((s) => s.iconSet);
  const setIconSet = useStore((s) => s.setIconSet);
  const fontTheme = useStore((s) => s.fontTheme);
  const setFontTheme = useStore((s) => s.setFontTheme);
  const { lang, setLang, t } = useLang();

  return (
    <div className="setpane">
      <div className="setpane__row">
        <label className="setpane__label">主题</label>
        <button className="btn btn--sm" onClick={toggleTheme}>
          {theme === "light" ? "浅色" : "深色"}
        </button>
      </div>
      <div className="setpane__row">
        <label className="setpane__label">语言</label>
        <select
          className="select setpane__select"
          value={lang}
          onChange={(e) => setLang(e.target.value as typeof lang)}
        >
          <option value="zh">简体中文</option>
          <option value="en">English</option>
        </select>
      </div>
      <div className="setpane__row">
        <label className="setpane__label">字体</label>
        <select
          className="select setpane__select"
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
      <div className="setpane__row">
        <label className="setpane__label">图标风格</label>
        <select
          className="select setpane__select"
          value={iconSet}
          onChange={(e) => setIconSet(e.target.value as IconSetId)}
        >
          {ICON_SETS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="setpane__sep" />
      <div className="setpane__hint">
        「AI 模型」槽位原位替换为观复独有「AI 供应商设置」（11 号 §5）；通知偏好按观复能力裁剪【暂定】不做。
      </div>
    </div>
  );
}

/* ---------------- 空间设置 → 同步与凭证（11 号 §5 观复独有槽位替换） ---------------- */

function SyncPane() {
  const syncStatus = useStore((s) => s.syncStatus);
  const [server, setServer] = useState("");
  const [token, setToken] = useState("");

  useEffect(() => {
    void loadClipServerUrl().then(setServer);
    void loadClipToken().then(setToken);
  }, []);

  return (
    <div className="setpane">
      <div className="setpane__row">
        <label className="setpane__label">同步状态</label>
        <span className="setpane__value">
          {syncStatus.busy
            ? "同步中…"
            : syncStatus.lastSyncAt
              ? `上次同步 ${new Date(syncStatus.lastSyncAt).toLocaleString("zh-CN", { hour12: false })}`
              : "尚未同步"}
          {syncStatus.pending > 0 && ` · 待同步 ${syncStatus.pending} 条`}
          {syncStatus.conflicts > 0 && ` · 冲突 ${syncStatus.conflicts} 条`}
        </span>
      </div>
      <div className="setpane__row">
        <label className="setpane__label">服务端地址</label>
        <input
          className="clip-input setpane__input"
          value={server}
          placeholder="http://127.0.0.1:8787"
          onChange={(e) => setServer(e.target.value)}
          onBlur={() => void saveClipServerUrl(server)}
          spellCheck={false}
        />
      </div>
      <div className="setpane__row">
        <label className="setpane__label">访问 Token</label>
        <input
          className="clip-input setpane__input"
          type="password"
          value={token}
          placeholder="服务端设了 CLIP_TOKEN 才需要"
          onChange={(e) => setToken(e.target.value)}
          onBlur={() => void saveClipToken(token)}
          spellCheck={false}
        />
      </div>
      <div className="setpane__hint">
        「空间信息 / 空间设置」槽位原位替换为观复独有「同步与凭证」（11 号 §5）：剪藏服务端地址 / Token / 同步状态。
      </div>
    </div>
  );
}

/* ---------------- 公开分享（11 号 §2.4：观复单机自托管 → 空态） ---------------- */

function PublicSharePane() {
  return (
    <div className="setpane">
      <div className="setpane__hint">
        观复单机自托管，无公开主页（11 号 §5：删除或最小化）。如需分享单页，用页面 ⚡ 分享链接。
      </div>
    </div>
  );
}

/* ---------------- MCP & SKILL（11 号 §2.5：观复 mcp.ts 的设置入口，保留槽位） ---------------- */

function McpPane() {
  const iconSet = useStore((s) => s.iconSet);
  return (
    <div className="setpane">
      <div className="setpane__hint">
        FlowUs 已把 MCP 做进设置一级导航——观复的 <code>mcp.ts</code> 有现成对标（11 号 §2.5），内页形态重做期补采。
      </div>
    </div>
  );
}

function PlaceholderPane({ text }: { text: string }) {
  return <div className="setpane"><div className="setpane__hint">{text}</div></div>;
}
