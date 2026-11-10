// 空页类型选择器校验（M1-T08）
//
// 数值依据 docs/基准/证据/M1-T08/blank-state.json。
// 跑法：cd client && flutter test test/blank_page_test.dart

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/flowus_icons.dart';
import 'package:bijiapp/design/tokens.dart';
import 'package:bijiapp/shell/flowus_blank_page.dart';

Future<void> _pump(
  WidgetTester tester, {
  double width = 1920,
  void Function(String, BlankEntryGroup)? onSelect,
}) async {
  tester.view.physicalSize = Size(width, 945);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Center(
        child: SizedBox(
          width: FlowUsLayout.contentColumnWidth,
          child: FlowUsBlankPage(onSelectEntry: onSelect),
        ),
      ),
    ),
  ));
  await tester.pumpAndSettle();
}


/// 真图标现在是 SVG（M1-T12）：按名字找，而不是按 Material IconData
Finder svgIcon(String name) =>
    find.byWidgetPredicate((w) => w is FlowUsSvgIcon && w.name == name);

void main() {
  testWidgets('提示行 16/24 占位灰 rgb(189,189,189)', (tester) async {
    await _pump(tester);
    final text = tester.widget<Text>(find.text('按回车开始编辑，或从下方选择页面类型'));
    expect(text.style?.fontSize, 16);
    expect(text.style?.height, closeTo(24 / 16, 0.0001));
    expect(text.style?.color, const Color(0xFFBDBDBD));
  });

  testWidgets('页面类 6 项 + 多维表类 7 项，顺序按实测', (tester) async {
    await _pump(tester);
    const pageEntries = ['页面', 'AI 写作', '文件夹', '思维导图', '模板', '导入'];
    const dbEntries = ['表格', '看板', '画廊', '目录', '时间轴', '日历', '收集表'];
    for (final t in pageEntries) {
      expect(find.text(t), findsOneWidget, reason: '缺页面类入口 $t');
    }
    for (final t in dbEntries) {
      expect(find.text(t), findsOneWidget, reason: '缺多维表入口 $t');
    }
    expect(find.text('多维表'), findsOneWidget);
    // 分组标题在「导入」与「表格」之间
    final importY = tester.getRect(find.text('导入')).top;
    final groupY = tester.getRect(find.text('多维表')).top;
    final tableY = tester.getRect(find.text('表格')).top;
    expect(groupY, greaterThan(importY));
    expect(tableY, greaterThan(groupY));
  });

  testWidgets('入口行高 36、图标 20×20、行距 36（y 步进）', (tester) async {
    await _pump(tester);
    final pageRow = find.ancestor(of: find.text('页面'), matching: find.byType(Container)).first;
    final r = tester.getRect(pageRow);
    expect(r.height, closeTo(FlowUsLayout.blankEntryHeight, 0.5));
    final icon = tester.getRect(svgIcon(FlowUsIc.pageEmpty).first);
    expect(icon.width, closeTo(FlowUsLayout.blankEntryIconSize, 0.5));
    // 相邻行 y 步进 36
    final pageY = tester.getRect(find.text('页面')).top;
    final aiY = tester.getRect(find.text('AI 写作')).top;
    expect(aiY - pageY, closeTo(36, 0.5));
  });

  testWidgets('hover 入口行 → 黑 6% 底；点行回调 (label, group)', (tester) async {
    final picked = <(String, BlankEntryGroup)>[];
    await _pump(tester, onSelect: (l, g) => picked.add((l, g)));
    final g = await tester.createGesture(kind: PointerDeviceKind.mouse);
    await g.addPointer(location: Offset.zero);
    addTearDown(g.removePointer);
    await g.moveTo(tester.getCenter(find.text('页面')));
    await tester.pumpAndSettle();
    final row = tester.widget<Container>(
      find.ancestor(of: find.text('页面'), matching: find.byType(Container)).first,
    );
    expect((row.decoration as BoxDecoration?)?.color, FlowUsColors.light.hoverOverlay);
    expect(FlowUsColors.light.hoverOverlay, const Color(0x0F000000));

    await tester.tap(find.text('页面'));
    await tester.tap(find.text('收集表'));
    await tester.pumpAndSettle();
    expect(picked, hasLength(2));
    expect(picked[0].$1, '页面');
    expect(picked[0].$2, BlankEntryGroup.page);
    expect(picked[1].$1, '收集表');
    expect(picked[1].$2, BlankEntryGroup.database);
  });

  testWidgets('「多维表」分组标题 14/20、与上组间隔 36+16', (tester) async {
    await _pump(tester);
    final group = tester.widget<Text>(find.text('多维表'));
    expect(group.style?.fontSize, 14);
    expect(group.style?.height, closeTo(20 / 14, 0.0001));
    expect(group.style?.color, const Color(0xFFBDBDBD));
    // 分组间隔：实测导入行 top=462 → 多维表文字 top=520（DOM y 514 是 36 行，文字 20 行盒居中 +8）
    // 60 = 36(行) + 16(gap) + 8(20 行盒在 36 行内居中偏移)
    final importTop = tester.getRect(find.ancestor(of: find.text('导入'), matching: find.byType(Container)).first).top;
    final groupTextTop = tester.getRect(find.text('多维表')).top;
    expect(groupTextTop - importTop,
        closeTo(FlowUsLayout.blankEntryHeight + FlowUsLayout.blankGroupGap + 8, 0.5));
  });
}
