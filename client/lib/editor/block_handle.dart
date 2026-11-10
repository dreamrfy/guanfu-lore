// 块手柄与「＋」（M2-T07 出场 + M2-T21 overlay 化）
//
// 实测（`基准-组件.md` §5.2，M0-T16 横向扫描）：
//   · 块手柄（拖拽）：x = 内容列**左外 20px**、**16×16**、图标 `IcMenu`、随所在块 y 走
//   · 下方插块「＋」：x = 内容列**左外 22px**、**20×20**、图标 `IcBlockAdd`
//   · 竖直关系：手柄在上、「＋」在下，y 相差约 **14px**
//   · 热区**必须分开**：手柄 ≈ dx ∈ [-24, +12]（宽 36）；「＋」≈ dx ∈ [-12, 0]（宽 12）
//     （写成一个宽度会重现"加号点不到 / 乱弹"）
//
// M2-T07 的做法是"在块内左侧铺一条命中带"——因为 `blockWrapper` 只包住块自身，
// 块外那 20px 既画不出去（被裁剪）也点不到（hit test 出不了父边界）。
//
// **M2-T21 改成 overlay**：
//   1. 每个块只做一件事 —— 用 `MouseRegion` 把「鼠标进入哪个块、块矩形在哪」报告给 [BlockHandleController]；
//   2. `FlowUsBlockHandles` 是盖在编辑器**上方**的一层，按 hovered 块的矩形算坐标，
//      把两个图标画到内容列左外 —— 位置、可点、不被裁剪都成立；
//   3. 块与图标之间有一条 36×50 的透明"过渡带"（实测热区），鼠标从块里挪到图标上不会闪断；
//   4. 「＋」→ 在该块**下面**插一个空段落并把光标放进去；点手柄先只保留热区与回调（菜单在 M2-T08）。
//
// ⚠️ 图标替换：「＋」真身是 `IcBlockAdd`，本轮没采到 SVG，先用已收割的 `IcAdd` 代替（记在任务表）。
//
// 拖拽排序（插入指示线）仍未做 —— 已从 M2-T21 拆出为 M2-T26。

import 'dart:async';

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

/// 「＋」热区宽（实测 12，位于块左缘内侧）
const double kPlusHotZone = 12;

/// 图标相对块上缘的 y（实测手柄 top≈4）
const double kHandleTopInset = 4;

/// 手柄悬停提示（M2-T27 实测）：黑底 **90×46**、圆角 8、字 12/18 白、两行
const double kHandleTooltipWidth = 90;
const double kHandleTooltipHeight = 46;
const double kHandleTooltipRadius = 8;
const List<String> kHandleTooltipLines = ['长按拖拽', '点击打开菜单'];

/// 鼠标离开块后保持手柄的时长：够把指针挪到左侧图标上（否则一离开块就闪掉）
const Duration kHandleFadeDelay = Duration(milliseconds: 120);

/// 点手柄时给宿主的信息（块菜单的锚点）
class BlockHandleTap {
  const BlockHandleTap({required this.node, required this.blockRect, required this.handleTopLeft});

  final Node node;

  /// 块在屏幕上的矩形
  final Rect blockRect;

  /// 手柄命中盒左上角的屏幕坐标
  final Offset handleTopLeft;
}

/// 手柄/「＋」的状态中枢：块负责"报到"，overlay 负责"算位置与画"。
class BlockHandleController extends ChangeNotifier {
  BlockHandleController({required this.editorState});

  final EditorState editorState;

  Node? _node;
  GlobalKey? _anchorKey;
  bool _pointerNearEdge = false;
  bool _pointerOnLayer = false;
  Timer? _fadeTimer;

  /// 当前悬停的块（页面块不参与）
  Node? get hoveredNode => _node;

  /// 当前悬停块的锚点（用来取块矩形）
  GlobalKey? get anchorKey => _anchorKey;

  /// 鼠标是否在块左缘内侧 12px 内（决定「＋」出现）
  bool get pointerNearEdge => _pointerNearEdge;

  /// 鼠标是否已移到左侧图标/过渡带上
  bool get pointerOnLayer => _pointerOnLayer;

  /// 「＋」显示条件：靠近块左缘，或已经在图标层上
  bool get showPlus => hoveredNode != null && (_pointerNearEdge || _pointerOnLayer);

