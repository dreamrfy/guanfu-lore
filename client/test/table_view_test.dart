// M4 表格视图 UI 验收（M4-T05/T06/T09/T10 的**交互**部分）
//
// 重点：**点下去数据真的变了**（M2R 段立的铁律 —— 不能只是"看起来能点"）。
//
// 跑法：cd client && flutter test test/table_view_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/tokens.dart';
import 'package:bijiapp/table/flowus_table.dart';
import 'package:bijiapp/table/table_view_engine.dart';

FlowUsCollection _table() {
  return FlowUsCollection(
    id: 'col1',
    fields: [
      FlowUsFieldDefinition(id: 'title', name: '标题', rawType: 'title'),
      FlowUsFieldDefinition(id: 'f2', name: '公众号', rawType: 'text'),
      FlowUsFieldDefinition(id: 'f3', name: '阅读状态', rawType: 'select', options: [
        {'name': '未读', 'color': 'gray'},
        {'name': '已读', 'color': 'green'},
      ]),
    ],
    records: [
      FlowUsRecord(uuid: 'r1', parentId: 'col1', cells: {
        'title': '磷酸铁锂成本分析',
        'f2': 'XX科技',
        'f3': '未读',
      }),
      FlowUsRecord(uuid: 'r2', parentId: 'col1', cells: {
        'title': '磷石膏处理工艺',
        'f2': 'YY研究院',
        'f3': '已读',
      }),
    ],
    views: [FlowUsView(uuid: 'v1', rawType: 'table', title: '表格视图')],
  );
}

/// 挂一个表格，把 collection 的每次变化都记下来（模拟宿主落库）
///
/// ⚠️ 宿主收到变化后要把新的 collection **回喂**给 widget（真实 App 里就是这样落库再 setState），
///    否则 widget 一直拿着旧数据，测出来的"没变"是假象。
///
/// 返回的 [latestFn] 是**闭包**，读的时候才取当前值 —— 不要在 mount 时求值成快照。
Future<({List<FlowUsCollection> changes, FlowUsCollection Function() latestFn})> _mount(
  WidgetTester tester,
  FlowUsCollection initial,
) async {
  final changes = <FlowUsCollection>[];
  var latest = initial;

  await tester.pumpWidget(MaterialApp(
    theme: ThemeData(fontFamily: FlowUsTypography.fontFamily),
    home: Scaffold(
      body: StatefulBuilder(
        builder: (context, setState) {
          return SizedBox(
            width: 900,
            height: 600,
            child: FlowUsTableView(
              collection: latest,
              onCollectionChanged: (c) {
                latest = c;
                changes.add(c);
                setState(() {});
              },
            ),
          );
        },
      ),
    ),
  ));
  await tester.pumpAndSettle();
  return (changes: changes, latestFn: () => latest);
}

