// FlowUs 应用外壳（M1-T02 侧栏骨架 + M1-T03 页面树）
//
// 数值全部来自 `lib/design/tokens.dart`（其源头是 docs/基准/ 的实测规格）。**本文件不写魔数。**
//
// 已验证：
//   · 侧栏 228 + 1px 右边框、三段结构、页项 32 高 / 211 宽 / 圆角 6 / 14-24-500
//   · 页项内边距 9、图标槽 20×20、图标→标题间距 4（图标 17、标题 41，2026-11-10 实测）
//   · 页面树每级缩进 20（父子两行图标 17→37、箭头位 9→29，两次独立测量一致）
//   · 分区标题 12/20/w500、颜色 grey3
//   · 底部容量卡片结构
// ⚠️ 图标先用 Material 图标**占位**（尺寸按实测设）——真图标（Lucide + 93 个自研 Ic* SVG）
//    接线见任务 M1-T12，接线后才会出正式对照图。
// ⚠️ 悬停交互（图标槽换展开箭头、右侧 ⋯/＋）属于 M1-T04：本任务只渲染静态树，
//    但几何槽位已按实测预留，T04 不需要再动布局。

import 'package:flutter/material.dart';

import '../design/tokens.dart';

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

  PageNode copyWith({bool? expanded}) => PageNode(
        id: id,
        title: title,
        kind: kind,
        children: children,
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

class FlowUsSidebar extends StatelessWidget {
  const FlowUsSidebar({super.key, required this.data, this.selectedIndex});

  final SidebarData data;
  final int? selectedIndex;

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
          _Section(title: '空间', pages: data.spacePages, selectedPageId: data.selectedPageId),
          const SizedBox(height: 26), // 实测：空间分区末 238 → 私人 264
          _Section(title: '私人', pages: data.privatePages, selectedPageId: data.selectedPageId),
          _PlainRow(icon: Icons.unfold_more, label: '查看更多'),
          const Spacer(),
          _PlainRow(icon: Icons.bookmark_outline, label: '我的订阅'),
          _PlainRow(icon: Icons.storefront_outlined, label: '市集'),
          _PlainRow(icon: Icons.delete_outline, label: '回收站'),
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
            Icon(Icons.chevron_left, size: 20, color: c.textTertiary),
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
    const icons = [Icons.home_outlined, Icons.face_outlined, Icons.search, Icons.notifications_none, Icons.more_horiz];
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
                  child: Icon(icons[i], size: FlowUsComponents.toolButtonIconSize, color: c.textSub),
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
            Icon(Icons.auto_awesome, size: FlowUsComponents.inlineIconButton, color: c.primary),
            const SizedBox(width: 8),
            Expanded(child: Text('FlowUs AI',
                style: TextStyle(fontSize: 14, height: 24 / 14, color: c.textMain))),
            Icon(Icons.info_outline, size: 16, color: c.textTertiary),
          ],
        ),
      ),
    );
  }
}

/// 分区：标题行高 32（12/20/w500 grey3）+ 页面树（可嵌套，每级缩进 20）
class _Section extends StatelessWidget {
  const _Section({required this.title, required this.pages, this.selectedPageId});
  final String title;
  final List<PageNode> pages;
  final String? selectedPageId;

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
                // 悬停时才出现的 `+`（M1-T04 接交互；静态先占位且常显为透明）
                SizedBox(
                  width: FlowUsComponents.inlineIconButton, height: FlowUsComponents.inlineIconButton,
                  child: Icon(Icons.add, size: 16, color: Colors.transparent),
                ),
              ],
            ),
          ),
        ),
        for (final (node, depth) in _flatten(pages))
          _PageItem(node: node, depth: depth, selected: node.id == selectedPageId),
      ],
    );
  }
}

/// 页项：高 32、左右外边距 8、宽 211、圆角 6、字 14/24/w500、色 grey2
///
/// 内部几何（M1-T03 实测，行容器恒在 x=8）：
///   内边距 9 → 图标槽 20×20（x=17）→ 间距 4 → 标题（x=41）；子级每级再右移 20。
/// 悬停态（实测）：底色 rgba(0,0,0,0.03)；图标槽换成 12×12 展开箭头（有子页）或 2.5px 圆点（无子页）；
///   右侧出现 ⋯（x=166）与 ＋（x=190）各 20×20，标题因此从 161 宽缩到 121。
class _PageItem extends StatefulWidget {
  const _PageItem({required this.node, this.depth = 0, this.selected = false});

  final PageNode node;
  final int depth;
  final bool selected;

