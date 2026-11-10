// FlowUs 设计 token（M1-T01）
//
// **本文件是"真 FlowUs 实测值"的唯一代码落点。** 所有数值来自 docs/基准/ 的规格，
// 不允许在别处散落魔数——用界面代码时一律引用这里的常量。
//
// 规格来源（逐项可查）：
//   docs/基准/基准-全局框架.md       布局（侧栏 228 / 标签条 48 / 横幅 44 / 内容列 708）
//   docs/基准/基准-色彩.md           浅色 + 深色全套色值、语义 token
//   docs/基准/基准-字体与图标.md      字体栈、字号阶梯；图标三套（Lucide / 自研 Ic* / Google emoji）
//   docs/基准/基准-正文行高与块结构.md 块级 16/24、行内 16/26、块高 34、间距 2（DOM 层级真相）
//   docs/基准/基准-组件.md           圆角 5 档、按钮、菜单、弹层、开关、输入框
//   docs/基准/基准-交互.md           0.1s ease-out、hover 揭示三模式
//   docs/基准/基准-勾选框与斜杠菜单.md 勾选框 24×24、容器 24×26
//
// 校验：`test/design_tokens_test.dart` 对关键值做断言，防止日后被随手改掉。

import 'package:flutter/material.dart';

// ---------------------------------------------------------------------------
// 布局（基准-全局框架）
// ---------------------------------------------------------------------------

abstract final class FlowUsLayout {
  /// 侧栏宽：含 1px 右边框（内容区 227）。**任何视口都固定 228，不会变窄。**
  static const double sidebarWidth = 228;

  /// 侧栏右边框宽
  static const double sidebarBorderWidth = 1;

  /// 标签条高
  static const double tabBarHeight = 48;

  /// 系统横幅（容量提示等）高
  static const double bannerHeight = 44;

  /// 主内容区起点 y（= 标签条 48 + 横幅 44）；**无横幅时�� 48**
  static const double contentTopWithBanner = 92;
  static const double contentTopWithoutBanner = 48;

  /// 内容列固定宽（1280→2560 实测不变）
  static const double contentColumnWidth = 708;

  /// 内容列在主区内水平居中：`x = sidebarWidth + (viewportWidth - sidebarWidth - contentColumnWidth) / 2`
  static double contentColumnLeft(double viewportWidth) =>
      sidebarWidth + (viewportWidth - sidebarWidth - contentColumnWidth) / 2;

  /// 侧栏内部骨架（1920 视口实测）
  static const double sidebarSpaceNameRowHeight = 54;
  static const double sidebarIconRowHeight = 32;
  static const double sidebarItemHeight = 32; // 页项高（h-8）
  static const double sidebarItemMarginH = 8; // mx-2
  static const double sidebarItemPaddingRight = 8; // pr-2
  static const double sidebarItemInsetLeft = 8; // x=8

  /// 滚动条：**overlay 型，不占布局宽度**（实测 offsetWidth - clientWidth = 0）
  static const bool scrollbarIsOverlay = true;
}

// ---------------------------------------------------------------------------
// 圆角（基准-组件：全站只用 5 档）
// ---------------------------------------------------------------------------

abstract final class FlowUsRadius {
  static const double badge = 2; // 徽标/只读标签
  static const double menuItem = 4; // 引用 chip
  static const double control = 6; // 按钮 / 侧栏项 / 顶栏工具钮
  static const double menuPanel = 8; // 菜单项（实测 8，不是 4）
  static const double panel = 12; // 弹层 / 菜单面板
  static const double pill = 9999; // 开关 / 圆形钮
}

// ---------------------------------------------------------------------------
// 色彩（基准-色彩：浅深成对反转）
// ---------------------------------------------------------------------------

@immutable
class FlowUsColors extends ThemeExtension<FlowUsColors> {
  const FlowUsColors({
    required this.primary,
    required this.contentBg,
    required this.asideBg,
    required this.hoverOverlay,
    required this.selectedOverlay,
    required this.textMain,
    required this.textSub,
    required this.textTertiary,
    required this.textStrong,
    required this.borderDefault,
    required this.borderAside,
    required this.borderStrong,
    required this.primaryBorder,
    required this.bannerBg,
    required this.bannerBorder,
    required this.scrim,
  });

  /// 主色。**深色下不变。**
  final Color primary;
  final Color contentBg;
  final Color asideBg;

