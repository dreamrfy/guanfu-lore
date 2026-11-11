// M4 端到端：**表格改了 → 真的落库 → 重开还在**
//
// 这是 M4 最要紧的一条（M2R 段立的铁律：不能只是"看起来能点"）。
// 之前 M2 装配测试就漏了"演示壳只落内存"这类问题，这次直接盯住落库。
//
// 跑法：cd client && flutter test test/table_persistence_test.dart

import 'dart:ffi' as ffi;
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/open.dart';

import 'package:bijiapp/data/database.dart';
import 'package:bijiapp/main_shell.dart';
import 'package:bijiapp/table/flowus_table.dart';
import 'package:bijiapp/table/table_engine.dart';

void _setupSqlite() {
  if (Platform.isWindows) {
    open.overrideFor(OperatingSystem.windows, () => ffi.DynamicLibrary.open('winsqlite3.dll'));
  }
}

void main() {
  _setupSqlite();

  testWidgets('剪藏库多维表：加列/加行/改值 → 落库 → 重开还在', (tester) async {
    tester.view.physicalSize = const Size(1920, 945);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    await tester.pumpWidget(ShellApp(database: db));
    await tester.pumpAndSettle();

    // ---- 找到「剪藏库」页 ----
    final pages = await db.listAllActive();
    final clipPage = pages.firstWhere((p) => p.title == '剪藏库');
    expect(clipPage.type, 'table', reason: '剪藏库必须是多维表页');

    // 初始字段（建议值）
    var collection = FlowUsCollection.fromStoredJson(clipPage.content);
    final initialFieldCount = collection.fields.length;
    expect(initialFieldCount, greaterThan(3), reason: '应该有一套建议字段');
    expect(collection.fieldById('title'), isNotNull, reason: '第一列是标题列');

    // ---- 模拟用户操作：加一列 + 加一行 + 改一个值 ----
    var next = FlowUsTableEngine.addColumn(collection, name: '我的评分');
    next = FlowUsTableEngine.addRow(next);
    next = FlowUsTableEngine.setCell(next, next.records.first.uuid, 'title', '磷石膏处理工艺');
    next = FlowUsTableEngine.setCell(next, next.records.first.uuid, '我的评分', 5);

    // ---- 落库（走真实的 updatePageContent）----
    await db.updatePageContent(clipPage.id, next.toStoredJson());

    // ---- 重新读出来（模拟重启 App）----
    final reread = FlowUsCollection.fromStoredJson((await db.pageById(clipPage.id))!.content);
    expect(reread.fields.length, initialFieldCount + 1, reason: '新列要还在');
    expect(reread.fieldById('fld1')?.name ?? reread.fields.last.name, '我的评分');
    expect(reread.records.length, 1, reason: '新行要还在');
    expect(reread.records.first.cells['title'], '磷石膏处理工艺');
    expect(reread.records.first.cells['我的评分'], 5);
  });

  testWidgets('记录页：改「我的想法」+ 改属性 → 落库 → 重开还在', (tester) async {
    tester.view.physicalSize = const Size(1920, 945);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    await tester.pumpWidget(ShellApp(database: db));
    await tester.pumpAndSettle();

    // 先造一条记录
    final pages0 = await db.listAllActive();
    final clipPage0 = pages0.firstWhere((p) => p.title == '剪藏库');
    var c = FlowUsCollection.fromStoredJson(clipPage0.content);
    c = FlowUsTableEngine.addRow(c);
    c = FlowUsTableEngine.setCell(c, c.records.first.uuid, 'title', '磷酸铁锂成本分析');
    await db.updatePageContent(clipPage0.id, c.toStoredJson());

    // 重开 App（重新 pump，让它读到新数据）
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    await tester.pumpWidget(ShellApp(database: db));
    await tester.pumpAndSettle();

    // 点开剪藏库 → 点行 → 记录页展开
    await tester.tap(find.text('剪藏库').first);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.open_in_new).first);
    await tester.pumpAndSettle();

    // 记录页在**右侧面板**（用户 11-11 定的形态：表格在左、详情在右）
    expect(find.text('作者原文'), findsOneWidget, reason: '记录页要展开在右侧');
    expect(find.text('我的想法'), findsOneWidget);

    // 在「我的想法」里写点东西（记录页的最后一个 TextField 就是它）
    await tester.enterText(find.byType(TextField).last, '这个数据我觉得有问题');
    await tester.pumpAndSettle();

    // 落库检查
    final pages1 = await db.listAllActive();
    final clipPage1 = pages1.firstWhere((p) => p.title == '剪藏库');
    final after = FlowUsCollection.fromStoredJson((await db.pageById(clipPage1.id))!.content);
    expect(after.records.length, 1);
    expect(after.records.first.cells['__notes'], '这个数据我觉得有问题',
        reason: '「我的想法」必须真的落库');
  });

  testWidgets('演示壳打开「剪藏库」→ 渲染表格（能点、能加行）', (tester) async {
    tester.view.physicalSize = const Size(1920, 945);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    await tester.pumpWidget(ShellApp(database: db));
    await tester.pumpAndSettle();

    // 点侧栏「剪藏库」（侧栏那个 Text，不是标题输入框里的）
    final sidebarItem = find.text('剪藏库').first;
    await tester.tap(sidebarItem);
    await tester.pumpAndSettle();

    // 表格渲染出来了：列头 + 「新建记录」按钮
    expect(find.text('新建记录'), findsOneWidget, reason: '表格工具条要在');
    expect(find.text('来源类型'), findsOneWidget, reason: '列头要在');
    expect(find.text('AI 状态'), findsOneWidget);

    // 点「新建记录」→ 真的多一行（并落库）
    await tester.tap(find.text('新建记录'));
    await tester.pumpAndSettle();

    final pages = await db.listAllActive();
    final clipPage = pages.firstWhere((p) => p.title == '剪藏库');
    final after = FlowUsCollection.fromStoredJson((await db.pageById(clipPage.id))!.content);
    expect(after.records.length, 1, reason: '新建记录必须落库，不能只在内存里');
  });
}
