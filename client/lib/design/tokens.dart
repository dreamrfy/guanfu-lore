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

  /// 标签条内部（M1-T05 补采，证据 M1-T05/toolbar.json）
  static const double tabBarPaddingH = 16; // px-4（左 244 = 228+16 / 右缘 1904 = 1920−16）
  static const double tabBarTabHeight = 32; // 标签高
  static const double tabBarTabMarginH = 8; // mx-2（首标签 x=252 = 244+8）
  static const double tabBarTabPadding = 4; // p-1（文字到标签边）
  static const double tabBarTabMaxTextWidth = 166; // max-w-[166px]
  static const double toolbarButtonSize = 28; // 图标钮 28×28
  static const double toolbarGap = 8; // 工具条元素间距（全 8）
  static const double toolbarShareWidth = 44; // 分享钮 44×32

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

  // ---- 页项内部（M1-T03 实测，2026-11-10；行容器 x=8 / w=211 / h=32）----
  //
  // 注意：类名写的是 mx-2 / pr-2（暗示 8），但**实测内边距是 9**——
  // 图标槽左缘在 x=17 = 行左 8 + 9，右侧 ⋯/＋ 右缘 210 = 行右 219 − 9。
  // 以实测为准（class 名不是可信来源）。
  static const double sidebarPageItemInset = 9;
  static const double sidebarPageIconSlot = 20; // 图标槽 20×20（SPAN@17 / 悬停换成 BUTTON@17）
  static const double sidebarPageIconGap = 4; // 图标右缘 37 → 标题左缘 41
  static const double sidebarTreeIndentStep = 20; // 每级缩进 20（父子两行：图标 17→37、箭头位 9→29）
  static const double sidebarHoverChevronSize = 12; // 悬停时图标槽里换成 12×12 展开箭头
  static const double sidebarHoverDotSize = 2.5; // 无子页的行悬停时槽里是一个 2.5×2.5 实心小圆点
  static const double sidebarHoverButtonSize = 20; // 悬停右侧 ⋯@166、＋@190，各 20×20
  static const double sidebarHoverButtonGap = 4; // 标题右缘 162 → ⋯ 166 → ＋ 190 → 右缘 210
  static const double sidebarIdleTailSpace = 8; // 未悬停时标题右侧留 8（实测标题宽 161，不是 169）

  /// 滚动条：**overlay 型，不占布局宽度**（实测 offsetWidth - clientWidth = 0）
  static const bool scrollbarIsOverlay = true;

  /// 空页类型选择器（M1-T08 补采，证据 M1-T08/blank-state.json）
  static const double blankHintHeight = 36; // 提示行 708×36
  static const double blankEntryHeight = 36; // 入口行高 36
  static const double blankEntryRadius = 4; // 入口行圆角 4
  static const double blankEntryIconSize = 20; // 入口图标 20×20
  static const double blankGroupGap = 16; // 「多维表」分组标题上间隔（462→514 = 36+16）
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

  /// ⚠️ 历史遗留：M0-T05 曾把右上工具条间距记为 36，M1-T05 现场复测**全 8**
  /// （分享 44 → 评论 28 → 快速访问 28 → ⋯ 28 → 分隔线 1 → 搜索 28，六元素 gap 全 8）。
  /// 本常量已不再被工具条使用；保留是为防其它旧引用，M1 收口时删除。
  @Deprecated('工具条间距实测是 8（toolbarGap），不是 36')
  static const double toolButtonGap = 36;

  static const double inlineIconButton = 20; // 侧栏行内 ⋯ / ＋
  static const double floatingButton = 36; // 右下角圆形浮动钮

  static const double menuPanelWidth = 224;
  static const double menuPanelHeight8Items = 292;
  static const double menuItemHeight = 32;
  static const double menuPanelPaddingV = 8;
  static const double menuItemPaddingV = 6; // 项内上下边距（py-1.5）
  static const double menuItemPaddingH = 10; // 项内左右边距（px-2.5）
  static const double menuItemMarginH = 4; // 项左右外边距（mx-1；项宽 216 = 224 − 8）
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
// 右下角浮动圆钮 + 帮助菜单（M1-T07 实测，2026-11-10）
//
// 两个圆钮：36×36、全圆、白底、1px 边框 rgba(0,0,0,0.06)、都贴右边 20。
// 上钮（FlowUs AI）距底 86、下钮（帮助）距底 40 → 两钮间距 = 86 − 40 − 36 = 10。
// 悬停实测：**底色与边框都不变**（所以悬停不做视觉变化，只换光标）。
// ---------------------------------------------------------------------------

