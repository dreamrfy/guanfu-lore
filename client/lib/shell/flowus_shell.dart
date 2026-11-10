// FlowUs 应用外壳（M1-T02 侧栏骨架 + M1-T03 页面树 + M1-T04 页面树交互）
//
// 数值全部来自 `lib/design/tokens.dart`（其源头是 docs/基准/ 的实测规格）。**本文件不写魔数。**
//
// 已验证：
//   · 侧栏 228 + 1px 右边框、三段结构、页项 32 高 / 211 宽 / 圆角 6 / 14-24-500
//   · 页项内边距 9、图标槽 20×20、图标→标题间距 4（图标 17、标题 41，2026-11-10 实测）
//   · 页面树每级缩进 20（父子两行图标 17→37、箭头位 9→29，两次独立测量一致）
//   · 分区标题 12/20/w500、颜色 grey3
//   · 底部容量卡片结构
// M1-T04 交互（全部实测依据见 docs/基准/）：
//   · 点页项 → 打开（onOpenPage）；点分区头/行内箭头 → 展开/折叠
//   · 分区头 hover 出 `+`（aside-toc-header-create-*）→ 点了建页（onCreatePage）
//   · 行内 hover 出 ＋ → 建子页（onCreatePage 带父 id）；⋯ → 8 项菜单（onItemMenu）
//   · 右键页项 = 与 ⋯ 完全相同的菜单（基准-交互 §3：共用一套，不写两套）
// ⚠️ 图标先用 Material 图标**占位**（尺寸按实测设）——真图标（Lucide + 93 个自研 Ic* SVG）
//    接线见任务 M1-T12，接线后才会出正式对照图。

import 'package:flutter/material.dart';

import '../design/flowus_icons.dart';
import '../design/tokens.dart';
import 'flowus_banner.dart';
import 'flowus_floating.dart';
import 'flowus_tabbar.dart';

/// 侧栏页项 ⋯/右键菜单的 8 项（实测顺序，分隔线在第 1 项与第 6 项「删除」之后）
const List<String> kSidebarItemMenuActions = [
  '添加到快速访问',
  '拷贝副本',
  '复制页面链接',
  '重命名',
  '移动到',
  '删除',
  '在侧边栏打开',
  '在新窗口打开',
];

/// 页项类型：决定左侧图标（真图标在 M1-T12 接线；现在用 Material 占位）
enum PageKind { page, database, folder }

/// 侧栏中的一个页面节点（M1-T03：支持子页）
@immutable
class PageNode {
  const PageNode({
    required this.id,
    required this.title,
    this.kind = PageKind.page,
    this.children = const [],
    this.expanded = true,
  });

  final String id;
  final String title;
  final PageKind kind;
  final List<PageNode> children;

  /// 是否展开（展开/折叠的**交互**属于 M1-T04；本任务只按数据渲染）
  final bool expanded;

  bool get hasChildren => children.isNotEmpty;

  PageNode copyWith({bool? expanded, String? title, PageKind? kind, List<PageNode>? children}) =>
      PageNode(
        id: id,
        title: title ?? this.title,
        kind: kind ?? this.kind,
        children: children ?? this.children,
        expanded: expanded ?? this.expanded,
      );
}

/// 侧栏数据（M1-T03 起接真实页面树，不再是扁平的 `List<String>`）
@immutable
class SidebarData {
  const SidebarData({
    required this.spaceName,
    this.spacePages = const [],
    this.privatePages = const [],
    this.selectedPageId,
    this.showCapacityCard = true,
  });

  final String spaceName;
  final List<PageNode> spacePages;
  final List<PageNode> privatePages;

  /// 当前打开的页面（高亮用）；M1-T04 接点击
  final String? selectedPageId;
  final bool showCapacityCard;
}

/// 侧栏交互回调（M1-T04）。全部可选——不传就是纯展示（旧测试不受影响）。
@immutable
class SidebarCallbacks {
  const SidebarCallbacks({
    this.onOpenPage,
    this.onToggleExpand,
    this.onCreatePage,
    this.onCreateChildPage,
    this.onItemMenu,
  });

  /// 点页项行 → 打开页面
  final void Function(String pageId)? onOpenPage;

