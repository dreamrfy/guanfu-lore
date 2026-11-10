// M2-T15 装配验收：演示壳接真实库 + 保存链 + 草稿恢复横幅
//
// 真 FlowUs 的"崩溃恢复提示长什么样"**没采到**（任务表已注明），所以横幅文案只是占位，
// 这里只验**链路**：草稿与主库不同 → 出现横幅；点「恢复」把草稿写进正文。
//
// 跑法：cd client && flutter test test/m2_assembly_test.dart

import 'dart:ffi' as ffi;
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/open.dart';

import 'package:bijiapp/data/database.dart';
import 'package:bijiapp/main_shell.dart';

void _setupSqlite() {
  if (Platform.isWindows) {
    open.overrideFor(OperatingSystem.windows, () => ffi.DynamicLibrary.open('winsqlite3.dll'));
  }
}

void main() {
  _setupSqlite();

  testWidgets('空库启动：自动建页并显示演示正文，无草稿横幅', (tester) async {
    tester.view.physicalSize = const Size(1920, 945);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    await tester.pumpWidget(ShellApp(database: db));
    await tester.pumpAndSettle();

    // 自动建了一页
    final pages = await db.listAllActive();
    expect(pages.length, 1);
    expect(pages.first.title, '学习进度');

    // 正文渲染（富文本内核）
    expect(find.text('标题一（30/45/w600）'), findsNothing, reason: '内核按块渲染，不是整段 Text');
    expect(find.text('添加评论'), findsOneWidget);
    expect(find.text('发现未保存的草稿（上次编辑没来得及保存）'), findsNothing);
  });

  testWidgets('有可恢复草稿 → 出现恢复横幅；点「恢复」写进正文并收起横幅', (tester) async {
    tester.view.physicalSize = const Size(1920, 945);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    // 先造一页 + 一条与正文不同的草稿
    final page = await db.createPage(title: '学习进度', content: '{"document":{"type":"page","children":[]}}');
    await db.saveDraft(page.id, '{"document":{"type":"page","children":[{"type":"paragraph","data":{"delta":[{"insert":"草稿里的字"}]}}]}}');

    await tester.pumpWidget(ShellApp(database: db));
    await tester.pumpAndSettle();

    expect(find.text('发现未保存的草稿（上次编辑没来得及保存）'), findsOneWidget);
    await tester.tap(find.text('恢复'));
    await tester.pumpAndSettle();

    // 横幅收起、草稿已清空、正文写进了主库
    expect(find.text('发现未保存的草稿（上次编辑没来得及保存）'), findsNothing);
    expect(await db.draftFor(page.id), isNull);
    expect((await db.pageById(page.id))!.content, contains('草稿里的字'));
  });

  testWidgets('点「忽略」→ 草稿清空、主库正文不变', (tester) async {
    tester.view.physicalSize = const Size(1920, 945);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    const stored = '{"document":{"type":"page","children":[]}}';
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    final page = await db.createPage(title: '学习进度', content: stored);
    await db.saveDraft(page.id, '{"document":{"type":"page","children":[{"type":"paragraph","data":{"delta":[{"insert":"不要的字"}]}}]}}');

    await tester.pumpWidget(ShellApp(database: db));
    await tester.pumpAndSettle();
    await tester.tap(find.text('忽略'));
    await tester.pumpAndSettle();

    expect(await db.draftFor(page.id), isNull);
    expect((await db.pageById(page.id))!.content, stored);
  });
}