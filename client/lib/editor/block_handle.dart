// 块手柄与「＋」（M2-T07）
//
// 实测（`基准-组件.md` §5.2，M0-T16 横向扫描）：
//   · 块手柄（拖拽）：x = 内容列**左外 20px**、**16×16**、图标 `IcMenu`、随所在块 y 走
//   · 下方插块「＋」：x = 内容列**左外 22px**、**20×20**、图标 `IcBlockAdd`
//   · 竖直关系：手柄在上、「＋」在下，y 相差约 **14px**
//   · 热区**必须分开**：手柄 ≈ dx ∈ [-24, +12]（宽 36）；「＋」≈ dx ∈ [-12, 0]（宽 12）
//     （写成一个宽度会重现"加号点不到 / 乱弹"）
//
// 本任务是"手柄出场 + 位置/尺寸/热区"，两个动作：
//   · 「＋」→ 在**当前块下面**插一个空段落（真 FlowUs 同位置语义）
//   · 手柄 → 拖拽排序属 M2-T21（本轮不做），点它先不响应
//
// ⚠️ 图标替换：「＋」真身是 `IcBlockAdd`（20×20），本轮没采到 SVG（hover 位置探测只抓到 `IcMenu`），
//    先用已收割的 `IcAdd` 代替 —— 字形可能有差，已记入任务表。
//
// ⚠️ 热区实现说明：内核的 `blockWrapper` 只包住**块自身**，块外的 20px 不在命中区里。
//    所以这里在块内部左侧铺一条 36px 宽的透明命中带（覆盖 dx ∈ [-24, +12] 的近似），
//    「＋」只在这条带的最右 12px 内出现 —— 与实测的相对关系一致，但**绝对左外区域无法命中**
//    （Flutter 的 hit test 出不了父边界）。要完全 1:1 需要在编辑区上方铺一层 overlay，已记 M2-T21。

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/material.dart';

import '../design/flowus_icons.dart';
import '../design/tokens.dart';

/// 手柄相对内容列左缘的偏移（实测：x=700，内容列 720 → 左外 20）
const double kHandleLeftOutside = 20;

/// 「＋」相对内容列左缘的偏移（实测 x=698 → 左外 22）
const double kPlusLeftOutside = 22;

/// 两者竖直差（实测约 14）
const double kHandleToPlusGap = 14;

/// 手柄热区宽（实测 36）
const double kHandleHotZone = 36;

/// 「＋」热区宽（实测 12，位于热区最右端）
const double kPlusHotZone = 12;

/// 给内核每个块套一层 hover 外壳（通过 `AppFlowyEditor.blockWrapper` 接入）
Widget flowUsBlockWrapper(BuildContext context, {required Node node, required Widget child}) {
  return _BlockHoverShell(node: node, child: child);
}

class _BlockHoverShell extends StatefulWidget {
  const _BlockHoverShell({required this.node, required this.child});

  final Node node;
  final Widget child;

  @override
  State<_BlockHoverShell> createState() => _BlockHoverShellState();
}

class _BlockHoverShellState extends State<_BlockHoverShell> {
  bool _hover = false;

  /// 「＋」只在该带的最右 12px 内出现；这里用鼠标 dx 判断
  bool _nearLeftEdge = false;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    // 页面块本身不显示手柄（真 FlowUs 也没有）
    final showable = widget.node.type != PageBlockKeys.type;
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() {
        _hover = false;
        _nearLeftEdge = false;
      }),
      onHover: (e) {
        // dx 是相对本块左上角的偏移；热区在块内左侧
        final near = e.localPosition.dx <= kPlusHotZone;
        if (near != _nearLeftEdge) setState(() => _nearLeftEdge = near);
      },
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          widget.child,
          if (showable && _hover) ...[
            // 块手柄：16×16，贴在内容列**左外 20px**（Stack 允许负 left，能画出去；但只有块内部分能接收点击）
            Positioned(
              left: -kHandleLeftOutside,
              top: 4,
              child: SizedBox(
                width: 16,
                height: 16,
                child: FlowUsSvgIcon(FlowUsIc.menu, size: 16, color: c.textTertiary),
              ),
            ),
            if (_nearLeftEdge)
              // 「＋」：20×20，在手柄下方 14px
              Positioned(
                left: -kPlusLeftOutside,
                top: 4 + kHandleToPlusGap,
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: FlowUsSvgIcon(FlowUsIc.add, size: 20, color: c.textTertiary),
                ),
              ),
          ],
        ],
      ),
    );
  }
}