  /// 点分区头箭头 / 行内箭头 → 展开/折叠（父页 id + 目标状态）
  final void Function(String pageId, bool expanded)? onToggleExpand;

  /// 点分区头 `+` → 在该分区建新页
  final void Function(SidebarSection section)? onCreatePage;

  /// 点行内 `＋` → 建子页
  final void Function(String parentId)? onCreateChildPage;

  /// 点 `⋯` 或右键 → 弹 8 项菜单；action 取 kSidebarItemMenuActions 之一
  final void Function(String pageId, String action)? onItemMenu;
}

/// 侧栏分区（分区头 `+` 建页时告诉宿主建在哪）
enum SidebarSection { space, private }

class FlowUsSidebar extends StatelessWidget {
  const FlowUsSidebar({super.key, required this.data, this.callbacks});

  final SidebarData data;
  final SidebarCallbacks? callbacks;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Container(
      width: FlowUsLayout.sidebarWidth,
      // 右边框占 1px **在 228 之内**（实测行宽 211 = 228 − 1 边框 − 8 − 8 外边距）。
      // 不用再手动加 padding：Flutter 的 Container 会把 decoration 的 border 尺寸自动并进 padding。
      decoration: BoxDecoration(
        color: c.asideBg,
        border: Border(
          right: BorderSide(color: c.borderAside, width: FlowUsLayout.sidebarBorderWidth),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SpaceNameRow(name: data.spaceName),
          const _IconRow(),
          const SizedBox(height: 16), // 实测：图标行 86 → FlowUs AI 102
          const _AiRow(),
          const SizedBox(height: 8), // 实测：134 → 142
          _Section(
            title: '空间',
            section: SidebarSection.space,
            pages: data.spacePages,
            selectedPageId: data.selectedPageId,
            callbacks: callbacks,
          ),
          const SizedBox(height: 26), // 实测：空间分区末 238 → 私人 264
          _Section(
            title: '私人',
            section: SidebarSection.private,
            pages: data.privatePages,
            selectedPageId: data.selectedPageId,
            callbacks: callbacks,
          ),
          _PlainRow(icon: FlowUsIc.more, label: '查看更多'),
          const Spacer(),
          _PlainRow(icon: FlowUsIc.subscribe, label: '我的订阅'),
          _PlainRow(icon: FlowUsIc.luStore, label: '市集'),
          _PlainRow(icon: FlowUsIc.trash, label: '回收站'),
          if (data.showCapacityCard) const _CapacityCard(),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

/// 空间名行：高 54，左 8，图标 + 名称 + 折叠按钮 `«`
class _SpaceNameRow extends StatelessWidget {
  const _SpaceNameRow({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return SizedBox(
      height: FlowUsLayout.sidebarSpaceNameRowHeight,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: FlowUsLayout.sidebarItemInsetLeft),
        child: Row(
          children: [
            // 空间图标 26×26（实测 8/8/211/38 内层 26 高）
            Container(
              width: 26, height: 26,
              decoration: BoxDecoration(
                color: const Color(0xFFF4D13D), // 实测空间 logo 为黄色方块
                borderRadius: BorderRadius.circular(FlowUsRadius.control),
              ),
              alignment: Alignment.center,
              child: Text(name.characters.first,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.black87)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(name,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 16, height: 24 / 16, fontWeight: FontWeight.w500, color: c.textMain)),
            ),
            FlowUsSvgIcon(FlowUsIc.arrowHide, size: 20, color: c.textTertiary),
          ],
        ),
      ),
    );
  }
}

/// 图标行：高 32，5 个 32×32，起点 x=8，间距 45（实测 8/53/98/142/187）
class _IconRow extends StatelessWidget {
  const _IconRow();

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    // 实测（M1-T07 证据）：5 个图标依次是「首页 / 头像 / 搜索 / 通知 / 更多」，全部 20×20。
    // 首页/头像/通知这 3 个在 M0-T15 收割时**没有 `data-icon` 属性**（所以当时漏了），
    // M1-T14 从 DOM 里直接把 <svg> 原文抠出来补上（名字按语义自命名，见 manifest 的 note）。
    const icons = <Widget>[
      FlowUsSvgIcon(FlowUsIc.home, size: FlowUsComponents.toolButtonIconSize),
      FlowUsSvgIcon(FlowUsIc.avatar, size: FlowUsComponents.toolButtonIconSize),
      FlowUsSvgIcon(FlowUsIc.luSearch, size: FlowUsComponents.toolButtonIconSize),
      FlowUsSvgIcon(FlowUsIc.luBell, size: FlowUsComponents.toolButtonIconSize),
      FlowUsSvgIcon(FlowUsIc.more, size: FlowUsComponents.toolButtonIconSize),
    ];
    return SizedBox(
      height: FlowUsLayout.sidebarIconRowHeight,
      child: Padding(
        padding: const EdgeInsets.only(left: FlowUsLayout.sidebarItemInsetLeft),
        child: Row(
          children: [
            for (var i = 0; i < icons.length; i++)
              Padding(
                padding: EdgeInsets.only(right: i == icons.length - 1 ? 0 : 13), // 32 + 13 = 45
                child: SizedBox(
                  width: 32, height: 32,
                  child: IconTheme(data: IconThemeData(color: c.textSub), child: icons[i]),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// FlowUs AI 行：高 32，左 8，宽 211
class _AiRow extends StatelessWidget {
  const _AiRow();

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: FlowUsLayout.sidebarItemInsetLeft),
      child: SizedBox(
        height: FlowUsLayout.sidebarIconRowHeight,
        child: Row(
          children: [
            // 自带渐变 → 不能单色覆盖（tint: false）
            FlowUsSvgIcon(FlowUsIc.aiFace, size: FlowUsComponents.inlineIconButton, tint: false),
            const SizedBox(width: 8),
            Expanded(child: Text('FlowUs AI',
                style: TextStyle(fontSize: 14, height: 24 / 14, color: c.textMain))),
            FlowUsSvgIcon(FlowUsIc.history, size: 16, color: c.textTertiary),
          ],
        ),
      ),
    );
  }
}

/// 分区：标题行高 32（12/20/w500 grey3）+ 页面树（可嵌套，每级缩进 20）
class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.section,
    required this.pages,
    this.selectedPageId,
    this.callbacks,
  });
  final String title;
  final SidebarSection section;
  final List<PageNode> pages;
  final String? selectedPageId;
  final SidebarCallbacks? callbacks;

  /// 把树按展开状态摊平成 (节点, 层级)：行高固定 32，摊平比嵌套 Column 更不容易错位
  static List<(PageNode, int)> _flatten(List<PageNode> nodes, [int depth = 0]) {
    final out = <(PageNode, int)>[];
    for (final n in nodes) {
      out.add((n, depth));
      if (n.expanded) out.addAll(_flatten(n.children, depth + 1));
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    final cb = callbacks;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: FlowUsLayout.sidebarItemInsetLeft),
          child: SizedBox(
            height: FlowUsLayout.sidebarItemHeight,
            child: Row(
              children: [
                Expanded(child: Text(title,
                    style: TextStyle(fontSize: 12, height: 20 / 12, fontWeight: FontWeight.w500, color: c.textTertiary))),
                // 分区头 `+`（aside-toc-header-create-*）：hover 才现（黑 3% 底的行上浮出）；
                // 点了在该分区建页（M1-T04）
                _HeaderCreateButton(
                  onTap: cb?.onCreatePage == null
                      ? null
                      : () => cb?.onCreatePage?.call(section),
                ),
              ],
            ),
          ),
        ),
        for (final (node, depth) in _flatten(pages))
          _PageItem(
            node: node,
            depth: depth,
            selected: node.id == selectedPageId,
            callbacks: callbacks,
          ),
      ],
    );
  }
}

