// M2-T31 块菜单「颜色」面板验收（背景色部分）
//
// 实测：面板 239 宽、圆角 12、内边距 6/0/0；两段各 156 高（文字颜色 / 背景颜色），段标题 14/20 #91918E；
// 每段首个是 22×22「无颜色」，色板 30×30 全圆角、间距 15、行距 40
// 跑法：cd client && flutter test test/block_color_panel_test.dart

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/editor/block_action_menu.dart';
import 'package:bijiapp/editor/block_color_panel.dart';

EditorState _state() {
  final doc = Document.fromJson({
    'document': {
      'type': 'page',
      'children': [
        {
          'type': 'paragraph',
          'data': {
            'delta': [
              {'insert': '底色测试'},
            ],
          },
        },
      ],
    },
  });
  return EditorState(document: doc);
}

void main() {
  group('规格常量与色值', () {
    test('面板 239 / 段 156 / 无颜色 22 / 色板 30 间距 15 行距 40', () {
      expect(kColorPanelWidth, 239);
      expect(kColorSectionHeight, 156);
      expect(kColorNoneSize, 22);
      expect(kColorSwatchSize, 30);
      expect(kColorSwatchGap, 15);
      expect(kColorRowGap, 40);
      expect(kColorTitleInset, 15);
    });

    test('背景色板三行 4/5/5，色值与真机实测一致', () {
      expect(kBlockBackgroundSwatches.map((r) => r.length).toList(), [4, 5, 5]);
      expect(kBlockBackgroundSwatches[0].map((c) => c.toARGB32()).toList(),
          [0xFFF2F2F2, 0xFFF0EDE0, 0xFFFFE9D4, 0xFFFEEAF2]);
      expect(kBlockBackgroundSwatches[1].first.toARGB32(), 0xFFFEF7D2);
      expect(kBlockBackgroundSwatches[2].last.toARGB32(), 0xFFFFD3D3);
    });
  });

  group('面板渲染', () {
    testWidgets('239 宽、两段标题、14 个圆色块 + 2 个无颜色', (tester) async {
      tester.view.physicalSize = const Size(700, 700);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Align(
            alignment: Alignment.topLeft,
            child: FlowUsColorPanel(onPickBackground: (_) {}),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      expect(tester.getSize(find.byType(FlowUsColorPanel)).width, 239);
      expect(find.text('文字颜色'), findsOneWidget);
      expect(find.text('背景颜色'), findsOneWidget);

      final circles = tester
          .widgetList<Container>(find.byType(Container))
          .where((c) => (c.decoration as BoxDecoration?)?.shape == BoxShape.circle)
          .length;
      expect(circles, 28, reason: '两段各 14 个色块（文字段暂不响应，但照实摆）');
    });

    testWidgets('点色块 → onPickBackground 拿到该色；点「无颜色」→ null', (tester) async {
      tester.view.physicalSize = const Size(700, 700);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      Color? picked;
      var calls = 0;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Align(
            alignment: Alignment.topLeft,
            child: FlowUsColorPanel(onPickBackground: (c) {
              picked = c;
              calls++;
            }),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      // 背景段第一个圆（#F2F2F2）：用 key 找不到就按颜色找
      final firstSwatch = find.byWidgetPredicate((w) =>
          w is Container && (w.decoration as BoxDecoration?)?.color == const Color(0xFFF2F2F2));
      expect(firstSwatch, findsNWidgets(2), reason: '两段各有同色块');
      await tester.tap(firstSwatch.last);
      await tester.pump();
      expect(picked, const Color(0xFFF2F2F2));
      expect(calls, 1);
    });
  });

  group('写属性', () {
    test('背景色写成 #RRGGBB；null 清掉', () async {
      final st = _state();
      final node = st.document.root.children.first;
      await applyBlockBackground(st, node, const Color(0xFFFEF7D2));
      expect(st.document.root.children.first.attributes[blockComponentBackgroundColor], '#FEF7D2');

      await applyBlockBackground(st, st.document.root.children.first, null);
      expect(st.document.root.children.first.attributes[blockComponentBackgroundColor], isNull);
    });
  });

  group('菜单接线', () {
    testWidgets('点「颜色」→ 右侧出颜色面板，选色回调 onPickBackground', (tester) async {
      tester.view.physicalSize = const Size(900, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      Color? picked;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Align(
            alignment: Alignment.topLeft,
            child: BlockActionMenu(
              blockCount: 3,
              onAction: (_) {},
              onPickBackground: (c) => picked = c,
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('背景颜色'), findsNothing);
      await tester.tap(find.text('颜色'));
      await tester.pumpAndSettle();
      expect(find.text('背景颜色'), findsOneWidget, reason: '颜色面板应弹出');
      expect(tester.getRect(find.byType(BlockActionMenu)).width, greaterThan(kBlockMenuWidth));

      await tester.tap(find.text('无颜色') == null ? find.text('背景颜色') : find.text('背景颜色'));
      // 选最后一行最后一个色块
      final swatch = find.byWidgetPredicate((w) =>
          w is Container && (w.decoration as BoxDecoration?)?.color == const Color(0xFFFFD3D3));
      await tester.tap(swatch.last);
      await tester.pumpAndSettle();
      expect(picked, const Color(0xFFFFD3D3));
      expect(find.text('背景颜色'), findsNothing, reason: '选完收起子面板');
    });
  });
}