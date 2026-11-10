// M2-T07 + M2-T21 块手柄与「＋」验收（数值全部取基准-组件 §5.2 实测）
//
// 手柄 16×16 @左外 20 ｜ 「＋」20×20 @左外 22 ｜ 竖直差 14 ｜ 热区 36 / 12（分开）
// M2-T21 起改成 overlay 层：块只做 hover 报到，图标由 FlowUsBlockHandles 画在块外。
// 跑法：cd client && flutter test test/block_handle_test.dart

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/flowus_icons.dart';
import 'package:bijiapp/editor/block_handle.dart';

Finder _icon(String name) => find.byWidgetPredicate((w) => w is FlowUsSvgIcon && w.name == name);

/// 搭一个"内容 + overlay"的迷你工作台：块放在 (200,100)，宽 400
class _Harness {
  _Harness(this.state, this.controller, this.node, this.mouse);

  final EditorState state;
  final BlockHandleController controller;
  final Node node;
  final TestGesture mouse;

  Widget build() {
    return MaterialApp(
      home: Scaffold(
        body: Stack(
          children: [
            Padding(
              padding: const EdgeInsets.only(left: 200, top: 100),
              child: SizedBox(
                width: 400,
                height: 34,
                child: Builder(
                  builder: (context) => flowUsBlockWrapper(
                    context,
                    node: node,
                    controller: controller,
                    child: const Text('一段正文'),
                  ),
                ),
              ),
            ),
            Positioned.fill(child: FlowUsBlockHandles(controller: controller)),
          ],
        ),
      ),
    );
  }
}