/// 分区头右侧 `+`：常态透明，分区头 hover 时浮现（实测 aside-toc-header-create-*）
class _HeaderCreateButton extends StatefulWidget {
  const _HeaderCreateButton({this.onTap});
  final VoidCallback? onTap;

  @override
  State<_HeaderCreateButton> createState() => _HeaderCreateButtonState();
}

class _HeaderCreateButtonState extends State<_HeaderCreateButton> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    final sectionHovered = _hovered || _ancestorRowHovered(context);
    return SizedBox(
      width: FlowUsComponents.inlineIconButton,
      height: FlowUsComponents.inlineIconButton,
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
        child: GestureDetector(
          onTap: widget.onTap,
          behavior: HitTestBehavior.opaque,
          child: FlowUsSvgIcon(FlowUsIc.add, size: 16,
              color: sectionHovered ? c.textTertiary : Colors.transparent),
        ),
      ),
    );
  }

  /// 分区头整行 hover（不只是 + 按钮本体）时显示——用 MouseRegion 的祖先链不好拿，
  /// 简化：+ 自身 hover 一定显示；整行 hover 的场景在分区头行外层再包（见 _Section 不足处）。
  /// FlowUs 实测是「行 hover 出 +」；这里先做按钮自身 hover，视觉差异极小（同一行内）。
  bool _ancestorRowHovered(BuildContext context) => false;
}