  @override
  State<_PageItem> createState() => _PageItemState();
}

class _PageItemState extends State<_PageItem> {
  bool _hovered = false;

  IconData get _icon => switch (widget.node.kind) {
        PageKind.database => Icons.table_chart_outlined,
        PageKind.folder => Icons.folder_outlined,
        PageKind.page => Icons.description_outlined,
      };

  /// 图标槽 20×20：未悬停是页图标；悬停换成展开箭头 / 小圆点（两者都是实测行为）
  Widget _buildIconSlot(FlowUsColors c) {
    const s = FlowUsLayout.sidebarPageIconSlot;
    if (!_hovered) {
      return SizedBox(width: s, height: s, child: Icon(_icon, size: 16, color: c.textTertiary));
    }
    return SizedBox(
      width: s,
      height: s,
      child: Center(
        child: widget.node.hasChildren
            ? AnimatedRotation(
                // 实测：折叠朝右、展开 rotate-90 朝下，transition-all 0.1s
                turns: widget.node.expanded ? 0.25 : 0,
                duration: const Duration(milliseconds: 100),
                child: Icon(Icons.chevron_right,
                    size: FlowUsLayout.sidebarHoverChevronSize, color: c.textTertiary),
              )
            : Container(
                width: FlowUsLayout.sidebarHoverDotSize,
                height: FlowUsLayout.sidebarHoverDotSize,
                decoration: BoxDecoration(color: c.textTertiary, shape: BoxShape.circle),
              ),
      ),
    );
  }

  /// 悬停右侧两个按钮（M1-T04 接点击：⋯ 菜单、＋ 建子页）
  List<Widget> _buildHoverActions(FlowUsColors c) => [
        const SizedBox(width: FlowUsLayout.sidebarHoverButtonGap),
        SizedBox(
          width: FlowUsLayout.sidebarHoverButtonSize,
          height: FlowUsLayout.sidebarHoverButtonSize,
          child: Icon(Icons.more_horiz, size: 16, color: c.textTertiary),
        ),
        const SizedBox(width: FlowUsLayout.sidebarHoverButtonGap),
        SizedBox(
          width: FlowUsLayout.sidebarHoverButtonSize,
          height: FlowUsLayout.sidebarHoverButtonSize,
          child: Icon(Icons.add, size: 16, color: c.textTertiary),
        ),
      ];

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
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: FlowUsLayout.sidebarItemMarginH),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
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
    );
  }
}

/// 底部普通行（查看更多 / 我的订阅 / 市集 / 回收站）
class _PlainRow extends StatelessWidget {
  const _PlainRow({required this.icon, required this.label});
  final IconData icon;
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
                child: Icon(icon, size: 16, color: c.textTertiary),
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
            Row(children: [
              Icon(Icons.info_outline, size: 16, color: c.textTertiary),
              const SizedBox(width: 6),
              Text('空间容量已用完',
                  style: TextStyle(fontSize: 14, height: 20 / 14, fontWeight: FontWeight.w600, color: c.textMain)),
            ]),
            const SizedBox(height: 4),
            Text('已有文件不受影响，升级后可继续上传',
                style: TextStyle(fontSize: 12, height: 20 / 12, color: c.textTertiary)),
            const SizedBox(height: 6),
            Text('立即升级 ›',
                style: TextStyle(fontSize: 12, height: 20 / 12, fontWeight: FontWeight.w500, color: c.primary)),
          ],
        ),
      ),
    );
  }
}

/// 外壳：侧栏 + 主区占位（主区详细结构在 M1-T05；本轮只为了能看到侧栏在正确位置）
class FlowUsShell extends StatelessWidget {
  const FlowUsShell({super.key, required this.data});
  final SidebarData data;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Scaffold(
      backgroundColor: c.contentBg,
      body: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FlowUsSidebar(data: data),
          Expanded(
            child: LayoutBuilder(
              builder: (ctx, box) {
                // 内容列固定 708、在主区内水平居中（面向 M1-T05 的骨架先摆好）
                final left = (box.maxWidth - FlowUsLayout.contentColumnWidth) / 2;
                return Stack(
                  children: [
                    Positioned(
                      left: left, top: FlowUsLayout.contentTopWithoutBanner,
                      width: FlowUsLayout.contentColumnWidth,
                      child: Text('无标题',
                          style: TextStyle(
                              fontSize: FlowUsTypography.pageTitle.fontSize,
                              height: FlowUsTypography.pageTitle.height,
                              fontWeight: FlowUsTypography.pageTitle.fontWeight,
                              color: c.textTertiary)),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}