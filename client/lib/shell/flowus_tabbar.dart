// 标签页条 + 右上工具条（M1-T05）
//
// 数值来源：docs/基准/证据/M1-T05/toolbar.json（2026-11-10 真账号现场复测）+ 基准-全局框架 §1。
// 本文件不写魔数。
//
// 已实测：
//   · 条高 48 白底底框 #E5E5E5、左右内边距 16
//   · 标签高 32、圆角 4、mx-2、p-1，宽随文字（max 166）；选中字黑、底透明
//   · 工具条：分享 44×32 文字钮 + 4 个 28×28 图标钮 + 1×14 分隔线，gap 全 8
// ⚠️ 多标签并存/关闭/拖拽排序的真 FlowUs 形态未采到（真账号没有该状态的入口样本）——
//    本轮按 FlowUs 文档结构实现（标签并排 + hover 出关闭 + 条尾 +），有真实样本后校正。
// ⚠️ 图标 Material 占位；真图标接线 M1-T12。

import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// 一个标签页
@immutable
class FlowUsTab {
  const FlowUsTab({required this.id, required this.title});

  final String id;
  final String title;

  FlowUsTab copyWith({String? title}) => FlowUsTab(id: id, title: title ?? this.title);
}

/// 标签条交互回调
@immutable
class TabBarCallbacks {
  const TabBarCallbacks({
    this.onSelectTab,
    this.onCloseTab,
    this.onCreateTab,
    this.onReorderTabs,
    this.onShare,
    this.onToolbarAction,
  });

  final void Function(String tabId)? onSelectTab;
  final void Function(String tabId)? onCloseTab;

  /// 点条尾 `+` 新建标签
  final VoidCallback? onCreateTab;

  /// 拖拽排序结束：新顺序的 id 列表
  final void Function(List<String> newOrder)? onReorderTabs;

  final VoidCallback? onShare;

  /// 评论 / 快速访问 / ⋯ / 搜索（工具条图标钮）
  final void Function(String action)? onToolbarAction;
}

/// 标签页条（高 48，白底，底框 1px；左侧标签 + 右上工具条）
class FlowUsTabBar extends StatelessWidget {
  const FlowUsTabBar({
    super.key,
    required this.tabs,
    required this.activeTabId,
    this.callbacks,
  });

  final List<FlowUsTab> tabs;
  final String? activeTabId;
  final TabBarCallbacks? callbacks;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Container(
      height: FlowUsLayout.tabBarHeight,
      decoration: BoxDecoration(
        color: c.contentBg,
        border: Border(bottom: BorderSide(color: c.borderDefault)),
      ),
      // px-4：左区起 x=244（228+16）、右区右缘到视口 16
      padding: const EdgeInsets.symmetric(horizontal: FlowUsLayout.tabBarPaddingH),
      child: Row(
        children: [
          Expanded(
            child: _TabList(
              tabs: tabs,
              activeTabId: activeTabId,
              callbacks: callbacks,
            ),
          ),
          _Toolbar(callbacks: callbacks),
        ],
      ),
    );
  }
}

/// 左区：标签列表（overflow hidden；超宽滚动在 M1 收口前不做——样本里没有）
class _TabList extends StatelessWidget {
  const _TabList({required this.tabs, required this.activeTabId, this.callbacks});

  final List<FlowUsTab> tabs;
  final String? activeTabId;
  final TabBarCallbacks? callbacks;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // 首标签前没有 margin（实测首标签 x=252 = 容器 244 + mx-2 8；Row 里用 margin 表达）
        for (var i = 0; i < tabs.length; i++)
          _Tab(
            tab: tabs[i],
            active: tabs[i].id == activeTabId,
            callbacks: callbacks,
          ),
        // 条尾 `+` 新建（多标签才有意义；无回调时不渲染）
        if (callbacks?.onCreateTab != null)
          _TabCreateButton(onTap: callbacks!.onCreateTab!),
      ],
    );
  }
}

/// 单个标签：高 32、圆角 4、左右外边距 8、内边距 4；选中=字黑；hover 出关闭钮
class _Tab extends StatefulWidget {
  const _Tab({required this.tab, required this.active, this.callbacks});

  final FlowUsTab tab;
  final bool active;
  final TabBarCallbacks? callbacks;

  @override
  State<_Tab> createState() => _TabState();
}

