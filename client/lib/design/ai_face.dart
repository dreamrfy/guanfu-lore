// AI 圆脸图标（M12-T03 · 自绘，不抄任何产品私有资产）
//
// 为什么自绘：换开源图标库后，MingCute/Phosphor/Lucide 里**没有**"渐变圆脸"这种图标
// —— 那是原产品的独特视觉。开源库里最接近的是单色机器人/星星，直接用会让 AI 入口
// 变得很普通（而且单色图标在这个位置视觉重量也对不上）。
//
// 所以这里用 Flutter 原生 `DecoratedBox` + 渐变画一个圆脸：
//   · **形状是通用设计**（圆 + 两点 + 一撇），不是任何产品的专有图形
//   · **配色是蓝紫色渐变**（#6E7CFC → #A5B4FC），是通用色系，不是抄来的资产
//   · 零依赖、零授权问题、任意缩放都清晰
//
// ⚠️ 如果将来想完全用开源图标，把这里换成 `FlowUsSvgIcon(FlowUsIc.ai)` 即可，
//    代价是 AI 入口变得不那么醒目。

import 'package:flutter/material.dart';

/// AI 圆脸（渐变）
class FlowUsAiFace extends StatelessWidget {
  const FlowUsAiFace({super.key, this.size = 20});

  /// 便于测试与代码定位
  static const Key faceKey = Key('flowus-ai-face');

  final double size;

  @override
  Widget build(BuildContext context) {
    // ⚠️ 整体 IgnorePointer：这个自绘图标**不参与命中**。
    //    原因：DecoratedBox / CustomPaint 的 hitTestSelf 都返回 true，
    //    一旦命中，外层 deferToChild 的 GestureDetector 就收不到点击
    //    （Flutter 手势竞技场：child 命中 → 父级手势不触发）。
    //    命中交给**外层按钮**（_FloatingButton 的 GestureDetector）→ 那里是 opaque 的，整钮可点。
    return IgnorePointer(
      child: SizedBox(
        width: size,
        height: size,
        child: DecoratedBox(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF6E7CFC), Color(0xFF7C97FD), Color(0xFFC4DBFB)],
            stops: [0.0, 0.62, 1.0],
          ),
        ),
        child: CustomPaint(painter: _FacePainter(), size: Size.zero),
        ),
      ),
    );
  }
}

/// 脸：两只眼睛 + 一撇嘴（自绘路径）
class _FacePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 20; // 以 20 为设计基准
    final stroke = Paint()
      ..color = const Color(0xFF1F2329)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.8 * s
      ..strokeCap = StrokeCap.round;

    // 两只眼睛（竖线）
    canvas.drawLine(Offset(8.2 * s, 7.6 * s), Offset(8.2 * s, 10.6 * s), stroke);
    canvas.drawLine(Offset(13.6 * s, 7.6 * s), Offset(13.6 * s, 10.6 * s), stroke);

    // 嘴（一撇）
    canvas.drawArc(
      Rect.fromLTWH(7.4 * s, 9.4 * s, 7.0 * s, 5.2 * s),
      0.35,
      2.44,
      false,
      stroke,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
