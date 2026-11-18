import { useMemo, useState } from "react";
import type { IconSetId } from "../design/icons";
import {
  EMOJI_CATEGORIES,
  ICON_CHOICES,
  PageIconGlyph,
  pageIconValue,
  parsePageIcon,
} from "../design/pageIcons";

/**
 * 页头图标选择器（W42，手册 §?：Emoji / Icons / 上传 / 链接 四页签 + 随机 / 清除 + 搜索 + 8 分类）
 *
 * - Emoji：8 分类（分类名观测未逐字录入 → 常用分类【暂定】）+ 搜索过滤 + 随机选择
 * - Icons：观复图标库语义名（108 条映射里选 16 个常用，【暂定】）
 * - 上传 / 链接：观测未给落盘方式 → 置灰（诚实占位）
 */
export function PageIconPicker({
  value,
  onChange,
  iconSet,
  size = 60,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  iconSet: IconSetId;
  /** 页头显示尺寸（emoji 字号） */
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"emoji" | "icons">("emoji");
  const [cat, setCat] = useState(EMOJI_CATEGORIES[0].id);
  const [q, setQ] = useState("");

  const parsed = parsePageIcon(value);
  const allEmojis = useMemo(() => EMOJI_CATEGORIES.flatMap((c) => c.emojis), []);
  const shown = useMemo(() => {
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      return EMOJI_CATEGORIES.flatMap((c) => c.emojis.filter((e) => e.includes(needle)));
    }
    return EMOJI_CATEGORIES.find((c) => c.id === cat)?.emojis ?? [];
  }, [q, cat]);

  return (
    <div style={{ position: "relative" }}>
      <div
        className="page__icon"
        onClick={() => setOpen((o) => !o)}
        title="设置页面图标"
        style={parsed.kind === "icon" ? { display: "flex", alignItems: "center" } : undefined}
      >
        {parsed.kind === "none" ? (
          <span style={{ fontSize: 20, color: "var(--text-tertiary)" }}>＋ 图标</span>
        ) : (
          <PageIconGlyph icon={value} size={size} set={iconSet} />
        )}
      </div>

      {open && (
        <div className="iconpicker" onMouseDown={(e) => e.stopPropagation()}>
          <div className="iconpicker__tabs">
            {(
              [
                ["emoji", "Emoji"],
                ["icons", "Icons"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={`iconpicker__tab${tab === id ? " iconpicker__tab--on" : ""}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
            <button className="iconpicker__tab" disabled title="上传图标待专项（【暂定】）">
              上传
            </button>
            <button className="iconpicker__tab" disabled title="链接图标待专项（【暂定】）">
              链接
            </button>
          </div>

          <div className="iconpicker__tools">
            <input
              className="iconpicker__search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索 emoji"
            />
            <button
              className="iconpicker__tool"
              title="随机选择"
              onClick={() => {
                const pick = allEmojis[Math.floor(Math.random() * allEmojis.length)];
                onChange(pageIconValue.fromEmoji(pick));
              }}
            >
              随机
            </button>
            <button
              className="iconpicker__tool"
              title="清除图标"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              清除
            </button>
          </div>

          {tab === "emoji" ? (
            <>
              <div className="iconpicker__cats">
                {EMOJI_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    className={`iconpicker__cat${cat === c.id && !q.trim() ? " iconpicker__cat--on" : ""}`}
                    onClick={() => {
                      setCat(c.id);
                      setQ("");
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="iconpicker__grid">
                {shown.map((emoji) => (
                  <button
                    key={emoji}
                    className="iconpicker__cell"
                    onClick={() => {
                      onChange(pageIconValue.fromEmoji(emoji));
                      setOpen(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
                {shown.length === 0 && <div className="iconpicker__empty">没有匹配的 emoji</div>}
              </div>
            </>
          ) : (
            <div className="iconpicker__grid iconpicker__grid--icons">
              {ICON_CHOICES.map((name) => (
                <button
                  key={name}
                  className="iconpicker__cell"
                  title={name}
                  onClick={() => {
                    onChange(pageIconValue.fromIcon(name));
                    setOpen(false);
                  }}
                >
                  <PageIconGlyph icon={pageIconValue.fromIcon(name)} size={18} set={iconSet} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}