  /// 悬停底：浅色 = 黑 6%…实际上是**前景色的 6%**
  /// （浅色黑 3% 是侧栏项，菜单项是黑 6%；深色统一反过来变白 6%）
  final Color hoverOverlay;
  final Color selectedOverlay;
  final Color textMain;
  final Color textSub;
  final Color textTertiary;

  /// 语义是"最强文字"，**不是字面黑色**（深色下它是 #D4D4D4）
  final Color textStrong;
  final Color borderDefault;
  final Color borderAside;
  final Color borderStrong;
  final Color primaryBorder;
  final Color bannerBg;
  final Color bannerBorder;
  final Color scrim;

  // ---- 浅色（实测）----
  static const FlowUsColors light = FlowUsColors(
    primary: Color(0xFF0285FF),
    contentBg: Color(0xFFFFFFFF),
    asideBg: Color(0xFFF7F7F7),
    hoverOverlay: Color(0x0F000000), // 黑 6%
    selectedOverlay: Color(0x1A0285FF), // 主色 10%
    textMain: Color(0xFF37352F),
    textSub: Color(0xFF5F5E5B),
    textTertiary: Color(0xFF91918E),
    textStrong: Color(0xFF000000),
    borderDefault: Color(0xFFE5E5E5), // 实测出现 307 次，全局第一高频
    borderAside: Color(0xFFF0F0F0),
    borderStrong: Color(0xFFE0E0E0),
    primaryBorder: Color(0x4D0285FF), // 主色 30%
    bannerBg: Color(0x0D0285FF), // 主色 5%
    bannerBorder: Color(0x1A0285FF), // 主色 10%
    scrim: Color(0x33000000), // 黑 20%
  );

  // ---- 深色（实测，与浅色成对反转）----
  static const FlowUsColors dark = FlowUsColors(
    primary: Color(0xFF0285FF), // 主色不变
    contentBg: Color(0xFF191919),
    asideBg: Color(0xFF202020),
    hoverOverlay: Color(0x0FFFFFFF), // ★ 深色下是白 6%
    selectedOverlay: Color(0x1A0285FF), // 选中底不变
    textMain: Color(0xFFD4D4D4),
    textSub: Color(0xFFA0A0A0),
    textTertiary: Color(0xFF717171),
    textStrong: Color(0xFFD4D4D4), // ★ "最强文字"在深色下也是 #D4D4D4
    borderDefault: Color(0xFF2E2E2E),
    borderAside: Color(0xFF2E2E2E),
    borderStrong: Color(0xFF363636),
    primaryBorder: Color(0x4D0285FF),
    bannerBg: Color(0x0D0285FF),
    bannerBorder: Color(0x1A0285FF),
    scrim: Color(0x33000000),
  );

  /// 侧栏页项的三态（实测：常态透明 / hover 黑3% / 选中黑6% + 文字变黑）
  static const Color sidebarItemHover = Color(0x08000000); // 黑 3%
  static const Color sidebarItemSelected = Color(0x0F000000); // 黑 6%

  // 色板固定为 light / dark 两套常量，不做局部覆写；故 copyWith 原样返回。
  @override
  FlowUsColors copyWith() => this;

  // 主题切换时不做颜色插值（FlowUs 是真切换，不是渐变）。
  @override
  FlowUsColors lerp(covariant FlowUsColors? other, double t) => other ?? this;
}

// ---------------------------------------------------------------------------
// 字体（基准-字体与图标 + 基准-正文行高与块结构）
// ---------------------------------------------------------------------------

abstract final class FlowUsTypography {
  /// 字体栈**照抄**。首位的 my-quote 在真 FlowUs 里加载失败、实际回退到微软雅黑——
  /// 我们照抄栈即可，**不要换字体**（换了就不一致）。
  static const String fontFamily =
      'my-quote, "PingFang SC", "Microsoft YaHei", ui-sans-serif, -apple-system, '
      'BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, '
      '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"';

  /// 页面大标题（页顶那个 `<h1>`）—— **不是**文档内的标题块
  static const TextStyle pageTitle = TextStyle(
    fontSize: 40, height: 64 / 40, fontWeight: FontWeight.w600,
  );

  /// 文档内标题（块 type=7）—— 30/45/w600
  static const TextStyle blockHeading = TextStyle(
    fontSize: 30, height: 45 / 30, fontWeight: FontWeight.w600,
  );

