// M4-T02 表格视图骨架的验收：列头/行/单元格尺寸、网格线、首列冻结、列宽拖拽
//
// 数值依据：docs/基准/基准-多维表界面.md §3 + 2026-11-10 现场实测（tokens.dart 的 FlowUsTable）。
// 跑法：cd client && flutter test test/table_skeleton_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/table/flowus_table.dart';
import 'package:bijiapp/design/tokens.dart';
import 'package:bijiapp/table/table_skeleton.dart';

FlowUsFieldDefinition _f(String id, String name, String type) =>
    FlowUsFieldDefinition(id: id, name: name, rawType: type);

FlowUsCollection _collection({List<FlowUsFieldDefinition>? fields, int records = 2}) => FlowUsCollection(
      id: 'col-1',
      fields: fields ??
          [
            _f('f-title', '标题', 'title'),
            _f('f-tag', '标签', 'multi_select'),
            _f('f-date', '创建时间', 'created_at'),
            _f('f-author', '作者', 'text'),
          ],
      records: [
        for (var i = 0; i < records; i++)
          FlowUsRecord(uuid: 'r$i', parentId: 'col-1', cells: {
            'f-title': '标题$i',
            'f-tag': '标签$i',
            'f-date': '2026/10/2$i',
            'f-author': '作者$i',
          }),
      ],
    );

Future<void> _pump(WidgetTester tester, FlowUsCollection c, {double width = 900, void Function(String, double)? onResize}) async {
  tester.view.physicalSize = Size(1200, 600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Align(
        alignment: Alignment.topLeft,
        child: SizedBox(width: width, child: FlowUsTableSkeleton(collection: c, onColumnResized: onResize)),
      ),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('列头高 37、行高 36（实测 h-9=36）', (tester) async {
    await _pump(tester, _collection());
    // 列头容器：序号列头
    final header = tester.getRect(find.byType(FlowUsTableSkeleton));
    // 找出所有「标签」列头文字所在格子的高度
    final headerText = find.text('标签');
    expect(headerText, findsOneWidget);
    final cellRect = tester.getRect(
      find.ancestor(of: headerText, matching: find.byType(Container)).first,
    );
    expect(cellRect.height, closeTo(FlowUsTable.headerHeight, 0.5));
    expect(header.width, 900); // 骨架撑满给定宽度

    // 第一行的高度
    final rowText = find.text('标题0');
    final rowRect = tester.getRect(find.ancestor(of: rowText, matching: find.byType(Container)).first);
    expect(rowRect.height, closeTo(FlowUsTable.rowHeight, 0.5));
  });

  testWidgets('列宽 180、序号列 66、列头文字 14/24 #37352F + 左右内边距 8', (tester) async {
    await _pump(tester, _collection());

    // 序号列
    final noHeader = tester.getRect(find.ancestor(of: find.text('No.'), matching: find.byType(Container)).first);
    expect(noHeader.width, closeTo(FlowUsTable.indexColumnWidth, 0.5));

    // 标题列（冻结）宽 180
    final titleHeader = tester.getRect(find.ancestor(of: find.text('标题'), matching: find.byType(Container)).first);
    expect(titleHeader.width, closeTo(FlowUsTable.columnWidth, 0.5));

    final t = tester.widget<Text>(find.text('标题'));
    expect(t.style?.fontSize, 14);
    expect(t.style?.height, closeTo(24 / 14, 0.0001));
    expect(t.style?.color, const Color(0xFF37352F));
    final pad = tester.widget<Container>(find.ancestor(of: find.text('标题'), matching: find.byType(Container)).first);
    expect(pad.padding, const EdgeInsets.symmetric(horizontal: FlowUsTable.cellPaddingH));
  });

  testWidgets('网格线 1px rgba(55,53,47,0.1)（列间右缘 + 行间下缘）', (tester) async {
    await _pump(tester, _collection());
    final cell = tester.widget<Container>(find.ancestor(of: find.text('标题'), matching: find.byType(Container)).first);
    final deco = cell.decoration as BoxDecoration;
    final border = deco.border! as Border;
    expect(border.right.color, FlowUsTable.gridColor);
    expect(border.right.width, 1);
    expect(border.bottom.color, FlowUsTable.gridColor);
    expect(FlowUsTable.gridColor, const Color(0x1A37352F));
  });

  testWidgets('冻结：横向滚动后序号与标题列的 x 不变', (tester) async {
    await _pump(tester, _collection(), width: 700);
    final noBefore = tester.getRect(find.ancestor(of: find.text('No.'), matching: find.byType(Container)).first).left;
    final titleBefore = tester.getRect(find.ancestor(of: find.text('标题'), matching: find.byType(Container)).first).left;
    final scrollColBefore = tester.getRect(find.ancestor(of: find.text('作者'), matching: find.byType(Container)).first).left;

    // 拖列头那一行的横向滚动区
    await tester.drag(find.byType(SingleChildScrollView).first, const Offset(-120, 0));
    await tester.pumpAndSettle();

    final noAfter = tester.getRect(find.ancestor(of: find.text('No.'), matching: find.byType(Container)).first).left;
    final titleAfter = tester.getRect(find.ancestor(of: find.text('标题'), matching: find.byType(Container)).first).left;
    final scrollColAfter = tester.getRect(find.ancestor(of: find.text('作者'), matching: find.byType(Container)).first).left;

    expect(noAfter, closeTo(noBefore, 0.5), reason: '序号列应冻结');
    expect(titleAfter, closeTo(titleBefore, 0.5), reason: '标题列应冻结');
    expect(scrollColAfter, lessThan(scrollColBefore), reason: '其余列应随横向滚动左移');
  });

  testWidgets('列宽拖拽：手柄 4px，向右拖 40 → 列宽 180→220', (tester) async {
    final resized = <String, double>{};
    await _pump(tester, _collection(), onResize: (id, w) => resized[id] = w);

    final titleHeader = find.ancestor(of: find.text('标题'), matching: find.byType(Container)).first;
    final before = tester.getRect(titleHeader).width;
    expect(before, closeTo(180, 0.5));

    // 手柄是 4px 宽、贴在列右缘（一半在格内、一半探出），所以从 right−2 处起拖
    await tester.timedDragFrom(
      Offset(tester.getRect(titleHeader).right - 2, tester.getRect(titleHeader).center.dy),
      const Offset(40, 0),
      const Duration(milliseconds: 200),
    );
    await tester.pumpAndSettle();

    expect(tester.getRect(titleHeader).width, closeTo(220, 1.5));
    expect(resized['f-title'], closeTo(220, 1.5));
  });

  testWidgets('行数 = 记录数；每行都渲染', (tester) async {
    await _pump(tester, _collection(records: 3));
    expect(find.text('标题0'), findsOneWidget);
    expect(find.text('标题2'), findsOneWidget);
    expect(find.text('标题3'), findsNothing);
  });

  testWidgets('没有标题列的集合：全部列都可滚动，不崩', (tester) async {
    await _pump(
      tester,
      _collection(fields: [_f('a', '甲', 'text'), _f('b', '乙', 'number')]),
    );
    expect(find.text('甲'), findsOneWidget);
    expect(find.text('乙'), findsOneWidget);
  });
}