  /// 块的外壳调用：鼠标进入块
  void hoverBlock(Node node, GlobalKey anchorKey) {
    _fadeTimer?.cancel();
    if (_node?.id == node.id && _anchorKey == anchorKey) return;
    _node = node;
    _anchorKey = anchorKey;
    _pointerNearEdge = false;
    notifyListeners();
  }

  /// 块的外壳调用：鼠标离开块（可能正挪去图标 → 延迟再收）
  void leaveBlock(Node node) {
    if (_node?.id != node.id) return;
    _scheduleFade();
  }

  /// 块的外壳调用：块内水平位置变化（dx ≤ 12 视为"贴左缘"）
  void updatePointerDx(double dx) {
    final near = dx <= kPlusHotZone;
    if (near == _pointerNearEdge) return;
    _pointerNearEdge = near;
    notifyListeners();
  }

  /// overlay 的过渡带调用
  void enterLayer() {
    _fadeTimer?.cancel();
    if (_pointerOnLayer) return;
    _pointerOnLayer = true;
    notifyListeners();
  }

  /// overlay 的过渡带调用
  void leaveLayer() {
    if (!_pointerOnLayer) return;
    _pointerOnLayer = false;
    _scheduleFade();
  }

  /// 滚动、布局变化后需要重算图标位置
  void refresh() => notifyListeners();

  void _scheduleFade() {
    _fadeTimer?.cancel();
    _fadeTimer = Timer(kHandleFadeDelay, () {
      if (_pointerOnLayer) return;
      _node = null;
      _anchorKey = null;
      _pointerNearEdge = false;
      notifyListeners();
    });
  }

  /// 「＋」：在当前块下面插一个空段落，并把光标放进新段落。
  Future<void> insertParagraphAfterHovered() async {
    final node = _node;
    if (node == null || node.parent == null) return;
    final path = node.path.next;
    final transaction = editorState.transaction
      ..insertNode(path, paragraphNode())
      ..afterSelection = Selection.collapsed(Position(path: path));
    await editorState.apply(transaction);
    // 插入后 hover 目标换成新段落（鼠标通常还在原位）
    _pointerNearEdge = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _fadeTimer?.cancel();
    super.dispose();
  }
}

/// 给内核每个块套一层 hover 外壳（通过 `AppFlowyEditor.blockWrapper` 接入）
Widget flowUsBlockWrapper(
  BuildContext context, {
  required Node node,
  required Widget child,
  required BlockHandleController controller,
}) {
  return _BlockHoverAnchor(node: node, controller: controller, child: child);
}

class _BlockHoverAnchor extends StatefulWidget {
  const _BlockHoverAnchor({required this.node, required this.controller, required this.child});

  final Node node;
  final BlockHandleController controller;
  final Widget child;

  @override
  State<_BlockHoverAnchor> createState() => _BlockHoverAnchorState();
}

class _BlockHoverAnchorState extends State<_BlockHoverAnchor> {
  /// 锚点：overlay 用它的 RenderBox 取块矩形
  final GlobalKey _anchorKey = GlobalKey(debugLabel: 'block-anchor');

  @override
  Widget build(BuildContext context) {
    // 页面块本身不显示手柄（真 FlowUs 也没有）
    if (widget.node.type == PageBlockKeys.type) {
      return KeyedSubtree(key: _anchorKey, child: widget.child);
    }
    return MouseRegion(
      opaque: false,
      onEnter: (_) => widget.controller.hoverBlock(widget.node, _anchorKey),
      onHover: (e) => widget.controller.updatePointerDx(e.localPosition.dx),
      onExit: (_) => widget.controller.leaveBlock(widget.node),
      child: KeyedSubtree(key: _anchorKey, child: widget.child),
    );
  }
}

/// 盖在编辑器上方的图标层：只画两个 16/20 的小图标 + 一条透明过渡带，别的地方不挡事件。
class FlowUsBlockHandles extends StatefulWidget {
  const FlowUsBlockHandles({
    super.key,
    required this.controller,
    this.onHandleTap,
    this.onPlusTap,
  });

  final BlockHandleController controller;

  /// 点手柄 → 打开块菜单（M2-T08）；不接则点了不响应
  final ValueChanged<BlockHandleTap>? onHandleTap;