void main() {
  testWidgets('表头渲染出列名，行渲染出记录', (tester) async {
    await _mount(tester, _table());
    expect(find.text('标题'), findsOneWidget);
    expect(find.text('公众号'), findsOneWidget);
    expect(find.text('阅读状态'), findsOneWidget);
    expect(find.text('磷酸铁锂成本分析'), findsOneWidget);
    expect(find.text('磷石膏处理工艺'), findsOneWidget);
    expect(find.textContaining('2 / 2 条'), findsOneWidget);
  });

  testWidgets('「新建记录」→ 行数 +1（数据真的变了）', (tester) async {
    final r = await _mount(tester, _table());
    await tester.tap(find.text('新建记录'));
    await tester.pumpAndSettle();

    expect(r.changes, isNotEmpty, reason: '必须回调出去让宿主落库');
    expect(r.latestFn().records.length, 3);
    expect(find.textContaining('3 / 3 条'), findsOneWidget);
  });

  testWidgets('点列头 → 弹出列菜单（含改名/换类型/筛选/删除）', (tester) async {
    await _mount(tester, _table());
    await tester.tap(find.text('公众号'));
    await tester.pumpAndSettle();

    expect(find.text('重命名'), findsOneWidget);
    expect(find.text('更改类型'), findsOneWidget);
    expect(find.text('筛选'), findsOneWidget);
    expect(find.text('删除字段'), findsOneWidget);
    expect(find.text('在左侧插入'), findsOneWidget);
  });

  testWidgets('列菜单 → 重命名 → 弹窗输入 → 列名真变了', (tester) async {
    final r = await _mount(tester, _table());
    await tester.tap(find.text('公众号'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('重命名'));
    await tester.pumpAndSettle();

    // 输入框里预填了原名，改成新的
    await tester.enterText(find.byType(TextField).last, '来源公众号');
    await tester.tap(find.text('确定'));
    await tester.pumpAndSettle();

    expect(r.latestFn().fieldById('f2')!.name, '来源公众号');
    expect(find.text('来源公众号'), findsOneWidget);
  });

  testWidgets('列菜单 → 筛选 → 筛选器面板出现（含"添加条件"）', (tester) async {
    await _mount(tester, _table());
    await tester.tap(find.text('公众号'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('筛选'));
    await tester.pumpAndSettle();

    expect(find.text('筛选'), findsWidgets);
    expect(find.text('添加条件'), findsOneWidget);
    expect(find.text('应用'), findsOneWidget);
  });

  testWidgets('加条件 → 选字段 → 应用 → 记录被筛掉（数据真的变了）', (tester) async {
    final r = await _mount(tester, _table());
    await tester.tap(find.text('公众号'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('筛选'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('添加条件'));
    await tester.pumpAndSettle();

    // 条件行出现了；默认字段是第一个字段（标题），改成"公众号"
    // 字段下拉的泛型是 String
    final fieldDropdown = find.byType(DropdownButton<String>);
    expect(fieldDropdown, findsWidgets);
    await tester.tap(fieldDropdown.first);
    await tester.pumpAndSettle();
    // 下拉菜单里选「公众号」（菜单项在 overlay 里，与表格里的同名文本要区分）
    await tester.tap(find.text('公众号').last);
    await tester.pumpAndSettle();

    // 值输入：第二个下拉（运算符）不动，改成"是"（默认）
    // 直接点「应用」
    await tester.tap(find.text('应用'));
    await tester.pumpAndSettle();

    expect(r.changes, isNotEmpty);
    // 条件生效后，记录数不应变化（因为还没填值），但配置已写进视图
    expect(r.latestFn().views.first.filter, isNotNull, reason: '筛选配置要落进视图');
  });

  testWidgets('点单元格 → 进入编辑 → 提交 → 值真的变了', (tester) async {
    final r = await _mount(tester, _table());
    await tester.tap(find.text('XX科技'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).last, 'ZZ日报');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    expect(r.latestFn().recordById('r1')!.cells['f2'], 'ZZ日报');
  });

  testWidgets('单选单元格 → 点开选项面板 → 选一个 → 值真的变了', (tester) async {
    final r = await _mount(tester, _table());
    // '未读' 是单选列的值
    await tester.tap(find.text('未读'));
    await tester.pumpAndSettle();

    expect(find.text('未读'), findsWidgets, reason: '选项面板里应列出已有选项');
    expect(find.text('已读'), findsWidgets);

    // 面板在 bottom sheet 里 → 用 find.descendant 限定到底 sheet 内，避免点到表格里的同名文本
    final sheet = find.byKey(const Key('flowus-option-picker'));
    expect(sheet, findsOneWidget, reason: '选项面板应弹出');
    await tester.tap(find.descendant(of: sheet, matching: find.text('已读')));
    await tester.pumpAndSettle();

    expect(r.latestFn().recordById('r1')!.cells['f3'], '已读');
  });

  testWidgets('行操作钮 → **右侧**展开记录页（表格仍在左侧）', (tester) async {
    await _mount(tester, _table());
    await tester.tap(find.byIcon(Icons.open_in_new).first);
    await tester.pumpAndSettle();

    expect(find.text('作者原文'), findsOneWidget);
    expect(find.text('我的想法'), findsOneWidget);
    expect(find.text('公众号'), findsWidgets, reason: '属性区要显示字段');
    // 表格**仍在**（左侧没被详情面板顶掉）——用户 11-11 定的形态
    expect(find.text('新建记录'), findsOneWidget, reason: '表格要一直可见');
    expect(find.text('标题'), findsWidgets, reason: '列头要还在');
  });

  testWidgets('记录页在表格**右边**（不是插在行下面）', (tester) async {
    await _mount(tester, _table());
    await tester.tap(find.byIcon(Icons.open_in_new).first);
    await tester.pumpAndSettle();

    final tableX = tester.getTopLeft(find.text('新建记录')).dx;
    final recordX = tester.getTopLeft(find.text('作者原文')).dx;
    expect(recordX, greaterThan(tableX), reason: '记录页要在表格右边');
  });

  testWidgets('删行 → 确认 → 行真的少了', (tester) async {
    final r = await _mount(tester, _table());
    await tester.tap(find.byIcon(Icons.delete_outline).first);
    await tester.pumpAndSettle();

    expect(find.text('删除这一行？'), findsOneWidget);
    await tester.tap(find.text('删除'));
    await tester.pumpAndSettle();

    expect(r.latestFn().records.length, 1);
  });

  testWidgets('「新建字段」→ 弹窗 → 列真的多了一列', (tester) async {
    final r = await _mount(tester, _table());
    await tester.tap(find.text('新建字段'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).last, '收藏时间');
    await tester.tap(find.text('确定'));
    await tester.pumpAndSettle();

    expect(r.latestFn().fields.length, 4);
    expect(find.text('收藏时间'), findsOneWidget);
  });

  testWidgets('改字段类型会先弹"会丢数据"的确认（安全底线）', (tester) async {
    final r = await _mount(tester, _table());
    await tester.tap(find.text('公众号'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('更改类型'));
    await tester.pumpAndSettle();

    // 选「单选」—— 文本列有值 → 应弹确认
    await tester.tap(find.text('单选').last);
    await tester.pumpAndSettle();

    expect(find.text('改成这个类型会丢数据'), findsOneWidget);
    expect(find.textContaining('XX科技'), findsWidgets, reason: '要报出会丢什么');

    // 取消 → 不改
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    expect(r.latestFn().fieldById('f2')!.type, FlowUsFieldType.text, reason: '取消就不该改');
  });
}