abstract final class FlowUsFloating {
  static const double buttonSize = 36;
  static const double insetRight = 20;
  static const double aiBottom = 86; // 上钮（AI 助手）
  static const double helpBottom = 40; // 下钮（帮助）
  static const double gap = aiBottom - helpBottom - buttonSize; // 10
  static const double borderWidth = 1;
  static const Color borderColor = Color(0x0F000000); // rgba(0,0,0,0.06) = 15/255
  static const double aiIconSize = 20; // 实测 svg 20×20（渐变圆脸）
  static const double helpIconSize = 16; // 实测 IcQuestion w-4 h-4 = 16×16

  /// 帮助菜单：260×332，贴右边 20、距底 84；内边距 8/0、圆角 12、白底
  static const double menuWidth = 260;
  static const double menuInsetRight = 20;
  static const double menuBottom = 84;
  static const double menuRadius = 12;
  static const double menuPaddingV = 8;
  static const double menuItemHeight = 32; // 行距 32（文字 14/20，垂直居中）
  static const double menuItemTextInset = 39; // 文字左缘（相对菜单）
  static const double menuSeparatorInset = 17; // 分隔线左缘
  static const double menuSeparatorWidth = 226;
  static const double menuSeparatorMarginV = 4;
  static const double menuFooterHeight = 22;
  static const Color menuSeparatorColor = Color(0xFFE5E5E5);
}

// ---------------------------------------------------------------------------
// 多维表「表格视图」骨架（M4-T02 实测，2026-11-10）
//
// 实测来源：页面「微信公众号剪藏」的表格视图（live DOM 计算样式 + 横向滚动复测）。
//   · 列头高 37、行高 36（元素是 Tailwind `h-9`）、默认列宽 180、序号列 66
//   · 网格线：1px rgba(55,53,47,0.1)（列间在右缘，行间在下缘）
//   · 列头文字 14/24、#37352F、左右内边距 8
//   · 冻结：横向滚动 +320 后「序号」x=34、「标题」x=100 都没动 → **前两列冻结**
//   · 列宽拖拽手柄 4×37，贴在列右缘（`-right-0.5`），cursor: col-resize
// ---------------------------------------------------------------------------

abstract final class FlowUsTable {
  static const double columnWidth = 180;
  static const double indexColumnWidth = 66; // 序号列（No.）
  static const double headerHeight = 37;
  static const double rowHeight = 36;
  static const double gridWidth = 1;
  static const Color gridColor = Color(0x1A37352F); // rgba(55,53,47,0.1) = 26/255
  static const double cellPaddingH = 8;
  static const double headerFontSize = 14;
  static const double headerLineHeight = 24;
  static const Color headerTextColor = Color(0xFF37352F);
  static const double resizeHandleWidth = 4;
  /// 拖拽最小/最大列宽：**未实测**（只量了当前 180），先按常识给一档，等拖拽样本再收紧
  static const double minColumnWidth = 80;
  static const double maxColumnWidth = 600;

  // ---- 单元格「值渲染」（M4-T03 实测，2026-11-10）----
  /// 单选/多选胶囊：高 20、圆角 4、左右内边距 6、文字 14/20；多选之间间距 4（行容器 `space-x-1`）
  static const double pillHeight = 20;
  static const double pillRadius = 4;
  static const double pillPaddingH = 6;
  static const double pillGap = 4;
  static const double cellTextSize = 14;
  static const double cellLineHeight = 24;
  /// 日期显示形如 `2026/10/21 11:35`（实测 9999/99/99 99:99）
  static const String datePattern = 'YYYY/MM/DD HH:mm';
  /// 勾选框尺寸：**未实测**（该表没有勾选框列），暂用 16，等真样本再定
  static const double checkboxSize = 16;
}

// ---------------------------------------------------------------------------
// 回收站面板（M1-T09 实测，2026-11-10）
//
// 面板 638×608、圆角 12、白底、1px rgba(0,0,0,0.06)、阴影 rgba(25,25,25,0.04) 0 5px 8px；
// 搜索框 616×32（外面 10 边距）、底 #F7F7F7、圆角 6、输入内边距 12、14/20；
// 列头高 46（「页面」距左 15、「删除时间」距左 345）、14/20 #91918E；
// 行 612 宽、单行高 38 / 带副标题 58、圆角 4、内边距 9/7；标题 14/20 w600 #000、副标题 12/18 #91918E、
// 时间 14/20 #5F5E5B；行内两钮 20×20、间距 8、右内边距 7。
// ---------------------------------------------------------------------------

