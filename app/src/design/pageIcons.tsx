/**
 * 页面图标体系（W42）
 *
 * 手册 §?：图标选择器 = 页签 Emoji / Icons / 上传 / 链接 + 随机选择 / 清除 + 搜索 + 8 个分类。
 * 存储格式（page.icon 字符串）：
 *  - 纯 emoji：`📄`
 *  - 图标库：`@icon:<语义名>`（语义名见 design/icons.tsx）
 * 上传/链接两类观测未给具体落盘方式 → 【暂定】暂不启用（选择器里置灰）。
 */
import { AppIcon, type IconName } from "./icons";
import type { IconSetId } from "./icons";

export type EmojiCategory = { id: string; label: string; emojis: string[] };

/** 8 个分类（手册「8 个分类」；具体分类名 FlowUs 未逐字录入 → 按常用分类【暂定】） */
export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "smileys",
    label: "表情",
    emojis: ["😀", "😄", "😊", "😉", "😍", "🤩", "😎", "🤔", "😴", "🥳", "😭", "😅", "😇", "🙃", "🤯", "🥺"],
  },
  {
    id: "gestures",
    label: "手势",
    emojis: ["👍", "👎", "👏", "🙌", "🤝", "✌️", "🤞", "👋", "🙏", "💪", "👀", "🧠", "🫶", "☝️", "✋", "🤙"],
  },
  {
    id: "nature",
    label: "自然",
    emojis: ["🌱", "🌿", "🍀", "🌵", "🌳", "🌸", "🌻", "🍁", "🌊", "⛰️", "🌙", "⭐", "☀️", "🔥", "❄️", "🌈"],
  },
  {
    id: "food",
    label: "食物",
    emojis: ["🍎", "🍊", "🍇", "🍓", "🍞", "🍰", "🍩", "☕", "🍵", "🥤", "🍜", "🍣", "🍕", "🥗", "🍺", "🍫"],
  },
  {
    id: "activity",
    label: "活动",
    emojis: ["⚽", "🏀", "🎾", "🏓", "🎯", "🎮", "🎨", "🎵", "🎬", "📷", "🏋️", "🚴", "🧘", "🎲", "🎁", "🏆"],
  },
  {
    id: "travel",
    label: "出行",
    emojis: ["🚗", "🚕", "🚌", "🚲", "✈️", "🚄", "🚀", "⛵", "🗺️", "🏠", "🏢", "🏖️", "🗼", "🌍", "🧳", "⛺"],
  },
  {
    id: "objects",
    label: "物品",
    emojis: ["💡", "🔧", "🧩", "📦", "📚", "📝", "🗂️", "📊", "💻", "⌨️", "🖊️", "🔍", "🔒", "⏰", "💎", "🧪"],
  },
  {
    id: "symbols",
    label: "符号",
    emojis: ["✅", "❌", "⚠️", "❗", "❓", "💯", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⬛", "⬜", "♻️", "🆕"],
  },
];

/** 图标库里可选的语义名（与 design/icons.tsx 的 key 对齐） */
export const ICON_CHOICES = [
  "home",
  "file",
  "search",
  "settings",
  "star",
  "tag",
  "inbox",
  "table",
  "text",
  "trash",
  "ai",
  "palette",
  "share",
  "comment",
  "bolt",
  "refresh",
] as const;

const ICON_PREFIX = "@icon:";

export type ParsedPageIcon =
  | { kind: "emoji"; value: string }
  | { kind: "icon"; value: string }
  | { kind: "none" };

export function parsePageIcon(raw: string | null | undefined): ParsedPageIcon {
  if (!raw) return { kind: "none" };
  if (raw.startsWith(ICON_PREFIX)) return { kind: "icon", value: raw.slice(ICON_PREFIX.length) };
  return { kind: "emoji", value: raw };
}

export const pageIconValue = {
  fromEmoji: (e: string) => e,
  fromIcon: (name: string) => `${ICON_PREFIX}${name}`,
};

/** 统一的页面图标渲染（页头 / 侧栏行 / 页签 / 快速访问） */
export function PageIconGlyph({
  icon,
  size = 14,
  set,
}: {
  icon: string | null | undefined;
  size?: number;
  set: IconSetId;
}) {
  const p = parsePageIcon(icon);
  if (p.kind === "none") return null;
  if (p.kind === "icon") return <AppIcon name={p.value as IconName} set={set} size={size} />;
  return <span style={{ fontSize: size, lineHeight: 1 }}>{p.value}</span>;
}