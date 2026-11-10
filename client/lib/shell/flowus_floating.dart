// 右下角浮动圆钮 + 帮助菜单（M1-T07）
//
// 数值来源：`tokens.dart` 的 `FlowUsFloating`（2026-11-10 现场实测，见 docs/基准/证据/M1-T07/）。
// 两个 36×36 全圆：上=AI 触发（图标 20×20）、下=帮助（IcQuestion 16×16）。
//
// ⚠️ 一处**与旧证据的差异（本轮复核定案）**：旧证据记"容器 right-10 → right 40"，
//    但父链实测是 `position: fixed; right: 40px` 落在**比视口宽 20px 的包含块**里 ——
//    实际渲染 x=1864，即 1920 视口下**距右缘 20**；钮底距底 86 / 40。用户看到的是 20，按 20 实现。
//    （`docs/基准/证据/M1-T07/offset-chain.json` 有整条父链数据。）
//
// 帮助菜单：260×332、贴右 20 距底 84、圆角 12、padding 8/0；8 条纯文字条目分三组 +
// 3 条分隔线（内缩 17、宽 226、#E5E5E5）+ 版本脚注（12/18 #91918E）。
// AI 钮点开的是**右侧整块 AI 面板**（实测），属 M9，这里只留回调。
// ⚠️ 图标是 Material 占位（真图标 M1-T12 接线）。

import 'package:flutter/material.dart';

import '../design/flowus_icons.dart';
import '../design/tokens.dart';

/// 帮助菜单的一条
class HelpMenuItem {
  const HelpMenuItem(this.label);
  final String label;
}

/// 整块浮层：内部自己用 Positioned 定位（外层放在 `Positioned.fill` 里）
class FlowUsFloatingButtons extends StatefulWidget {
  const FlowUsFloatingButtons({
    super.key,
    this.onAiTap,
    this.onHelpTap,
    this.onHelpItemTap,
    this.version = 'FlowUs 1.146.0',
  });

  final VoidCallback? onAiTap;
  final VoidCallback? onHelpTap;
  final void Function(HelpMenuItem item)? onHelpItemTap;

  /// 菜单底部版本号（实测文案带版本号）
  final String version;

  /// 实测：三组条目，组间各一条分隔线
  static const List<List<HelpMenuItem>> groups = [
    [HelpMenuItem('帮助中心'), HelpMenuItem('在线客服'), HelpMenuItem('问题反馈')],
    [HelpMenuItem('更新日志'), HelpMenuItem('键盘快捷键'), HelpMenuItem('快捷命令')],
    [HelpMenuItem('导入任务列表'), HelpMenuItem('官方网站')],
  ];

  @override
  State<FlowUsFloatingButtons> createState() => _FlowUsFloatingButtonsState();
}

class _FlowUsFloatingButtonsState extends State<FlowUsFloatingButtons> {
  bool _menuOpen = false;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Stack(
      children: [
        if (_menuOpen)
          Positioned(
            right: FlowUsFloating.menuInsetRight,
            bottom: FlowUsFloating.menuBottom,
            child: _HelpMenu(
              version: widget.version,
              onItem: (item) {
                setState(() => _menuOpen = false);
                widget.onHelpItemTap?.call(item);
              },
            ),
          ),
        Positioned(
          right: FlowUsFloating.insetRight,
          bottom: FlowUsFloating.aiBottom,
          child: _FloatingButton(
            onTap: () {
              if (_menuOpen) setState(() => _menuOpen = false);
              widget.onAiTap?.call();
            },
            // 上钮图标 20×20（AI 触发；Material 占位，真图标 M1-T12）
            child: FlowUsSvgIcon(FlowUsIc.aiFill, size: FlowUsFloating.aiIconSize, color: c.primary),
          ),
        ),
        Positioned(
          right: FlowUsFloating.insetRight,
          bottom: FlowUsFloating.helpBottom,
          child: _FloatingButton(
            onTap: () {
              setState(() => _menuOpen = !_menuOpen);
              widget.onHelpTap?.call();
            },
            child: FlowUsSvgIcon(FlowUsIc.question, size: FlowUsFloating.helpIconSize, color: c.textSub),
          ),
        ),
      ],
    );
  }
}

/// 单个圆钮：36×36、全圆、白底、边框 rgba(0,0,0,0.06)。悬停**不变色**（实测）
class _FloatingButton extends StatelessWidget {
  const _FloatingButton({required this.child, this.onTap});

  final Widget child;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: FlowUsComponents.floatingButton,
          height: FlowUsComponents.floatingButton,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: c.contentBg,
            border: Border.all(color: FlowUsFloating.borderColor, width: FlowUsFloating.borderWidth),
            // 实测 class 带 `shadow-light-sm`，对照图里能明显看到柔和投影（M1-T13 并排比对时发现的）
            boxShadow: const [
              BoxShadow(color: Color(0x14000000), offset: Offset(0, 1), blurRadius: 4),
            ],
          ),
          alignment: Alignment.center,
          child: child,
        ),
      ),
    );
  }
}

class _HelpMenu extends StatelessWidget {
  const _HelpMenu({required this.version, this.onItem});

  final String version;
  final void Function(HelpMenuItem item)? onItem;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: FlowUsFloating.menuWidth,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(FlowUsFloating.menuRadius),
        boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 12, offset: Offset(0, 4))],
      ),
      padding: const EdgeInsets.symmetric(vertical: FlowUsFloating.menuPaddingV),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var g = 0; g < FlowUsFloatingButtons.groups.length; g++) ...[
            if (g > 0) const _MenuSeparator(),
            for (final item in FlowUsFloatingButtons.groups[g]) _MenuItemRow(item: item, onTap: onItem),
          ],
          const _MenuSeparator(),
          SizedBox(
            height: FlowUsFloating.menuFooterHeight,
            child: Center(
              child: Text(
                version,
                style: const TextStyle(fontSize: 12, height: 18 / 12, color: Color(0xFF91918E)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MenuItemRow extends StatelessWidget {
  const _MenuItemRow({required this.item, this.onTap});

  final HelpMenuItem item;
  final void Function(HelpMenuItem item)? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: FlowUsFloating.menuItemHeight,
      child: InkWell(
        onTap: onTap == null ? null : () => onTap!(item),
        child: Padding(
          padding: const EdgeInsets.only(left: FlowUsFloating.menuItemTextInset),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              item.label,
              // 实测：菜单文字是纯黑 #000、14/20（不是正文的 #37352F）
              style: const TextStyle(fontSize: 14, height: 20 / 14, color: Color(0xFF000000)),
            ),
          ),
        ),
      ),
    );
  }
}

class _MenuSeparator extends StatelessWidget {
  const _MenuSeparator();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: FlowUsFloating.menuSeparatorMarginV),
      padding: const EdgeInsets.only(left: FlowUsFloating.menuSeparatorInset),
      child: Container(
        width: FlowUsFloating.menuSeparatorWidth,
        height: 1,
        color: FlowUsFloating.menuSeparatorColor,
      ),
    );
  }
}