abstract final class FlowUsTrash {
  static const double panelWidth = 638;
  static const double panelHeight = 608;
  static const double panelRadius = 12;
  static const Color panelBorderColor = Color(0x0F000000);
  static const Color panelBg = Color(0xFFFFFFFF);

  static const double searchMargin = 10; // m-2.5
  static const double searchHeight = 32;
  static const double searchRadius = 6;
  static const Color searchBg = Color(0xFFF7F7F7);
  static const double searchPaddingH = 12;
  static const String searchHint = '在回收站中搜索';

  static const double columnHeaderHeight = 46;
  static const double titleColumnInset = 15; // 「页面」距列头容器左边
  static const double timeColumnInset = 345; // 「删除时间」距列头容器左边
  static const Color columnHeaderColor = Color(0xFF91918E);

  static const double rowWidth = 612;
  static const double rowSingleHeight = 38;
  static const double rowDoubleHeight = 58;
  static const double rowRadius = 4;
  static const double rowPaddingV = 9;
  static const double rowPaddingH = 7;
  static const double rowIconSize = 20;
  static const double rowIconGap = 8;
  static const double rowActionSize = 20;
  static const double rowActionGap = 8;
  static const Color rowTitleColor = Color(0xFF000000);
  static const Color rowSubtitleColor = Color(0xFF91918E);
  static const Color rowTimeColor = Color(0xFF5F5E5B);
  /// 行内动作钮到行右缘的距离：819?（实测 delete 右缘 841，行右缘 848 → 7）
  static const double rowActionInsetRight = 7;

  /// 底部「清空回收站」：**只有截图依据**（文字与位置），样式与尺寸未实测
  static const String clearLabel = '清空回收站';
  static const Color clearColor = Color(0xFF91918E);
}

// ---------------------------------------------------------------------------
// 页面封面 / 图标入口（M2-T11 实测，2026-11-10）
//
//   · 封面：**主区全宽**（实测 x=228、w=1684 即主区宽）× **高 274**，紧贴标签条下沿（y=48）
//   · 「添加图标」「添加封面」入口：文字 **14 / 20**、颜色 **#BDBDBD**、高 20，
//     位于标题上方 **22px**（实测入口 y=114、标题 y=136）；两个入口之间相隔 41（351+56 → 448）
//   · 有封面时这两个入口不再出现（只有「添加评论」）
// ---------------------------------------------------------------------------

abstract final class FlowUsPageHeader {
  static const double coverHeight = 274;
  static const Color entryColor = Color(0xFFBDBDBD);
  static const double entryFontSize = 14;
  static const double entryLineHeight = 20;
  static const double entryHeight = 20;

  /// 入口行在标题上方的距离（实测 136 − 114 = 22）
  static const double entriesAboveTitle = 22;

  /// 两个入口之间的水平间隔（351+56=407 → 448，即 41）
  static const double entriesGap = 41;

  /// 无封面时：内容区顶（y=48）到入口行（y=114）的距离 = 66
  static const double entriesTopInset = 66;

  /// 入口行底（134）到标题顶（136）的距离 = 2
  static const double entriesToTitleGap = 2;

  /// 有封面时：封面底（322）到「添加评论」入口行（379）的距离 = 57
  static const double entriesTopAfterCover = 57;

  /// 有封面时：封面底（322）到标题顶（401）的距离 = 79（= 57 + 20 + 2）
  static const double titleTopAfterCover = 79;
}

/// 选项颜色（单选/多选的胶囊配色）。实测 4 组；其余色相未采到，先不编。
abstract final class FlowUsOptionColors {
  static const _green = (bg: Color(0xFFD2ECD5), fg: Color(0xFF3B5B46));
  static const _gray = (bg: Color(0xFFECEDED), fg: Color(0xFF474D58));
  static const _pink = (bg: Color(0xFFF8DAE6), fg: Color(0xFF8B2B69));
  static const _orange = (bg: Color(0xFFF8DEC5), fg: Color(0xFF683D26));

  /// 按 FlowUs 的选项色名取配色；不认识的色名退回灰（实测存在灰）
  static ({Color bg, Color fg}) of(String? name) => switch (name) {
        'green' => _green,
        'gray' || 'grey' || 'default' => _gray,
        'pink' => _pink,
        'orange' => _orange,
        _ => _gray,
      };
}

// ---------------------------------------------------------------------------
// 便捷入口
// ---------------------------------------------------------------------------

/// 当前主题对应的一组色值
FlowUsColors flowUsColors(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? FlowUsColors.dark : FlowUsColors.light;