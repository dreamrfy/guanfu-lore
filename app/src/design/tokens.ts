/**
 * 设计令牌
 *
 * 数值来源：docs/基准/ 的 FlowUs 真机实测规格（M0 阶段采集）。
 * 用途：界面尺寸与配色一律走这里，避免散落在组件里拍脑袋。
 *
 * ⚠️ 待补：深色配色的实测值。M0-T03 当时没找到 FlowUs 的深色开关，
 *    所以下面的 dark 值是"合理推定"，不是实测——需要按基准补采后校准。
 */

/** 布局尺寸（像素，均取自基准规格） */
export const layout = {
  /** 侧栏固定宽度（基准：228 固定） */
  sidebarWidth: 228,
  /** 正文内容列宽度（基准：708 居中） */
  contentWidth: 708,
  /** 顶部标签条高度 */
  tabBarHeight: 40,
  /** 顶部工具条高度 */
  toolbarHeight: 44,
  /** 右侧面板宽度 */
  rightPanelWidth: 320,
  /** 页面标题字号 / 行高 / 字重（基准：40 / 64 / w600） */
  pageTitle: { size: 40, lineHeight: 64, weight: 600 },
  /** 正文（基准：16px，行内行高 26，块高 34，块间距 2） */
  body: { size: 16, lineHeight: 26, blockGap: 2 },
} as const;

export type ThemeTokens = {
  bg: string;
  bgSecondary: string;
  bgHover: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  primary: string;
};

/** 浅色（基准：文字 #37352F、次要文字 #91918E、边框 rgba(55,53,47,.09)） */
export const lightTokens: ThemeTokens = {
  bg: "#FFFFFF",
  bgSecondary: "#F7F7F5",
  bgHover: "rgba(55,53,47,0.06)",
  text: "#37352F",
  textSecondary: "#91918E",
  textTertiary: "#B7B6B1",
  border: "rgba(55,53,47,0.09)",
  primary: "#2383E2",
};

/** 深色（⚠️ 推定价，待按基准实测校准） */
export const darkTokens: ThemeTokens = {
  bg: "#191919",
  bgSecondary: "#202020",
  bgHover: "rgba(255,255,255,0.055)",
  text: "#D4D4D4",
  textSecondary: "#9B9B9B",
  textTertiary: "#6F6F6F",
  border: "rgba(255,255,255,0.094)",
  primary: "#529CCA",
};
