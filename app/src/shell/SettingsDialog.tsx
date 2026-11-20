import { useEffect, useState } from "react";
import { useStore } from "../data/store";
import { loadClipServerUrl, saveClipServerUrl, loadClipToken, saveClipToken } from "../data/clipApi";
import { repo } from "../data/db";
import { FONT_THEMES } from "../design/fonts";
import { ICON_SETS, type IconSetId } from "../design/icons";
import { useLang } from "../i18n";

/** W100 · 设置弹层骨架（11 号 §2）：居中大弹层 ~950×660，左侧竖导航 + 右侧内容 + 右上 ×。
 *  W101 · 页签内容对齐（11 号 §5 观复槽位方案）。
 *  W102 · 商业化槽位替换（11 号 §5）执行：
 *  - 活动中心 / 推荐佣金 / 升级 / 订单 / 自定义模型 / 已授权应用 → 删除（无商业化；自定义模型已并入通用设置的 AI 供应商）
 *  - 成员 / 公开分享 → 删除（观复单机自托管，11 号 §5「删除或最小化」取删除【暂定】）
 *  - MCP & SKILL → 保留槽位（观复 mcp.ts 设置入口）
 *  - 退出登录 → 保留（凭证管理的一部分） */

export type SettingsTab =
  | "account"
  | "general"
  | "spaceSettings"
  | "mcp";

/** 11 号 §5 槽位替换后的导航：账号组 2 项 + 空间组 2 项（MCP & SKILL 保留）+ 底部退出登录 */
const NAV: { group: string; items: { id: SettingsTab; label: string }[] }[] = [
  {
    group: "账号",
    items: [
      { id: "account", label: "账号设置" },
      { id: "general", label: "通用设置" },
    ],
  },
  {
    group: "空间",
    items: [
      { id: "spaceSettings", label: "空间设置" },
      { id: "mcp", label: "MCP & SKILL" },
    ],
  },
];

/** 页签标题映射 */
const TAB_TITLE: Record<SettingsTab, string> = {
  account: "账号设置",
  general: "通用设置",
  spaceSettings: "空间设置",
  mcp: "MCP & SKILL",
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
                  className={`setdlg__item${tab === it.id ? " setdlg__item--on" : ""}`}
                  onClick={() => setTab(it.id)}
                >
                  {it.label}
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
            {tab === "mcp" && <McpPane />}
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
  const { lang, setLang } = useLang();

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

/* ---------------- MCP & SKILL（11 号 §2.5 + §5：保留槽位，观复 mcp.ts 的设置入口） ---------------- */

function McpPane() {
  return (
    <div className="setpane">
      <div className="setpane__hint">
        FlowUs 已把 MCP 做进设置一级导航——观复的 <code>mcp.ts</code> 有现成对标（11 号 §2.5），内页形态重做期补采。
      </div>
    </div>
  );
}
