// M2-T02 标题块验收：40/64/w600 + 灰色「无标题」占位 + 即时同步 + 防抖落库
//
// 跑法：cd client && flutter test test/page_title_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/tokens.dart';
import 'package:bijiapp/main_shell.dart';
import 'package:bijiapp/page/page_title.dart';
import 'package:bijiapp/shell/flowus_shell.dart';
import 'package:bijiapp/shell/flowus_tabbar.dart';

Future<void> _pumpTitle(
  WidgetTester tester, {
  String title = '',
  ValueChanged<String>? onChanged,
  Future<void> Function(String)? onSave,
  Duration debounce = const Duration(milliseconds: 200),
}) async {
  tester.view.physicalSize = const Size(1200, 600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: FlowUsPageTitle(
          title: title,
          onChanged: onChanged ?? (_) {},
          onSave: onSave,
          debounce: debounce,
        ),
      ),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  group('规格（tokens 的 pageTitle）', () {
    testWidgets('输入文字用 40 / 64 / w600', (tester) async {
      await _pumpTitle(tester, title: '我的页面');
      final field = tester.widget<TextField>(find.byType(TextField));
      expect(field.style?.fontSize, 40);
      expect(field.style?.height, closeTo(64 / 40, 0.0001));
      expect(field.style?.fontWeight, FontWeight.w600);
      expect(FlowUsTypography.pageTitle.fontSize, 40);
    });

    testWidgets('空标题显示「无标题」占位，且占位同样 40/64/w600、灰色 grey3', (tester) async {
      await _pumpTitle(tester);
      final hint = tester.widget<Text>(find.text('无标题'));
      expect(hint.style?.fontSize, 40);
      expect(hint.style?.height, closeTo(64 / 40, 0.0001));
      expect(hint.style?.fontWeight, FontWeight.w600);
      expect(hint.style?.color, FlowUsColors.light.textTertiary); // grey3
    });

    testWidgets('多行：长标题不裁切（maxLines 为 null）', (tester) async {
      await _pumpTitle(tester, title: '很长的标题');
      expect(tester.widget<TextField>(find.byType(TextField)).maxLines, isNull);
    });
  });

  group('交互', () {
    testWidgets('每次键入立刻回调 onChanged（三处同步靠它，不能等防抖）', (tester) async {
      final seen = <String>[];
      await _pumpTitle(tester, onChanged: seen.add);
      await tester.enterText(find.byType(TextField), '磷');
      await tester.pump();
      await tester.enterText(find.byType(TextField), '磷化');
      await tester.pump();
      expect(seen, ['磷', '磷化']);
    });

    testWidgets('防抖：连续输入只在最后一次之后落库一次', (tester) async {
      final saved = <String>[];
      await _pumpTitle(tester, onSave: (v) async => saved.add(v), debounce: const Duration(milliseconds: 200));

      for (final t in ['a', 'ab', 'abc']) {
        await tester.enterText(find.byType(TextField), t);
        await tester.pump(const Duration(milliseconds: 50));
      }
      expect(saved, isEmpty, reason: '防抖窗口内不该落库');

      await tester.pump(const Duration(milliseconds: 260));
      expect(saved, ['abc'], reason: '只落最后一次');
    });

    testWidgets('外部改标题（例如侧栏重命名）会同步进输入框', (tester) async {
      await _pumpTitle(tester, title: '旧名');
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: FlowUsPageTitle(title: '新名', onChanged: (_) {}),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, '新名');
    });
  });

  group('三处即时同步（演示壳集成）', () {
    testWidgets('在主区改标题 → 侧栏页项与标签条同时变', (tester) async {
      tester.view.physicalSize = const Size(1920, 945);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(const ShellApp());
      await tester.pumpAndSettle();

      // 初始：主区标题 = 学习进度（演示壳默认），侧栏与标签条也有「学习进度」
      final titleField = find.descendant(of: find.byType(FlowUsPageTitle), matching: find.byType(TextField));
      expect(titleField, findsOneWidget);
      expect(find.text('学习进度'), findsWidgets);

      await tester.enterText(titleField, '改过的标题');
      await tester.pumpAndSettle();

      // 主区
      expect(tester.widget<TextField>(titleField).controller?.text, '改过的标题');
      // 侧栏页项 + 标签条 各自都有新标题（注意：find.text 也会命中 TextField 自己的 EditableText，
      // 所以按容器分别断言，而不是数总数）
      expect(
        find.descendant(of: find.byType(FlowUsSidebar), matching: find.text('改过的标题')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: find.byType(FlowUsTabBar), matching: find.text('改过的标题')),
        findsOneWidget,
      );
      // 旧的「学习进度」不再出现在侧栏/标签条里
      expect(find.text('学习进度'), findsNothing);
    });
  });
}