// M2-T12 页面底部引用条验收（数值取真 FlowUs 实测：整行高 28、chip 内边距 4×8、圆角 4、字 14/20）
//
// 三段：引用当前页面 N ｜ 提及的页面引用 N ｜ 引用建议 Beta
// 色：第一段 #37352F（激活），后两段 #91918E；Beta #5F5E5B；段间距 16、文字与计数间距 4
// 跑法：cd client && flutter test test/page_footer_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/page/page_footer.dart';

Future<void> _pump(WidgetTester tester, {PageFooterInfo? info}) async {
  tester.view.physicalSize = const Size(1200, 400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Align(
        alignment: Alignment.topLeft,
        child: FlowUsPageFooter(info: info ?? const PageFooterInfo()),
      ),
    ),
  ));
  await tester.pumpAndSettle();
}

Text _text(WidgetTester tester, String s) => tester.widget<Text>(find.text(s));

void main() {
  group('常量与实测一致', () {
    test('行高 28 / 内边距 4×8 / 圆角 4 / 段间距 16 / 计数间距 4 / 左偏移 28', () {
      expect(kFooterBarHeight, 28);
      expect(kFooterChipPadV, 4);
      expect(kFooterChipPadH, 8);
      expect(kFooterChipRadius, 4);
      expect(kFooterGroupGap, 16);
      expect(kFooterCountGap, 4);
      expect(kFooterLeftInset, 28);
    });
  });

  group('渲染', () {
    testWidgets('三段文案都在，计数默认 0，Beta 在第三段', (tester) async {
      await _pump(tester);
      expect(find.text('引用当前页面'), findsOneWidget);
      expect(find.text('提及的页面引用'), findsOneWidget);
      expect(find.text('引用建议'), findsOneWidget);
      expect(find.text('Beta'), findsOneWidget);
      expect(find.text('0'), findsNWidgets(2));
    });

    testWidgets('计数跟随数据：引用 3、提及 7', (tester) async {
      await _pump(tester, info: const PageFooterInfo(backlinkCount: 3, mentionCount: 7));
      expect(find.text('3'), findsOneWidget);
      expect(find.text('7'), findsOneWidget);
    });

    testWidgets('字 14/20；第一段 #37352F，后两段 #91918E，Beta #5F5E5B', (tester) async {
      await _pump(tester);
      final first = _text(tester, '引用当前页面');
      expect(first.style!.fontSize, 14);
      expect(first.style!.height, closeTo(20 / 14, 1e-6));
      expect(first.style!.color, const Color(0xFF37352F));

      expect(_text(tester, '提及的页面引用').style!.color, const Color(0xFF91918E));
      expect(_text(tester, '引用建议').style!.color, const Color(0xFF91918E));
      expect(_text(tester, 'Beta').style!.color, const Color(0xFF5F5E5B));
    });

    testWidgets('整行高 28、文字左缘 = 28', (tester) async {
      await _pump(tester);
      expect(tester.getSize(find.byType(FlowUsPageFooter)).height, 28);
      expect(tester.getRect(find.text('引用当前页面')).left, closeTo(28 + kFooterChipPadH, 0.5));
    });

    testWidgets('段间距 16：第一段末 → 第二段首', (tester) async {
      await _pump(tester);
      final firstChip = tester.getRect(find.byKey(const ValueKey('footer-chip-引用当前页面')));
      final secondChip = tester.getRect(find.byKey(const ValueKey('footer-chip-提及的页面引用')));
      expect(secondChip.left - firstChip.right, closeTo(kFooterGroupGap, 0.5));
    });
  });
}