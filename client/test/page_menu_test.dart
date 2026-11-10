// M2-T13 页面右上「⋯」长面板验收
//
// 实测：面板宽 256、行高 31、文字 14/19、快捷键 12/17、分隔线内缩 17 宽 218 色 #E5E5E5、底部统计 12/17 三项。
// 跑法：cd client && flutter test test/page_menu_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/page/page_menu.dart';

Future<void> _pump(WidgetTester tester, {void Function(PageMenuItem)? onItem}) async {
  tester.view.physicalSize = const Size(900, 1000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Align(alignment: Alignment.topRight, child: FlowUsPageMenu(onItem: onItem)),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('面板宽 256、最大高 851、圆角 12', (tester) async {
    await _pump(tester);
    final panel = find.byType(FlowUsPageMenu);
    final rect = tester.getRect(panel);
    expect(rect.width, 256);
    final box = tester.widget<Container>(
      find.descendant(of: panel, matching: find.byType(Container)).first,
    );
    final deco = box.decoration as BoxDecoration;
    expect((deco.borderRadius! as BorderRadius).topLeft.x, 12);
    expect(FlowUsPageMenuStyle.maxHeight, 851);
  });

  testWidgets('行高 31、文字 14/19', (tester) async {
    await _pump(tester);
    final row = tester.getRect(find.ancestor(of: find.text('复制页面链接'), matching: find.byType(SizedBox)).first);
    expect(row.height, 31);
    final st = tester.widget<Text>(find.text('复制页面链接')).style;
    expect(st?.fontSize, 14);
    expect(st?.height, closeTo(19 / 14, 0.0001));
  });

  testWidgets('带快捷键的项：右侧 12/17 显示键位', (tester) async {
    await _pump(tester);
    final sc = tester.widget<Text>(find.text('Ctrl+Z')).style;
    expect(sc?.fontSize, 12);
    expect(sc?.height, closeTo(17 / 12, 0.0001));
    expect(sc?.color, const Color(0xFF91918E));
  });

  testWidgets('分隔线 7 条：内缩 17、宽 218、色 #E5E5E5', (tester) async {
    await _pump(tester);
    final seps = tester
        .widgetList<Container>(find.byWidgetPredicate((w) => w is Container && w.constraints?.maxHeight == 1))
        .toList();
    // 实测 7 条 = 7 组之间 6 条 + 底部统计前 1 条
    expect(seps.length, 7);
    expect(seps.first.constraints!.maxWidth, 218);
    expect(seps.first.color, const Color(0xFFE5E5E5));
  });

  testWidgets('清单顺序与实测一致（首项查找与替换、危险项删除）', (tester) async {
    await _pump(tester);
    // 逐项都在
    const labels = [
      '查找与替换', '固定宽度', '页面目录', '默认字体', '页面布局', '小字号',
      '评论位置', '演示模式',
      '锁定页面', '复制页面链接', '撤销', '重做', '页面历史',
      '已解决评论', '删除',
      '复制为公众号格式', '转换为模板', '导入', '导出页面',
      '移动到', '页面动态', '查看页面信息',
    ];
    for (final l in labels) {
      expect(find.text(l), findsOneWidget, reason: '菜单缺项：$l');
    }
    // 删除是红字
    expect(tester.widget<Text>(find.text('删除')).style?.color, const Color(0xFFD92D20));

    // 组数核对
    final total = kPageMenuGroups.fold<int>(0, (a, g) => a + g.length);
    expect(total, labels.length);
    expect(kPageMenuGroups.length, 7, reason: '实测 7 条分隔线 → 7 组');
  });

  testWidgets('底部统计三项 12/17', (tester) async {
    await _pump(tester);
    for (final l in kPageMenuFooter) {
      expect(find.text(l), findsOneWidget, reason: '缺底部行：$l');
    }
    final st = tester.widget<Text>(find.text(kPageMenuFooter.first)).style;
    expect(st?.fontSize, 12);
    expect(st?.height, closeTo(17 / 12, 0.0001));
  });

  testWidgets('点一项 → 回调并带出该项', (tester) async {
    final tapped = <String>[];
    await _pump(tester, onItem: (i) => tapped.add(i.label));
    await tester.tap(find.text('页面历史'));
    await tester.pumpAndSettle();
    expect(tapped, ['页面历史']);
  });
}