// M2-T07 块手柄与「＋」验收（数值全部取基准-组件 §5.2 实测）
//
// 手柄 16×16 @左外 20 ｜ 「＋」20×20 @左外 22 ｜ 竖直差 14 ｜ 热区 36 / 12（分开）
// 跑法：cd client && flutter test test/block_handle_test.dart

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/flowus_icons.dart';
import 'package:bijiapp/editor/block_handle.dart';

Node _para() => Node(type: ParagraphBlockKeys.type);
Node _page() => Node(type: PageBlockKeys.type);

Future<void> _pump(WidgetTester tester, Node node, {double width = 400}) async {
  tester.view.physicalSize = const Size(900, 400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Padding(
        padding: const EdgeInsets.only(left: 200, top: 100),
        child: SizedBox(
          width: width,
          child: Builder(
            builder: (context) => flowUsBlockWrapper(
              context,
              node: node,
              child: const SizedBox(height: 34, child: Text('一段正文')),
            ),
          ),
        ),
      ),
    ),
  ));
  await tester.pumpAndSettle();
}

Finder _icon(String name) => find.byWidgetPredicate((w) => w is FlowUsSvgIcon && w.name == name);

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

  group('出场与几何', () {
    testWidgets('不悬停时两个控件都不出现', (tester) async {
      await _pump(tester, _para());
      expect(_icon(FlowUsIc.menu), findsNothing);
      expect(_icon(FlowUsIc.add), findsNothing);
    });

    testWidgets('悬停块 → 出现 16×16 手柄，贴在内容左外 20px', (tester) async {
      await _pump(tester, _para());
      final g = await tester.createGesture(kind: PointerDeviceKind.mouse);
      await g.addPointer(location: Offset.zero);
      addTearDown(g.removePointer);
      await g.moveTo(tester.getCenter(find.text('一段正文')));
      await tester.pumpAndSettle();

      final handle = _icon(FlowUsIc.menu);
      expect(handle, findsOneWidget);
      final rect = tester.getRect(handle);
      expect(rect.width, 16);
      expect(rect.height, 16);
      // 块左缘 = 200，手柄 left = -20 → 绝对 180
      expect(rect.left, closeTo(180, 0.5));
    });

    testWidgets('鼠标靠近块左缘（dx ≤ 12）→ 「＋」出现，且在 20×20、手柄下方 14px', (tester) async {
      await _pump(tester, _para());
      final g = await tester.createGesture(kind: PointerDeviceKind.mouse);
      await g.addPointer(location: Offset.zero);
      addTearDown(g.removePointer);
      await g.moveTo(tester.getCenter(find.text('一段正文')));
      await tester.pumpAndSettle();
      // 移到块左缘内侧 6px（块左缘 200 → x=206）
      await g.moveTo(const Offset(206, 117));
      await tester.pumpAndSettle();

      final plus = _icon(FlowUsIc.add);
      expect(plus, findsOneWidget, reason: '靠近左缘应出现 ＋');
      final rect = tester.getRect(plus);
      expect(rect.width, 20);
      expect(rect.height, 20);
      expect(rect.left, closeTo(178, 0.5)); // 200 - 22
      final handle = tester.getRect(_icon(FlowUsIc.menu));
      expect(rect.top - handle.top, closeTo(14, 0.5)); // 竖直差 14
    });

    testWidgets('鼠标在块中部（dx 大）→ 只有手柄、没有 ＋', (tester) async {
      await _pump(tester, _para());
      final g = await tester.createGesture(kind: PointerDeviceKind.mouse);
      await g.addPointer(location: Offset.zero);
      addTearDown(g.removePointer);
      await g.moveTo(tester.getCenter(find.text('一段正文')));
      await tester.pumpAndSettle();
      expect(_icon(FlowUsIc.menu), findsOneWidget);
      expect(_icon(FlowUsIc.add), findsNothing);
    });

    testWidgets('页面块不显示手柄（真 FlowUs 也没有）', (tester) async {
      await _pump(tester, _page());
      final g = await tester.createGesture(kind: PointerDeviceKind.mouse);
      await g.addPointer(location: Offset.zero);
      addTearDown(g.removePointer);
      await g.moveTo(tester.getCenter(find.text('一段正文')));
      await tester.pumpAndSettle();
      expect(_icon(FlowUsIc.menu), findsNothing);
    });

    testWidgets('移出块 → 控件消失', (tester) async {
      await _pump(tester, _para());
      final g = await tester.createGesture(kind: PointerDeviceKind.mouse);
      await g.addPointer(location: Offset.zero);
      addTearDown(g.removePointer);
      await g.moveTo(tester.getCenter(find.text('一段正文')));
      await tester.pumpAndSettle();
      expect(_icon(FlowUsIc.menu), findsOneWidget);
      await g.moveTo(const Offset(700, 50));
      await tester.pumpAndSettle();
      expect(_icon(FlowUsIc.menu), findsNothing);
    });
  });
}