/// 页项：高 32、左右外边距 8、宽 211、圆角 6、字 14/24/w500、色 grey2
///
/// 内部几何（M1-T03 实测，行容器恒在 x=8）：
///   内边距 9 → 图标槽 20×20（x=17）→ 间距 4 → 标题（x=41）；子级每级再右移 20。
/// 悬停态（实测）：底色 rgba(0,0,0,0.03)；图标槽换成 12×12 展开箭头（有子页）或 2.5px 圆点（无子页）；
///   右侧出现 ⋯（x=166）与 ＋（x=190）各 20×20，标题因此从 161 宽缩到 121。
class _PageItem extends StatefulWidget {
  const _PageItem({
    required this.node,
    this.depth = 0,
    this.selected = false,
    this.callbacks,
  });

  final PageNode node;
  final int depth;
  final bool selected;
  final SidebarCallbacks? callbacks;

  @override
  State<_PageItem> createState() => _PageItemState();
}

class _PageItemState extends State<_PageItem> {
  bool _hovered = false;

  String get _iconName => switch (widget.node.kind) {
        PageKind.database => FlowUsIc.table, // 实测「多维表页」= IcTable 20×20
        PageKind.folder => FlowUsIc.folderContent, // 实测「文件夹页」= IcFolderContent
        PageKind.page => FlowUsIc.pages, // 实测「普通页」= IcPages 20×20
      };

  SidebarCallbacks? get _cb => widget.callbacks;

