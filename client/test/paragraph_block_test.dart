// M2-T03 段落块与排版验收
//
// 规格（基准-正文行高与块结构 / M0-T31 沿 DOM 逐层实测）：
//   行内文字行高 26、块容器行高 24、块高 34（26 + 上下内边距各 4）、块间距 2（上下外边距各 1）、正文 16px
//   空块占位：「按空格使用 AI，输入文字或 / 命令」
//
// 跑法：cd client && flutter test test/paragraph_block_test.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/tokens.dart';
import 'package:bijiapp/page/paragraph_block.dart';

const _two = [
  ParagraphData(id: 'a', text: '第一段'),
  ParagraphData(id: 'b', text: '第二段'),
];

Future<void> _pump(
  WidgetTester tester, {
  List<ParagraphData> paragraphs = _two,
  void Function(String, String)? onChanged,
  void Function(String)? onEnter,
}) async {
  tester.view.physicalSize = const Size(1000, 600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: SizedBox(
        width: 708,
        child: FlowUsParagraphList(
          paragraphs: paragraphs,
          onChanged: onChanged ?? (_, _) {},
          onEnter: onEnter,
        ),
      ),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  group('排版数值（M0-T31 三层数字）', () {
    testWidgets('块高 34、块间距 2（相邻块 y 差 36）', (tester) async {
      await _pump(tester);
      final a = tester.getRect(find.byKey(const ValueKey('para-a')));
      final b = tester.getRect(find.byKey(const ValueKey('para-b')));
      // 块高 34 = 26（行内行高）+ 4 + 4
      expect(a.height, closeTo(FlowUsBlockMetrics.singleLineBlockHeight, 0.5));
      expect(a.height, closeTo(34, 0.5));
      // 相邻块顶边差 = 34 + 2 = 36
      expect(b.top - a.top, closeTo(36, 0.5));
    });

    testWidgets('块内上下内边距各 4（py-1）', (tester) async {
      await _pump(tester, paragraphs: const [ParagraphData(id: 'a', text: '一段')]);
      final block = tester.getRect(find.byKey(const ValueKey('para-a')));
      final field = tester.getRect(find.byType(TextField).first);
      expect(field.top - block.top, closeTo(FlowUsBlockMetrics.blockPaddingVertical, 0.5));
    });

    testWidgets('文字 16px / 行高 26（行内层）', (tester) async {
      await _pump(tester);
      final field = tester.widget<TextField>(find.byType(TextField).first);
      expect(field.style?.fontSize, 16);
      expect(field.style?.height, closeTo(26 / 16, 0.0001));
      expect(FlowUsTypography.bodyFontSize, 16);
      expect(FlowUsTypography.bodyInlineLineHeight, 26);
    });
  });

  group('空块占位', () {
    testWidgets('整页只有一个空段 → 显示「按空格使用 AI，输入文字或 / 命令」', (tester) async {
      await _pump(tester, paragraphs: const [ParagraphData(id: 'only')]);
      expect(find.text('按空格使用 AI，输入文字或 / 命令'), findsOneWidget);
    });

    testWidgets('多段时未聚焦的空段不显示占位；聚焦后显示', (tester) async {
      await _pump(tester, paragraphs: const [
        ParagraphData(id: 'a', text: '有字'),
        ParagraphData(id: 'b'),
      ]);
      expect(find.text('按空格使用 AI，输入文字或 / 命令'), findsNothing, reason: '没聚焦不该占位');

      await tester.tap(find.byKey(const ValueKey('para-b')));
      await tester.pumpAndSettle();
      expect(find.text('按空格使用 AI，输入文字或 / 命令'), findsOneWidget);
    });

    testWidgets('占位颜色是 grey3', (tester) async {
      await _pump(tester, paragraphs: const [ParagraphData(id: 'only')]);
      final hint = tester.widget<Text>(find.text('按空格使用 AI，输入文字或 / 命令'));
      expect(hint.style?.color, FlowUsColors.light.textTertiary);
      expect(hint.style?.fontSize, 16);
    });
  });

  group('交互', () {
    testWidgets('键入立刻回调 (id, 文本)', (tester) async {
      final seen = <(String, String)>[];
      await _pump(tester, onChanged: (id, t) => seen.add((id, t)));
      await tester.enterText(find.byType(TextField).first, '改过的第一段');
      await tester.pump();
      expect(seen, [('a', '改过的第一段')]);
    });

    testWidgets('回车 → 请求在段后插入新段', (tester) async {
      final entered = <String>[];
      await _pump(tester, onEnter: entered.add);
      await tester.tap(find.byKey(const ValueKey('para-a')));
      await tester.pumpAndSettle();
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(entered, ['a']);
    });

    test('insertParagraphAfter 插在指定段之后', () {
      final out = insertParagraphAfter(_two, 'a', 'new');
      expect(out.map((p) => p.id).toList(), ['a', 'new', 'b']);
      expect(out.firstWhere((p) => p.id == 'new').text, '');
    });
  });
}