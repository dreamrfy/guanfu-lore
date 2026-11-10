// M4-T03 字段类型第一批（值渲染）的验收
//
// 规则来源：docs/基准/证据/M4-T03/cell-styles.json（2026-11-10 现场实测，正文遮蔽）。
// 跑法：cd client && flutter test test/cell_renderers_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/table/flowus_table.dart';
import 'package:bijiapp/design/tokens.dart';
import 'package:bijiapp/table/cell_renderers.dart';

FlowUsFieldDefinition _field(String type) => FlowUsFieldDefinition(id: 'f', name: '列', rawType: type);

Future<Rect> _pumpCell(WidgetTester tester, String type, Object? raw) async {
  tester.view.physicalSize = const Size(400, 200);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Center(
        child: SizedBox(
          width: 180,
          height: 36,
          child: FlowUsCellValue(field: _field(type), raw: raw),
        ),
      ),
    ),
  ));
  await tester.pumpAndSettle();
  return tester.getRect(find.byType(FlowUsCellValue));
}

void main() {
  group('文本 / 数字', () {
    testWidgets('文本与数字都是 14/24 #37352F', (tester) async {
      for (final type in ['text', 'number', 'title']) {
        await _pumpCell(tester, type, 'abc123');
        final t = tester.widget<Text>(find.text('abc123'));
        expect(t.style?.fontSize, 14, reason: type);
        expect(t.style?.height, closeTo(24 / 14, 0.0001), reason: type);
        expect(t.style?.color, const Color(0xFF37352F), reason: type);
      }
    });

    testWidgets('空值渲染为空文本不崩', (tester) async {
      await _pumpCell(tester, 'text', null);
      expect(find.text(''), findsOneWidget);
    });
  });

  group('单选 / 多选胶囊', () {
    testWidgets('胶囊：高 20、圆角 4、左右内边距 6、文字 14/20、按色名配色', (tester) async {
      await _pumpCell(tester, 'select', [
        {'name': '微信', 'color': 'green'}
      ]);
      final box = tester.widget<Container>(find.byType(Container).last);
      final deco = box.decoration as BoxDecoration;
      expect(deco.color, const Color(0xFFD2ECD5)); // 实测绿底
      expect((deco.borderRadius! as BorderRadius).topLeft.x, closeTo(FlowUsTable.pillRadius, 0.01));
      expect(box.padding, const EdgeInsets.symmetric(horizontal: 6));

      final t = tester.widget<Text>(find.text('微信'));
      expect(t.style?.fontSize, 14);
      expect(t.style?.color, const Color(0xFF3B5B46)); // 实测绿字

      final rect = tester.getRect(find.byType(Container).last);
      expect(rect.height, closeTo(FlowUsTable.pillHeight, 0.5));
    });

    testWidgets('多选：多个胶囊、间距 4；粉/橙/灰各自配色；未知色名退回灰', (tester) async {
      await _pumpCell(tester, 'multi_select', [
        {'name': '甲', 'color': 'pink'},
        {'name': '乙', 'color': 'orange'},
        {'name': '丙', 'color': 'someFutureColor'},
      ]);
      final a = tester.getRect(find.text('甲'));
      final b = tester.getRect(find.text('乙'));
      final c = tester.getRect(find.text('丙'));
      expect(b.left - a.right, closeTo(FlowUsTable.pillGap * 2, 8)); // 文字间距 = gap + 两个左右内边距
      expect(c.left, greaterThan(b.right));

      final pillPink = tester.widget<Container>(
        find.ancestor(of: find.text('甲'), matching: find.byType(Container)).first,
      );
      expect((pillPink.decoration as BoxDecoration).color, const Color(0xFFF8DAE6));
      expect(tester.widget<Text>(find.text('甲')).style?.color, const Color(0xFF8B2B69));

      final pillUnknown = tester.widget<Container>(
        find.ancestor(of: find.text('丙'), matching: find.byType(Container)).first,
      );
      expect((pillUnknown.decoration as BoxDecoration).color, const Color(0xFFECEDED));
    });

    testWidgets('字符串值的多选也能渲染（无颜色 → 灰）', (tester) async {
      await _pumpCell(tester, 'multi_select', ['标签A', '标签B']);
      expect(find.text('标签A'), findsOneWidget);
      expect(find.text('标签B'), findsOneWidget);
    });

    testWidgets('空多选不渲染胶囊', (tester) async {
      await _pumpCell(tester, 'multi_select', const []);
      expect(find.byType(Container), findsNothing);
    });
  });

  group('日期', () {
    test('毫秒时间戳 → YYYY/MM/DD HH:mm', () {
      final ms = DateTime(2026, 10, 21, 11, 35).millisecondsSinceEpoch;
      expect(FlowUsDateText.format(ms), '2026/10/21 11:35');
      expect(FlowUsDateText.format('$ms'), '2026/10/21 11:35');
    });

    test('ISO 字符串 → 同一格式', () {
      final iso = DateTime(2026, 1, 2, 3, 4).toIso8601String();
      expect(FlowUsDateText.format(iso), '2026/01/02 03:04');
    });

    test('已经是目标形态的字符串原样返回', () {
      expect(FlowUsDateText.format('2026/10/21 11:35'), '2026/10/21 11:35');
    });

    test('空值 → 空串', () {
      expect(FlowUsDateText.format(null), '');
    });
  });

  group('复选框（尺寸未实测，先用 16）', () {
    testWidgets('勾选 = 蓝底 + 白勾；未勾选 = 透明 + 淡边框', (tester) async {
      await _pumpCell(tester, 'checkbox', true);
      final box = tester.widget<Container>(find.byType(Container).last);
      expect((box.decoration as BoxDecoration).color, const Color(0xFF0285FF));
      expect(find.byIcon(Icons.check), findsOneWidget);
      expect(tester.getRect(find.byType(Container).last).width, FlowUsTable.checkboxSize);

      await _pumpCell(tester, 'checkbox', false);
      final box2 = tester.widget<Container>(find.byType(Container).last);
      expect((box2.decoration as BoxDecoration).color, Colors.transparent);
      expect(find.byIcon(Icons.check), findsNothing);
    });
  });
}