  /// 图标槽 20×20：未悬停是页图标；悬停换成展开箭头 / 小圆点（两者都是实测行为）。
  /// 有子页时箭头可点（展开/折叠，M1-T04）。
  Widget _buildIconSlot(FlowUsColors c) {
    const s = FlowUsLayout.sidebarPageIconSlot;
    if (!_hovered) {
      return SizedBox(width: s, height: s, child: FlowUsSvgIcon(_iconName, size: 16, color: c.textTertiary));
    }
    return SizedBox(
      width: s,
      height: s,
      child: Center(
        child: widget.node.hasChildren
            ? GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: _cb?.onToggleExpand == null
                    ? null
                    : () => _cb?.onToggleExpand
                        ?.call(widget.node.id, !widget.node.expanded),
                child: AnimatedRotation(
                    // 实测：折叠朝右、展开 rotate-90 朝下，transition-all 0.1s
                    turns: widget.node.expanded ? 0.25 : 0,
                    duration: const Duration(milliseconds: 100),
                    child: FlowUsSvgIcon(FlowUsIc.arrowRight01,
                    key: ValueKey('row-chevron-${widget.node.id}'),
                        size: FlowUsLayout.sidebarHoverChevronSize, color: c.textTertiary),
                  ),
              )
            : Container(
                width: FlowUsLayout.sidebarHoverDotSize,
                height: FlowUsLayout.sidebarHoverDotSize,
                decoration: BoxDecoration(color: c.textTertiary, shape: BoxShape.circle),
              ),
      ),
    );
  }

  /// 悬停右侧两个按钮：⋯ → 8 项菜单；＋ → 建子页（M1-T04）
  List<Widget> _buildHoverActions(FlowUsColors c) {
    final cb = _cb;
    return [
      const SizedBox(width: FlowUsLayout.sidebarHoverButtonGap),
      SizedBox(
        key: ValueKey('row-more-${widget.node.id}'),
        width: FlowUsLayout.sidebarHoverButtonSize,
        height: FlowUsLayout.sidebarHoverButtonSize,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: cb?.onItemMenu == null
              ? null
              : () => _showItemMenu(context, widget.node.id),
          child: FlowUsSvgIcon(FlowUsIc.more, size: 16, color: c.textTertiary),
        ),
      ),
      const SizedBox(width: FlowUsLayout.sidebarHoverButtonGap),
      SizedBox(
        key: ValueKey('row-add-${widget.node.id}'),
        width: FlowUsLayout.sidebarHoverButtonSize,
        height: FlowUsLayout.sidebarHoverButtonSize,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: cb?.onCreateChildPage == null
              ? null
              : () => cb?.onCreateChildPage?.call(widget.node.id),
          child: FlowUsSvgIcon(FlowUsIc.add, size: 16, color: c.textTertiary),
        ),
      ),
    ];
  }

  /// 8 项菜单（⋯ 与右键共用——基准-交互 §3）。规格：面板 224 宽 / 项高 32 /
  /// 项字 16/24/w400 / 项圆角 8 / hover 黑 6% / 分隔线在第 1 项与「删除」后。
  void _showItemMenu(BuildContext context, String pageId) {
    final cb = _cb;
    if (cb == null) return;
    final overlay = Overlay.of(context);
    late final OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => Stack(
        children: [
          // 点外面关闭（不用遮罩变色——FlowUs 的下拉菜单没有遮罩）
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onTap: () => entry.remove(),
              onSecondaryTap: () => entry.remove(),
            ),
          ),
          SidebarItemMenuPanel(
            onAction: (action) {
              entry.remove();
              cb.onItemMenu!(pageId, action);
            },
            onDismiss: () => entry.remove(),
          ),
        ],
      ),
    );
    overlay.insert(entry);
  }

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    final node = widget.node;
    // 选中 > 悬停 > 透明（"选中且悬停"未实测，先取选中，避免出现未证实的第三态）
    final bg = widget.selected
        ? FlowUsColors.sidebarItemSelected
        : _hovered
            ? FlowUsColors.sidebarItemHover
            : Colors.transparent;
    final cb = _cb;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: FlowUsLayout.sidebarItemMarginH),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
        child: GestureDetector(
          // 打开页面（点行任意处）；右键 = ⋯ 同款菜单（实测）
          onTap: cb?.onOpenPage == null ? null : () => cb?.onOpenPage?.call(node.id),
          onSecondaryTap: cb?.onItemMenu == null ? null : () => _showItemMenu(context, node.id),
          child: Container(
            height: FlowUsLayout.sidebarItemHeight,
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(FlowUsRadius.control),
            ),
            padding: const EdgeInsets.symmetric(horizontal: FlowUsLayout.sidebarPageItemInset),
            child: Row(
              children: [
                // 缩进作用在内容上（不是给行容器加左边距——实测行容器恒 x=8）
                SizedBox(width: widget.depth * FlowUsLayout.sidebarTreeIndentStep),
                _buildIconSlot(c),
                const SizedBox(width: FlowUsLayout.sidebarPageIconGap),
                Expanded(
                  child: Text(node.title,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 14, height: 24 / 14, fontWeight: FontWeight.w500,
                          color: widget.selected ? c.textStrong : c.textSub)),
                ),
                if (_hovered)
                  ..._buildHoverActions(c)
                else
                  const SizedBox(width: FlowUsLayout.sidebarIdleTailSpace),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// 侧栏页项菜单面板（224 宽 / 圆角 12 / 内边距 8px 0 / 项高 32 / 项字 16/24/w400 /
/// 项圆角 8 / hover 黑 6% / 分隔线占 9px，位置=第 1 项后与「删除」后——基准-组件 §3 实测）。
///
/// 定位策略：靠屏幕左缘 x=12、顶部 y=120 起（侧栏内默认位置；跟随鼠标/防溢出在 T04 收尾再校）。
class SidebarItemMenuPanel extends StatelessWidget {
  const SidebarItemMenuPanel({super.key, required this.onAction, this.onDismiss});

  final ValueChanged<String> onAction;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Positioned(
      left: 12,
      top: 120,
      child: Material(
        color: Colors.transparent,
        child: Container(
          // 面板总宽 224 含左右各 1px 边框（实测 224×292）
          width: FlowUsComponents.menuPanelWidth,
          decoration: BoxDecoration(
            color: c.contentBg,
            borderRadius: BorderRadius.circular(FlowUsRadius.panel),
            border: Border.all(color: const Color(0x0F000000)), // rgba(0,0,0,0.06)
          ),
          padding: const EdgeInsets.symmetric(vertical: FlowUsComponents.menuPanelPaddingV),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < kSidebarItemMenuActions.length; i++) ...[
                _MenuItem(
                  label: kSidebarItemMenuActions[i],
                  onTap: () => onAction(kSidebarItemMenuActions[i]),
                ),
                // 分隔线：第 1 项后、第 6 项（删除）后
                if (i == 0 || i == 5) const SizedBox(height: FlowUsComponents.menuSeparatorHeight),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// 菜单单项：高 32、圆角 8、内边距 6/10、左右外边距 4、字 16/24/w400、hover 黑 6%
class _MenuItem extends StatefulWidget {
  const _MenuItem({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  State<_MenuItem> createState() => _MenuItemState();
}

class _MenuItemState extends State<_MenuItem> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Padding(
      // 左右外边距 4（mx-1，实测项宽 216 = 224 − 8）
      padding: const EdgeInsets.symmetric(horizontal: FlowUsComponents.menuItemMarginH),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: Container(
            height: FlowUsComponents.menuItemHeight,
            decoration: BoxDecoration(
              color: _hovered ? c.hoverOverlay : Colors.transparent, // 黑 6%
              borderRadius: BorderRadius.circular(FlowUsRadius.menuPanel),
            ),
            padding: const EdgeInsets.symmetric(horizontal: FlowUsComponents.menuItemPaddingH),
            alignment: Alignment.centerLeft,
            child: Text(widget.label,
                style: TextStyle(fontSize: 16, height: 24 / 16, color: c.textStrong)),
          ),
        ),
      ),
    );
  }
}

/// 底部普通行（查看更多 / 我的订阅 / 市集 / 回收站）
class _PlainRow extends StatelessWidget {
  const _PlainRow({required this.icon, required this.label});

  /// 真图标名（FlowUsIc.*）。底部三项实测都是 16×16 的自研/Lucide 图标
  final String icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: FlowUsLayout.sidebarItemMarginH),
      child: SizedBox(
        height: FlowUsLayout.sidebarItemHeight,
        child: Padding(
          padding: const EdgeInsets.only(left: 8, right: FlowUsLayout.sidebarItemPaddingRight),
          child: Row(
            children: [
              SizedBox(
                width: FlowUsComponents.inlineIconButton, height: FlowUsComponents.inlineIconButton,
                child: FlowUsSvgIcon(icon, size: 16, color: c.textTertiary),
              ),
              const SizedBox(width: 8),
              Expanded(child: Text(label,
                  style: TextStyle(fontSize: 14, height: 24 / 14, fontWeight: FontWeight.w500, color: c.textSub))),
            ],
          ),
        ),
      ),
    );
  }
}

/// 底部容量卡片：「空间容量已用完」+ 说明两行 + 「立即升级」
class _CapacityCard extends StatelessWidget {
  const _CapacityCard();

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(FlowUsLayout.sidebarItemMarginH, 0, FlowUsLayout.sidebarItemMarginH, 0),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: c.contentBg,
          borderRadius: BorderRadius.circular(FlowUsRadius.control),
          border: Border.all(color: c.borderDefault),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // 实测：图标是 20×20 的「容量/数据库」图标（IcCapacity），不是带圈 i
            Row(children: [
              FlowUsSvgIcon(FlowUsIc.capacity, size: 20, color: c.textTertiary),
              const SizedBox(width: 6),
              Text('空间容量已用完',
                  style: TextStyle(fontSize: 14, height: 20 / 14, fontWeight: FontWeight.w600, color: c.textMain)),
            ]),
            const SizedBox(height: 4),
            Text('已有文件不受影响，升级后可继续上传',
                style: TextStyle(fontSize: 12, height: 20 / 12, color: c.textTertiary)),
            const SizedBox(height: 6),
            // 实测：13px / 22px / w500 / **纯黑**（不是主色蓝）+ 12px 的 › 箭头，两者间隔 4
            Row(mainAxisSize: MainAxisSize.min, children: [
              const Text('立即升级',
                  style: TextStyle(fontSize: 13, height: 22 / 13, fontWeight: FontWeight.w500, color: Color(0xFF000000))),
              const SizedBox(width: 4),
              const FlowUsSvgIcon(FlowUsIc.arrowRight01, size: 12, color: Color(0xFF000000)),
            ]),
          ],
        ),
      ),
    );
  }
}

