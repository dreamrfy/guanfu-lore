/**
 * 字体主题
 *
 * 授权要点（对应 V3.1 决策 15 与 M12）：
 *  - ✅ 可自由打包分发的开源字体：思源黑体 / Noto Sans SC（OFL-1.1）、霞鹜文楷 LXGW WenKai（OFL-1.1）
 *  - ⚠️ 不能打包进产物的系统字体：微软雅黑 / 等线 / 楷体 / 宋体
 *    （只能"引用"，即用户机器上装了才生效，不可随软件分发）
 *
 * 当前版本先用系统字体栈跑通切换机制；开源字体文件（Noto Sans SC 子集）随后按 M12 方案放进 assets。
 */

export type FontTheme = {
  id: string;
  label: string;
  stack: string;
  /** 是否可随软件分发（false = 只能引用用户系统已装的字体） */
  bundlable: boolean;
};

export const FONT_THEMES: FontTheme[] = [
  {
    id: "noto",
    label: "思源黑体 / Noto Sans SC",
    stack: '"Noto Sans SC","Source Han Sans SC","Microsoft YaHei",system-ui,sans-serif',
    bundlable: true,
  },
  {
    id: "lxgw",
    label: "霞鹜文楷",
    stack: '"LXGW WenKai","霞鹜文楷",serif',
    bundlable: true,
  },
  {
    id: "yahei",
    label: "微软雅黑（引用系统字体）",
    stack: '"Microsoft YaHei","微软雅黑",sans-serif',
    bundlable: false,
  },
  {
    id: "dengxian",
    label: "等线（引用系统字体）",
    stack: '"DengXian","等线",sans-serif',
    bundlable: false,
  },
  {
    id: "kaiti",
    label: "楷体（引用系统字体）",
    stack: '"KaiTi","楷体",serif',
    bundlable: false,
  },
  {
    id: "simsun",
    label: "宋体（引用系统字体）",
    stack: '"SimSun","宋体",serif',
    bundlable: false,
  },
];

export const DEFAULT_FONT_THEME = "noto";

export function fontStackOf(id: string): string {
  return (FONT_THEMES.find((f) => f.id === id) ?? FONT_THEMES[0]).stack;
}