  /// 正文：块级行高 24、行内行高 26（两者都要，见基准-正文行高与块结构）
  static const double bodyFontSize = 16;
  static const double bodyBlockLineHeight = 24;
  static const double bodyInlineLineHeight = 26;

  /// 代码块：字号 14、行高 21（**不是正文的 16/26**）
  static const TextStyle codeBlock = TextStyle(fontSize: 14, height: 21 / 14);

  /// 字重只有 400 / 500 / 600 三档，**没有 700**
  static const List<int> allowedFontWeights = [400, 500, 600];
}

// ---------------------------------------------------------------------------
// 块级排版（基准-块级排版 / 基准-正文行高与块结构）
// ---------------------------------------------------------------------------

abstract final class FlowUsBlockMetrics {
  /// 单行块高 = 行内行高 26 + py-1（上下各 4）
  static const double singleLineBlockHeight = 34;
  static const double blockPaddingVertical = 4; // py-1

  /// 块间距 = my-px（上下各 1）
  static const double blockMarginVertical = 1;
  static const double blockGap = 2; // 合计

  /// 列表缩进台阶
  static const double listIndent = 26;

  /// 引述块缩进（实测 15~17px，取 16）
  static const double quoteIndent = 16;

  /// 代码块缩进（实测 25）
  static const double codeBlockIndent = 25;

  /// 勾选框：图标 24×24，容器 24×26，与内容列左缘对齐
  static const double checkboxIconSize = 24;
  static const double checkboxBoxWidth = 24;
  static const double checkboxBoxHeight = 26;

  /// 块手柄（拖拽）16×16，位于内容列左外 20px
  static const double blockHandleSize = 16;
  static const double blockHandleOffset = 20;

  /// 下方插块「＋」20×20，位于内容列左外 22px
  static const double blockAddSize = 20;
  static const double blockAddOffset = 22;

  /// 悬停热区宽度（**两者不同，必须分别设**）
  static const double blockHandleHotZone = 36;
  static const double blockAddHotZone = 12;
}

// ---------------------------------------------------------------------------
// 组件尺寸（基准-组件）
// ---------------------------------------------------------------------------

abstract final class FlowUsComponents {
  static const double buttonHeight = 32;
  static const double buttonPaddingH = 12;
  static const double buttonSmallHeight = 28; // 提示条按钮 / 顶栏工具钮
  static const double toolButtonSize = 28;
  static const double toolButtonIconSize = 20;
  static const double toolButtonGap = 36;
  static const double inlineIconButton = 20; // 侧栏行内 ⋯ / ＋
  static const double floatingButton = 36; // 右下角圆形浮动钮

  static const double menuPanelWidth = 224;
  static const double menuPanelHeight8Items = 292;
  static const double menuItemHeight = 32;
  static const double menuPanelPaddingV = 8;
  static const double menuItemPaddingV = 6;
  static const double menuItemPaddingH = 10;
  static const double menuSeparatorHeight = 9; // 让行距从 32 变 41

  static const double modalMaxWidth = 1200;
  static const double modalWidthVw = 0.8; // 80vw
  static const double confirmDialogWidth = 302;
  static const double confirmDialogHeight = 170;

  static const double switchWidth = 30;
  static const double switchHeight = 18;
  static const double badgeHeight = 22;
}

// ---------------------------------------------------------------------------
// 动效（基准-交互）
// ---------------------------------------------------------------------------

abstract final class FlowUsMotion {
  /// 最普遍的一条：hover 变色 0.1s ease-out（实测 547 处）
  static const Duration hover = Duration(milliseconds: 100);
  static const Curve hoverCurve = Curves.easeOut;

  /// 透明度/颜色组：0.1s cubic-bezier(0.4, 0, 0.2, 1)（= Flutter 的 easeInOutCubicEmphasized 近似）
  static const Duration opacity = Duration(milliseconds: 100);
  static const Curve standardCurve = Cubic(0.4, 0, 0.2, 1);

  /// 全站最长 0.5s，且**无弹跳/回弹缓动**
  static const Duration longest = Duration(milliseconds: 500);
}

// ---------------------------------------------------------------------------
// 便捷入口
// ---------------------------------------------------------------------------

/// 当前主题对应的一组色值
FlowUsColors flowUsColors(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? FlowUsColors.dark : FlowUsColors.light;