/**
 * 图标层
 *
 * 为什么这么做：需求是"图标可整套切换"（M8-09）。
 * 做法 = Iconify 的**离线**用法：把几套开源图标库的**用得到的那部分**打进包（不联网取图标），
 * 再用一张"语义名 → 各库图标名"的映射表切换。
 *
 * ⚠️ 不要直接 import 各家图标库的整包 icons.json（那是约 12MB 的全量数据）。
 *    一律走 tools/gen-icons.mjs 生成的 icons.generated.json（只含映射表里用到的图标），
 *    该脚本已挂在 predev / prebuild 上。
 *
 * 各套授权：Lucide(ISC) / MingCute(Apache-2.0) / Phosphor(MIT) / Tabler(MIT) —— 均可自由使用。
 */
import { addCollection, Icon } from "@iconify/react";
import generated from "./icons.generated.json";
import { createElement } from "react";

// 离线注册（不请求 iconify 在线 API）
for (const collection of Object.values(generated)) {
  addCollection(collection as never);
}

export const ICON_SETS = [
  { id: "lucide", label: "Lucide", license: "ISC" },
  { id: "mingcute", label: "MingCute", license: "Apache-2.0" },
  { id: "ph", label: "Phosphor", license: "MIT" },
  { id: "tabler", label: "Tabler", license: "MIT" },
] as const;

export type IconSetId = (typeof ICON_SETS)[number]["id"];
export const DEFAULT_ICON_SET: IconSetId = "lucide";

/**
 * 语义名 → 每套库里的图标名。
 * 名字由 tools/check-icons.mjs 校验过，确保四套库里都存在（避免"某套下渲染空白"）。
 */
export const ICONS = {
  search: { lucide: "search", mingcute: "search-2-line", ph: "magnifying-glass", tabler: "search" },
  plus: { lucide: "plus", mingcute: "add-line", ph: "plus", tabler: "plus" },
  settings: { lucide: "settings", mingcute: "settings-3-line", ph: "gear-six", tabler: "settings" },
  sun: { lucide: "sun", mingcute: "sun-line", ph: "sun", tabler: "sun" },
  moon: { lucide: "moon", mingcute: "moon-line", ph: "moon", tabler: "moon" },
  file: { lucide: "file-text", mingcute: "file-line", ph: "file-text", tabler: "file-text" },
  image: { lucide: "image", mingcute: "album-line", ph: "image", tabler: "photo" },
  chevronRight: { lucide: "chevron-right", mingcute: "right-line", ph: "caret-right", tabler: "chevron-right" },
  chevronDown: { lucide: "chevron-down", mingcute: "down-line", ph: "caret-down", tabler: "chevron-down" },
  close: { lucide: "x", mingcute: "close-line", ph: "x", tabler: "x" },
  more: { lucide: "ellipsis", mingcute: "more-2-line", ph: "dots-three", tabler: "dots" },
  panelRight: { lucide: "panel-right", mingcute: "layout-right-line", ph: "sidebar-simple", tabler: "layout-sidebar-right" },
  ai: { lucide: "sparkles", mingcute: "sparkles-line", ph: "sparkle", tabler: "sparkles" },
  trash: { lucide: "trash-2", mingcute: "delete-2-line", ph: "trash", tabler: "trash" },
  home: { lucide: "house", mingcute: "home-4-line", ph: "house", tabler: "home" },
  arrowLeft: { lucide: "arrow-left", mingcute: "arrow-left-line", ph: "arrow-left", tabler: "arrow-left" },
  arrowRight: { lucide: "arrow-right", mingcute: "arrow-right-line", ph: "arrow-right", tabler: "arrow-right" },
  share: { lucide: "share-2", mingcute: "share-2-line", ph: "share", tabler: "share" },
  comment: { lucide: "message-square", mingcute: "comment-line", ph: "chat", tabler: "message" },
  bolt: { lucide: "zap", mingcute: "flash-line", ph: "lightning", tabler: "bolt" },
  refresh: { lucide: "rotate-cw", mingcute: "refresh-2-line", ph: "arrows-clockwise", tabler: "rotate" },
  user: { lucide: "user", mingcute: "user-3-line", ph: "user", tabler: "user" },
  filter: { lucide: "filter", mingcute: "filter-2-line", ph: "funnel", tabler: "filter" },
  inbox: { lucide: "inbox", mingcute: "inbox-line", ph: "tray", tabler: "inbox" },
  tag: { lucide: "tag", mingcute: "tag-line", ph: "tag", tabler: "tag" },
  star: { lucide: "star", mingcute: "star-line", ph: "star", tabler: "star" },
  table: { lucide: "table", mingcute: "table-2-line", ph: "table", tabler: "table" },
  panelLeft: { lucide: "panel-left", mingcute: "layout-left-line", ph: "sidebar", tabler: "layout-sidebar" },
  text: { lucide: "type", mingcute: "font-line", ph: "text-aa", tabler: "typography" },
  palette: { lucide: "palette", mingcute: "palette-line", ph: "palette", tabler: "palette" },
} as const satisfies Record<string, Record<IconSetId, string>>;

export type IconName = keyof typeof ICONS;

/** 取某套图标库下的完整图标 id，例如 "lucide:search" */
export function iconId(name: IconName, set: IconSetId = DEFAULT_ICON_SET): string {
  const perSet = ICONS[name];
  return `${set}:${perSet[set] ?? perSet[DEFAULT_ICON_SET]}`;
}

type AppIconProps = {
  name: IconName;
  set?: IconSetId;
  size?: number;
  className?: string;
};

export function AppIcon({ name, set = DEFAULT_ICON_SET, size = 16, className }: AppIconProps) {
  return createElement(Icon, { icon: iconId(name, set), width: size, height: size, className });
}
