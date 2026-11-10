// 右下角浮动圆钮（M1-T07）
//
// 数值来源：docs/基准/证据/M1-T07/floating.json（M0-T02 证据 + 现场复测）。
// 两个 36×36 全圆白底钮：上=AI 触发（图标 20×20）、下=帮助（IcQuestion 16×16），
// fixed 右下（right 40 / bottom 40），钮间垂直 gap 10。
// 展开面板：真 FlowUs 未采到展开态 → 本轮不实现，只留回调。
// ⚠️ 图标 Material 占位（真图标 M1-T12 接线）。

import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// 右下角浮动圆钮组（由外层 Stack 的 Positioned 定位；本组件只管竖排）
class FlowUsFloatingButtons extends StatelessWidget {
  const FlowUsFloatingButtons({super.key, this.onAiTap, this.onHelpTap});

  final VoidCallback? onAiTap;
  final VoidCallback? onHelpTap;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    // 实测容器 36×92：顶部有 10 内边距（上钮 y=823 = 容器 813 + 10），钮间 gap 10
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _FloatingButton(
            onTap: onAiTap,
            // 上钮图标 20×20（AI 触发；Material 占位）
            child: Icon(Icons.auto_awesome,
                size: FlowUsComponents.toolButtonIconSize, color: c.primary),
          ),
          const SizedBox(height: 10),
          _FloatingButton(
            onTap: onHelpTap,
            // 下钮图标 16×16（IcQuestion 帮助）
            child: Icon(Icons.question_mark, size: 16, color: c.textSub),
          ),
        ],
      ),
    );
  }
}

/// 单个圆钮：36×36、全圆、白底、边框 rgba(0,0,0,0.06)
class _FloatingButton extends StatelessWidget {
  const _FloatingButton({required this.child, this.onTap});

  final Widget child;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: FlowUsComponents.floatingButton,
        height: FlowUsComponents.floatingButton,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: c.contentBg,
          border: Border.all(color: const Color(0x0F000000)), // rgba(0,0,0,0.06)
        ),
        alignment: Alignment.center,
        child: child,
      ),
    );
  }
}