Future<_Harness> _pump(WidgetTester tester, {bool pageBlock = false}) async {
  tester.view.physicalSize = const Size(900, 400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final state = EditorState(document: Document.blank(withInitialText: true));
  final first = state.document.root.children.first;
  final node = pageBlock ? Node(type: PageBlockKeys.type) : first;
  final controller = BlockHandleController(editorState: state);
  // 鼠标只加一次指针（重复 addPointer 会撞 MouseTracker 断言）
  final mouse = await tester.createGesture(kind: PointerDeviceKind.mouse);
  await mouse.addPointer(location: const Offset(700, 350));
  addTearDown(mouse.removePointer);
  final h = _Harness(state, controller, node, mouse);
  await tester.pumpWidget(h.build());
  await tester.pumpAndSettle();
  return h;
}

Future<void> _mouseOn(WidgetTester tester, _Harness h, Offset at) async {
  await h.mouse.moveTo(at);
  await tester.pumpAndSettle();
}

void main() {
  group('常量与实测一致', () {
    test('手柄左外 20、＋ 左外 22、竖直差 14、热区 36/12', () {
      expect(kHandleLeftOutside, 20);
      expect(kPlusLeftOutside, 22);
      expect(kHandleToPlusGap, 14);
      expect(kHandleHotZone, 36);
      expect(kPlusHotZone, 12);
      // 热区必须是两个不同值（写成一个宽度会重现"加号点不到/乱弹"）
      expect(kHandleHotZone, isNot(kPlusHotZone));
    });
  });

  group('出场与几何（overlay 层）', () {
    testWidgets('不悬停时两个控件都不出现', (tester) async {
      final h = await _pump(tester);
      expect(h.controller.hoveredNode, isNull);
      expect(_icon(FlowUsIc.menu), findsNothing);
      expect(_icon(FlowUsIc.add), findsNothing);
    });

    testWidgets('悬停块 → 出现 16×16 手柄，画在块左外 20px（块外也能画出来）', (tester) async {
      final h = await _pump(tester);
      await _mouseOn(tester, h, tester.getCenter(find.text('一段正文')));

      final handle = _icon(FlowUsIc.menu);
      expect(handle, findsOneWidget);
      final rect = tester.getRect(handle);
      expect(rect.width, 16);
      expect(rect.height, 16);
      // 块左缘 = 200，手柄 left = -20 → 绝对 180（overlay 层画的，没有被裁剪）
      expect(rect.left, closeTo(180, 0.5));
      expect(h.controller.hoveredNode?.id, h.node.id);
    });

    testWidgets('鼠标贴块左缘（dx ≤ 12）→ 「＋」出现：20×20、左外 22、手柄下方 14', (tester) async {
      final h = await _pump(tester);
      await _mouseOn(tester, h, tester.getCenter(find.text('一段正文')));
      await _mouseOn(tester, h, const Offset(206, 117)); // 块左缘 200 + 6

      final plus = _icon(FlowUsIc.add);
      expect(plus, findsOneWidget, reason: '靠近左缘应出现 ＋');
      final rect = tester.getRect(plus);
      expect(rect.width, 20);
      expect(rect.height, 20);
      expect(rect.left, closeTo(178, 0.5)); // 200 - 22
      final handle = tester.getRect(_icon(FlowUsIc.menu));
      expect(rect.top - handle.top, closeTo(14, 0.5)); // 竖直差 14
    });

    testWidgets('鼠标在块中部 → 只有手柄、没有 ＋', (tester) async {
      final h = await _pump(tester);
      await _mouseOn(tester, h, tester.getCenter(find.text('一段正文')));
      expect(_icon(FlowUsIc.menu), findsOneWidget);
      expect(_icon(FlowUsIc.add), findsNothing);
    });

    testWidgets('页面块不显示手柄（真 FlowUs 也没有）', (tester) async {
      final h = await _pump(tester, pageBlock: true);
      await _mouseOn(tester, h, tester.getCenter(find.text('一段正文')));
      expect(_icon(FlowUsIc.menu), findsNothing);
    });

    testWidgets('移出块 → 过了淡出延时后控件消失', (tester) async {
      final h = await _pump(tester);
      await _mouseOn(tester, h, tester.getCenter(find.text('一段正文')));
      expect(_icon(FlowUsIc.menu), findsOneWidget);
      await h.mouse.moveTo(const Offset(700, 50));
      await tester.pump(const Duration(milliseconds: 40));
      expect(_icon(FlowUsIc.menu), findsOneWidget, reason: '刚离开时还在（给 120ms 挪到图标的时间）');
      await tester.pump(kHandleFadeDelay);
      expect(_icon(FlowUsIc.menu), findsNothing); // 延时到点后收掉
    });

    testWidgets('鼠标挪到左侧图标上（离开块）→ 图标不消失（过渡带保住）', (tester) async {
      final h = await _pump(tester);
      await _mouseOn(tester, h, tester.getCenter(find.text('一段正文')));
      // 直接移到手柄中心：先出块、再进过渡带
      final handleRect = tester.getRect(_icon(FlowUsIc.menu));
      await _mouseOn(tester, h, handleRect.center);
      await tester.pump(kHandleFadeDelay);
      expect(_icon(FlowUsIc.menu), findsOneWidget, reason: '在图标上不该消失');
      expect(_icon(FlowUsIc.add), findsOneWidget, reason: '在图标层时 ＋ 也应可见');
    });
  });

  group('「＋」动作', () {
    testWidgets('点 ＋ → 在当前块下面插一个空段落，并把光标放进新段落', (tester) async {
      final h = await _pump(tester);
      expect(h.state.document.root.children.length, 1);
      await _mouseOn(tester, h, tester.getCenter(find.text('一段正文')));
      await _mouseOn(tester, h, const Offset(206, 117));
      await tester.tap(_icon(FlowUsIc.add));
      await tester.pumpAndSettle();

      expect(h.state.document.root.children.length, 2);
      final added = h.state.document.root.children[1];
      expect(added.type, ParagraphBlockKeys.type);
      expect(added.delta?.toPlainText(), '');
      expect(h.state.selection?.start.path, added.path);
    });
  });
}