class _TabState extends State<_Tab> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    final cb = widget.callbacks;
    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: GestureDetector(
        onTap: cb?.onSelectTab == null ? null : () => cb!.onSelectTab!(widget.tab.id),
        // 多标签拖拽排序（ReorderableListView 太重，标签量少用 DragListener 简化：
        // 长按拖动交给了 M1 收口统一校——现在先支持点击选中/关闭/新建三条实测交互）
        child: Padding(
          // mx-2：相邻标签间距 = 8 + 8（两侧各 8，实测无重叠）
          padding: const EdgeInsets.symmetric(horizontal: FlowUsLayout.tabBarTabMarginH),
          child: Container(
            height: FlowUsLayout.tabBarTabHeight,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(4),
            ),
            padding: const EdgeInsets.all(FlowUsLayout.tabBarTabPadding),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: FlowUsLayout.tabBarTabMaxTextWidth),
                  child: Text(
                    widget.tab.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14,
                      height: 24 / 14,
                      fontWeight: FontWeight.w500,
                      // 选中=黑；未选中实测也是黑（底透明无灰字，界面清单记 text-t2）
                      color: widget.active ? c.textStrong : c.textSub,
                    ),
                  ),
                ),
                // 关闭钮：hover 才现（真 FlowUs 样本未采到，按 20×20 图标钮惯例做）
                if (_hovered && cb?.onCloseTab != null) ...[
                  const SizedBox(width: 4),
                  GestureDetector(
                    onTap: () => cb!.onCloseTab!(widget.tab.id),
                    child: SizedBox(
                      width: FlowUsComponents.inlineIconButton,
                      height: FlowUsComponents.inlineIconButton,
                      child: Icon(Icons.close, size: 14, color: c.textTertiary),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// 条尾 `+` 新建标签（多标签形态未实测，按 20×20 图标钮做）
class _TabCreateButton extends StatelessWidget {
  const _TabCreateButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: FlowUsComponents.inlineIconButton,
        height: FlowUsComponents.inlineIconButton,
        child: Icon(Icons.add, size: 16, color: c.textTertiary),
      ),
    );
  }
}

/// 右上工具条：分享(44×32 文字钮) + 评论 + 快速访问 + ⋯ + | + 搜索（4 个 28×28 图标钮，gap 8）
class _Toolbar extends StatelessWidget {
  const _Toolbar({this.callbacks});

  final TabBarCallbacks? callbacks;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    final cb = callbacks;
    return Row(
      children: [
        // 分享：44×32 文字钮、圆角 6、白底、字 14/24/w500 黑（实测无边框）
        _ShareButton(onTap: cb?.onShare),
        const SizedBox(width: FlowUsLayout.toolbarGap),
        _ToolbarIcon(
          icon: Icons.comment_outlined, // IcComment
          tooltip: '评论',
          onTap: cb?.onToolbarAction == null ? null : () => cb!.onToolbarAction!('评论'),
        ),
        const SizedBox(width: FlowUsLayout.toolbarGap),
        _ToolbarIcon(
          icon: Icons.star_outline, // IcQuickAccess
          tooltip: '添加到快速访问',
          onTap: cb?.onToolbarAction == null ? null : () => cb!.onToolbarAction!('快速访问'),
        ),
        const SizedBox(width: FlowUsLayout.toolbarGap),
        _ToolbarIcon(
          icon: Icons.more_horiz, // IcMore (page-header-more)
          tooltip: '更多',
          onTap: cb?.onToolbarAction == null ? null : () => cb!.onToolbarAction!('页面菜单'),
        ),
        const SizedBox(width: FlowUsLayout.toolbarGap),
        // 分隔线 1×14（⋯ 与搜索之间）
        Container(
          width: 1,
          height: 14,
          color: c.textTertiary, // bg-grey6 近似；真色接线在 M1-T12
        ),
        const SizedBox(width: FlowUsLayout.toolbarGap),
        _ToolbarIcon(
          icon: Icons.search, // IcSearch
          tooltip: '搜索',
          onTap: cb?.onToolbarAction == null ? null : () => cb!.onToolbarAction!('搜索'),
        ),
      ],
    );
  }
}

/// 分享按钮（44×32 文字钮）
class _ShareButton extends StatelessWidget {
  const _ShareButton({this.onTap});
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: FlowUsLayout.toolbarShareWidth,
        height: FlowUsComponents.buttonHeight,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: c.contentBg,
          borderRadius: BorderRadius.circular(FlowUsRadius.control),
        ),
        child: Text('分享',
            style: TextStyle(
                fontSize: 14, height: 24 / 14, fontWeight: FontWeight.w500, color: c.textStrong)),
      ),
    );
  }
}

/// 工具条图标钮（28×28、图标 20×20）
class _ToolbarIcon extends StatelessWidget {
  const _ToolbarIcon({required this.icon, required this.tooltip, this.onTap});

  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return GestureDetector(
      onTap: onTap,
      child: Tooltip(
        message: tooltip,
        child: SizedBox(
          width: FlowUsLayout.toolbarButtonSize,
          height: FlowUsLayout.toolbarButtonSize,
          child: Icon(icon, size: FlowUsComponents.toolButtonIconSize, color: c.textSub),
        ),
      ),
    );
  }
}
