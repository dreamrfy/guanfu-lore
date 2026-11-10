// M2-T27 块菜单子面板验收（转换为 / 对齐方式 / 手柄提示）
//
// 实测：转换为 200 宽 · 20 项 · 行 32 · 文字距左 43；对齐方式 260 宽 · 三项 L/C/R；子面板与主面板重叠 9
// 手柄提示：黑底 90×46、圆角 8、12/18 白、两行「长按拖拽 / 点击打开菜单」
// 跑法：cd client && flutter test test/block_submenus_test.dart

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/editor/block_action_menu.dart';
import 'package:bijiapp/editor/block_handle.dart';
import 'package:bijiapp/editor/block_submenus.dart';

EditorState _state(String text) {
  final doc = Document.fromJson({
    'document': {
      'type': 'page',
      'children': [
        {
          'type': 'paragraph',
          'data': {
            'delta': [
              {'insert': text},
            ],
          },
        },
      ],
    },
  });
  return EditorState(document: doc);
}

void main() {
  group('规格常量', () {
    test('转换为 200 宽 / 行 32 / 文字距左 43；对齐 260 宽；重叠 9', () {
      expect(kConvertPanelWidth, 200);
      expect(kConvertTextInset, 43);
      expect(kSubmenuRowHeight, 32);
      expect(kAlignPanelWidth, 260);
      expect(kAlignShortcutInset, 27);
      expect(kSubmenuOverlap, 9);
      expect(kColorPanelWidth, 239);
    });

    test('转换为 20 项、顺序与真机一致', () {
      expect(kConvertTargets.length, 20);
      expect(kConvertTargets, [
        '正文', '待办列表', '页面', '标题1', '标题2', '标题3', '标题4', '项目列表', '编号列表', '折叠列表',
        '引述文字', '着重文字', '代码片段', '数学公式', '思维导图', '折叠标题1', '折叠标题2', '折叠标题3', '折叠标题4', '同步块',
      ]);
    });

    test('对齐三项 = 左对齐(L) / 居中对齐(C) / 右对齐(R)', () {
      expect(kAlignOptions, [('左对齐', 'L'), ('居中对齐', 'C'), ('右对齐', 'R')]);
    });

    test('手柄提示 90×46、圆角 8、两行', () {
      expect(kHandleTooltipWidth, 90);
      expect(kHandleTooltipHeight, 46);
      expect(kHandleTooltipRadius, 8);
      expect(kHandleTooltipLines, ['长按拖拽', '点击打开菜单']);
    });
  });

  group('转换映射', () {
    test('9 类可转：正文/标题1-4/项目/编号/待办/引述/代码', () {
      final supported = kConvertTargets.where((t) => convertTargetNode(t) != null).toList();
      expect(supported, ['正文', '待办列表', '标题1', '标题2', '标题3', '标题4', '项目列表', '编号列表', '引述文字', '代码片段']);
    });

    test('未实现的 10 类返回 null（页面/折叠/公式/导图/同步块）', () {
      for (final t in ['页面', '折叠列表', '着重文字', '数学公式', '思维导图', '折叠标题1', '同步块']) {
        expect(convertTargetNode(t), isNull, reason: '$t 暂不支持');
      }
    });

    test('applyConvert：改类型、保留文字', () async {
      final st = _state('改成标题');
      final node = st.document.root.children.first;
      expect(await applyConvert(st, node, '标题2'), isTrue);
      final after = st.document.root.children.first;
      expect(after.type, HeadingBlockKeys.type);
      expect(after.attributes[HeadingBlockKeys.level], 2);
      expect(after.delta!.toPlainText(), '改成标题');
    });

    test('applyConvert 到代码块：类型 = code（我们自写的块）', () async {
      final st = _state('sudo -i');
      final node = st.document.root.children.first;
      expect(await applyConvert(st, node, '代码片段'), isTrue);
      expect(st.document.root.children.first.type, 'code');
    });

    test('不支持的类型不落库（返回 false、类型不变）', () async {
      final st = _state('原文');
      final node = st.document.root.children.first;
      expect(await applyConvert(st, node, '思维导图'), isFalse);
      expect(st.document.root.children.first.type, ParagraphBlockKeys.type);
    });
  });

  group('对齐', () {
    test('applyAlign 写入 align 属性（left/center/right）', () async {
      for (final pair in [('左对齐', 'left'), ('居中对齐', 'center'), ('右对齐', 'right')]) {
        final st = _state('对齐我');
        final node = st.document.root.children.first;
        expect(await applyAlign(st, node, pair.$1), isTrue);
        expect(st.document.root.children.first.attributes[blockComponentAlign], pair.$2);
      }
      expect(alignAttributeOf('未知'), isNull);
    });
  });

  group('面板渲染', () {
    testWidgets('转换为面板：200 宽、20 行、行高 32', (tester) async {
      tester.view.physicalSize = const Size(600, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      String? picked;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Align(alignment: Alignment.topLeft, child: FlowUsConvertPanel(onPick: (t) => picked = t)),
        ),
      ));
      await tester.pumpAndSettle();

      expect(tester.getSize(find.byType(FlowUsConvertPanel)).width, 200);
      expect(find.text('正文'), findsOneWidget);
      expect(find.text('同步块'), findsOneWidget);
      final row = tester.getRect(find.ancestor(of: find.text('正文'), matching: find.byType(SizedBox)).first);
      expect(row.height, 32);

      await tester.tap(find.text('标题1'));
      await tester.pump();
      expect(picked, '标题1');
    });

    testWidgets('对齐面板：260 宽、三项带 L/C/R', (tester) async {
      tester.view.physicalSize = const Size(600, 400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      String? picked;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Align(alignment: Alignment.topLeft, child: FlowUsAlignPanel(onPick: (t) => picked = t)),
        ),
      ));
      await tester.pumpAndSettle();

      expect(tester.getSize(find.byType(FlowUsAlignPanel)).width, 260);
      for (final t in ['左对齐', '居中对齐', '右对齐']) {
        expect(find.text(t), findsOneWidget);
      }
      expect(find.text('L'), findsOneWidget);
      expect(find.text('C'), findsOneWidget);
      expect(find.text('R'), findsOneWidget);

      await tester.tap(find.text('居中对齐'));
      await tester.pump();
      expect(picked, '居中对齐');
    });
  });

  group('菜单接线', () {
    testWidgets('点「转换为」→ 右侧出子面板；点子项回调 onConvert', (tester) async {
      tester.view.physicalSize = const Size(900, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      String? converted;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Align(
            alignment: Alignment.topLeft,
            child: BlockActionMenu(
              blockCount: 5,
              onAction: (_) {},
              onConvert: (t) => converted = t,
              onAlign: (_) {},
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('同步块'), findsNothing);
      await tester.tap(find.text('转换为'));
      await tester.pumpAndSettle();
      expect(find.text('同步块'), findsOneWidget, reason: '转换面板应弹出');

      final menuRect = tester.getRect(find.byType(BlockActionMenu));
      expect(menuRect.width, greaterThan(kBlockMenuWidth), reason: '主面板 + 右侧子面板');

      await tester.tap(find.text('标题1'));
      await tester.pumpAndSettle();
      expect(converted, '标题1');
      expect(find.text('同步块'), findsNothing, reason: '选完应收起子面板');
    });
  });
}