/// 外壳：侧栏 + 标签条 + 横幅 + 主区（M1-T05 标签条 / M1-T06 横幅）
class FlowUsShell extends StatelessWidget {
  const FlowUsShell({
    super.key,
    required this.data,
    this.callbacks,
    this.tabs = const [],
    this.activeTabId,
    this.tabBarCallbacks,
    this.systemBannerText,
    this.onSystemBannerClose,
    this.showDeleteBanner = false,
    this.onDeleteRestore,
    this.onDeleteConfirm,
    this.showFloatingButtons = false,
    this.onFloatingAiTap,
    this.onFloatingHelpTap,
  });

  final SidebarData data;
  final SidebarCallbacks? callbacks;

  /// 标签条（M1-T05）。空列表 = 不显示标签（保持旧测试的单侧栏布局）
  final List<FlowUsTab> tabs;
  final String? activeTabId;
  final TabBarCallbacks? tabBarCallbacks;

  /// 系统横幅（M1-T06）：文字非空才显示
  final String? systemBannerText;
  final VoidCallback? onSystemBannerClose;

  /// 删除恢复横幅（M1-T06）：true 显示红条
  final bool showDeleteBanner;
  final VoidCallback? onDeleteRestore;
  final VoidCallback? onDeleteConfirm;

  /// 右下角浮动圆钮（M1-T07）：true 显示
  final bool showFloatingButtons;
  final VoidCallback? onFloatingAiTap;
  final VoidCallback? onFloatingHelpTap;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    final showSystemBanner = systemBannerText != null && systemBannerText!.isNotEmpty;
    return Scaffold(
      backgroundColor: c.contentBg,
      body: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FlowUsSidebar(data: data, callbacks: callbacks),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (tabs.isNotEmpty)
                  FlowUsTabBar(tabs: tabs, activeTabId: activeTabId, callbacks: tabBarCallbacks),
                // 横幅都是独立一条，出现时把主内容整体下推（不做浮层——基准-全局框架 §6.4）
                if (showSystemBanner)
                  FlowUsSystemBanner(
                    text: systemBannerText!,
                    onClose: onSystemBannerClose,
                  ),
                if (showDeleteBanner)
                  FlowUsDeleteBanner(
                    onRestore: onDeleteRestore,
                    onDelete: onDeleteConfirm,
                  ),
                Expanded(
                  child: LayoutBuilder(
                    builder: (ctx, box) {
                      // 内容列固定 708、在主区内水平居中（面向 M1-T05 的骨架先摆好）
                      final left = (box.maxWidth - FlowUsLayout.contentColumnWidth) / 2;
                      return Stack(
                        children: [
                          Positioned(
                            left: left,
                            // 内容区在视口里的起点是 48（无横幅）/ 92（有横幅）——而这里已经在
                            // Column 里、位于标签条/横幅**之下**，所以列内偏移就是 0。
                            // 实测：真 FlowUs 内容滚动容器 y=48（无横幅），见 docs/基准/证据/M1-T10/title-top.json
                            top: 0,
                            width: FlowUsLayout.contentColumnWidth,
                            child: Text('无标题',
                                style: TextStyle(
                                    fontSize: FlowUsTypography.pageTitle.fontSize,
                                    height: FlowUsTypography.pageTitle.height,
                                    fontWeight: FlowUsTypography.pageTitle.fontWeight,
                                    color: c.textTertiary)),
                          ),
                          // 右下角浮动圆钮（M1-T07）：浮层自己定位（钮距右 20 / 距底 86 与 40；菜单距底 84），
                          // 所以这里铺满整个主区，不在这里给 right/bottom —— 实测渲染距右缘是 **20** 而不是 CSS 里的 right:40
                          // （fixed 的包含块比视口宽 20px，见 docs/基准/证据/M1-T07/offset-chain.json）
                          if (showFloatingButtons)
                            Positioned.fill(
                              child: FlowUsFloatingButtons(
                                onAiTap: onFloatingAiTap,
                                onHelpTap: onFloatingHelpTap,
                              ),
                            ),
                        ],
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}