  /// 点「＋」后的附加回调（插入已由 controller 完成）
  final VoidCallback? onPlusTap;

  @override
  State<FlowUsBlockHandles> createState() => _FlowUsBlockHandlesState();
}

class _FlowUsBlockHandlesState extends State<FlowUsBlockHandles> {
  final OverlayPortalController _portal = OverlayPortalController(debugLabel: 'block-handles');

  @override
  void initState() {
    super.initState();
    // OverlayPortal 必须先 show 才有 overlay 子层；内容为空时 overlayChildBuilder 自己返回空
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _portal.show();
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) => _buildPortal(context),
    );
  }

  /// 关键：图标必须画在**内容列左外 20/22px**，而那里已经在编辑器盒子之外 ——
  /// Flutter 的 hit test 出不了父边界（画得出、点不到），所以不能做成块内 Stack。
  /// 这里用 [OverlayPortal] 把两个图标挂到根 Overlay（整屏），位置用**全局坐标**算，
  /// 于是块外也能画、也能点同时成立（M2-T07 遗留的那个限制就在这解的）。
  Widget _buildPortal(BuildContext context) {
    final c = widget.controller;
    return OverlayPortal(
      controller: _portal,
      overlayChildBuilder: (overlayContext) {
        final anchorKey = c.anchorKey;
        final anchorBox = anchorKey?.currentContext?.findRenderObject() as RenderBox?;
        if (c.hoveredNode == null || anchorBox == null || !anchorBox.attached) {
          return const SizedBox.shrink();
        }
        final anchorTopLeft = anchorBox.localToGlobal(Offset.zero);
        final colors = flowUsColors(overlayContext);
        const clusterH = kHandleToPlusGap + 20;
        return Positioned(
          left: anchorTopLeft.dx - 24, // 36 宽热区：左外 24 ~ 块内 12
          top: anchorTopLeft.dy + kHandleTopInset,
          width: kHandleHotZone,
          height: clusterH,
          child: MouseRegion(
            opaque: true,
            onEnter: (_) => c.enterLayer(),
            onExit: (_) => c.leaveLayer(),
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapUp: (details) async {
                if (details.localPosition.dy <= 16) {
                  final node = c.hoveredNode;
                  if (node != null) {
                    widget.onHandleTap?.call(BlockHandleTap(
                      node: node,
                      blockRect: anchorTopLeft & anchorBox.size,
                      handleTopLeft: Offset(anchorTopLeft.dx - kHandleLeftOutside, anchorTopLeft.dy + kHandleTopInset),
                    ));
                  }
                  return;
                }
                await c.insertParagraphAfterHovered();
                widget.onPlusTap?.call();
              },
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  // 悬停提示：贴在图标右侧对齐（实测提示右缘 = 手柄左缘）
                  if (c.pointerOnLayer)
                    Positioned(
                      left: -kHandleTooltipWidth - 4,
                      top: -3,
                      width: kHandleTooltipWidth,
                      height: kHandleTooltipHeight,
                      child: IgnorePointer(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                          decoration: BoxDecoration(
                            color: Colors.black,
                            borderRadius: BorderRadius.circular(kHandleTooltipRadius),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              for (final line in kHandleTooltipLines)
                                Text(line,
                                    style: const TextStyle(fontSize: 12, height: 18 / 12, color: Colors.white)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  // 手柄 16×16 @ 左外 20（簇内 x=4）
                  Positioned(
                    left: 4,
                    top: 0,
                    width: 16,
                    height: 16,
                    child: MouseRegion(
                      cursor: SystemMouseCursors.grab,
                      child: FlowUsSvgIcon(FlowUsIc.menu, size: 16, color: colors.textTertiary),
                    ),
                  ),
                  // 「＋」20×20 @ 左外 22（簇内 x=2）、手柄下方 14
                  if (c.showPlus)
                    Positioned(
                      left: 2,
                      top: kHandleToPlusGap,
                      width: 20,
                      height: 20,
                      child: MouseRegion(
                        cursor: SystemMouseCursors.click,
                        child: FlowUsSvgIcon(FlowUsIc.add, size: 20, color: colors.textTertiary),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
      child: const SizedBox.shrink(),
    );
  }
}
