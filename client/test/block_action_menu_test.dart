// M2-T08 块操作菜单验收（数值全部取 `基准-块操作菜单.md` 实测）
//
// 面板 260 / 圆角 12 / 内边距 8 0 ｜ 行 250×32 ｜ 文字 14/20 #000 ｜ 快捷键 12/17 #91918E
// 15 项 + 4 条分组分隔线 + 底部「块数统计」
// 跑法：cd client && flutter test test/block_action_menu_test.dart

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/editor/block_action_menu.dart';

Future<void> _pumpMenu(WidgetTester tester, {int blocks = 11, ValueChanged<BlockAction>? onAction}) async {
  tester.view.physicalSize = const Size(800, 900);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Align(
        alignment: Alignment.topLeft,
        child: BlockActionMenu(blockCount: blocks, onAction: onAction ?? (_) {}),
      ),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  group('规格常量与实测一致', () {
    test('面板 260 / 行 250×32 / 分隔线 226 缩进 17', () {
      expect(kBlockMenuWidth, 260);
      expect(kBlockMenuItemHeight, 32);
      expect(kBlockMenuItemInset, 5);
      expect(kBlockMenuSeparatorWidth, 226);
      expect(kBlockMenuSeparatorInset, 17);
      expect(kBlockMenuSeparatorGap, 4);
      expect(kBlockMenuHandleGap, 22);
    });

    test('15 项、顺序与快捷键与真 FlowUs 一致', () {
      final items = kBlockActionItems;
      expect(items.length, 15);
      expect([for (final i in items) i.label], [
        'AI 助手', '复制', '剪切', '创建副本', '复制并移动到页面', '转换为', '复制块链接', '删除',
        '移动到', '颜色', '对齐方式', '添加评论', '在上方插入', '在下方插入', '在右侧添加分栏',
      ]);
      expect([for (final i in items) i.shortcut], [
        'Ctrl+J', 'Ctrl+C', 'Ctrl+X', 'Ctrl+D', null, null, 'F', 'Del',
        'Ctrl+Shift+P', null, null, 'Ctrl+Shift+M', 'A', 'B', null,
      ]);
      expect([for (final i in items) i.hasSubmenu], [
        false, false, false, false, false, true, false, false,
        false, true, true, false, false, false, false,
      ]);
    });

    test('分组 = 4 条分隔线（8 / 移动到 / 颜色+对齐 / 添加评论 / 插入组）', () {
      expect(kBlockActionGroups.map((g) => g.length).toList(), [8, 1, 2, 1, 3]);
    });
  });

  group('渲染', () {
    testWidgets('面板宽 260、圆角 12', (tester) async {
      await _pumpMenu(tester);
      final box = tester.widget<Container>(find.byType(Container).first);
      final deco = box.decoration! as BoxDecoration;
      expect(tester.getSize(find.byType(BlockActionMenu)).width, 260);
      expect((deco.borderRadius as BorderRadius).topLeft.x, 12);
      expect(deco.border, isNotNull);
      expect(deco.boxShadow!.length, 2);
    });

    testWidgets('每行 250×32；文字 14/20 #000000；快捷键 12/17 #91918E', (tester) async {
      await _pumpMenu(tester);
      final copyRow = find.byKey(const ValueKey('block-action-copy'));
      expect(tester.getSize(copyRow), const Size(250, 32));

      final label = tester.widget<Text>(find.text('复制'));
      expect(label.style!.fontSize, 14);
      expect(label.style!.height, closeTo(20 / 14, 1e-6));
      expect(label.style!.color, const Color(0xFF000000));

      final sc = tester.widget<Text>(find.text('Ctrl+C'));
      expect(sc.style!.fontSize, 12);
      expect(sc.style!.color, const Color(0xFF91918E));
    });

    testWidgets('底部一行「块数统计: N」', (tester) async {
      await _pumpMenu(tester, blocks: 11);
      expect(find.text('块数统计: 11'), findsOneWidget);
      final t = tester.widget<Text>(find.text('块数统计: 11'));
      expect(t.style!.fontSize, 12);
    });

    testWidgets('点条目回调对应 action', (tester) async {
      BlockAction? got;
      await _pumpMenu(tester, onAction: (a) => got = a);
      await tester.tap(find.text('删除'));
      await tester.pump();
      expect(got, BlockAction.delete);
    });
  });

  group('动作执行（EditorState 公开 API）', () {
    EditorState makeState() {
      final doc = Document.fromJson({
        'document': {
          'type': 'page',
          'children': [
            {'type': 'paragraph', 'data': {'delta': [{'insert': '第一段'}]}},
            {'type': 'paragraph', 'data': {'delta': [{'insert': '第二段'}]}},
          ],
        },
      });
      return EditorState(document: doc);
    }

    test('创建副本 → 块 +1，内容一致', () async {
      final st = makeState();
      final first = st.document.root.children.first;
      final ok = await BlockActionRunner(st).run(BlockAction.duplicate, first);
      expect(ok, isTrue);
      expect(st.document.root.children.length, 3);
      expect(st.document.root.children[1].delta!.toPlainText(), '第一段');
    });

    test('在上方插入 → 空段落插到该块前面；在下方插入 → 后面', () async {
      final st = makeState();
      final second = st.document.root.children[1];
      await BlockActionRunner(st).run(BlockAction.insertAbove, second);
      expect(st.document.root.children[1].delta!.toPlainText(), '');
      expect(st.document.root.children[2].delta!.toPlainText(), '第二段');

      final st2 = makeState();
      final first = st2.document.root.children.first;
      await BlockActionRunner(st2).run(BlockAction.insertBelow, first);
      expect(st2.document.root.children[1].delta!.toPlainText(), '');
    });

    test('删除 → 块 −1', () async {
      final st = makeState();
      await BlockActionRunner(st).run(BlockAction.delete, st.document.root.children.first);
      expect(st.document.root.children.length, 1);
      expect(st.document.root.children.first.delta!.toPlainText(), '第二段');
    });

    test('复制 → 不落库、只写剪贴板（这里只验没改文档）', () async {
      final st = makeState();
      final before = st.document.root.children.length;
      await BlockActionRunner(st).run(BlockAction.copy, st.document.root.children.first);
      expect(st.document.root.children.length, before);
    });

    test('未实现的动作返回 false 且不动文档', () async {
      final st = makeState();
      final before = st.document.root.children.length;
      final ok = await BlockActionRunner(st).run(BlockAction.convertTo, st.document.root.children.first);
      expect(ok, isFalse);
      expect(st.document.root.children.length, before);
    });
  });
}