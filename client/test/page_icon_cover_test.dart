// M2-T23 图标/封面数据接线验收
//
// 要点：
//   · pages 表新增 coverKey 列（v8→v9 迁移）—— 与真实模型对齐：封面是页面自身的字段（基准-文档模型 §3）
//   · 侧栏页项：有 emoji 图标就显示 emoji（对齐 pages.icon），没有才回落到类型图标
//   · 壳层：pageIcon 非空 → 「添加图标」入口消失；pageCoverKey 非空 → 「添加封面」消失（对齐 M2-T11 实测）
//
// 跑法：cd client && flutter test test/page_icon_cover_test.dart

import 'dart:ffi' as ffi;
import 'dart:io';

import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/open.dart';

import 'package:bijiapp/data/database.dart';
import 'package:bijiapp/shell/flowus_shell.dart';

void _setupSqlite() {
  if (Platform.isWindows) {
    open.overrideFor(OperatingSystem.windows, () => ffi.DynamicLibrary.open('winsqlite3.dll'));
  }
}

const _data = SidebarData(
  spaceName: '两相欢的空间',
  privatePages: [
    PageNode(id: 'a', title: '微信公众号剪藏', icon: '📰'),
    PageNode(id: 'b', title: '网页剪藏', icon: '✂️'),
    PageNode(id: 'c', title: '配置'), // 无图标 → 回落到类型图标
    PageNode(id: 'd', title: '有封面的页', coverKey: 'assets/cover1.png'),
  ],
);

Future<void> _pumpShell(WidgetTester tester, {String pageIcon = '', String pageCoverKey = ''}) async {
  tester.view.physicalSize = const Size(1920, 945);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: FlowUsShell(data: _data, pageIcon: pageIcon, pageCoverKey: pageCoverKey),
  ));
  await tester.pumpAndSettle();
}

void main() {
  _setupSqlite();

  group('侧栏页项图标（对齐 pages.icon）', () {
    testWidgets('有 emoji 图标的页显示 emoji，无图标的仍用类型图标', (tester) async {
      await _pumpShell(tester);
      expect(find.text('📰'), findsOneWidget, reason: '微信公众号剪藏的 emoji 图标');
      expect(find.text('✂️'), findsOneWidget, reason: '网页剪藏的 emoji 图标');
      // 「配置」没有 emoji → 用类型图标（IcPages）
      expect(
        find.descendant(of: find.byType(FlowUsSidebar), matching: find.byType(Text)).evaluate().any((e) {
          final w = e.widget as Text;
          return w.data == '配置';
        }),
        isTrue,
      );
    });
  });

  group('入口显隐由数据驱动（M2-T11 规则）', () {
    testWidgets('无图标无封面 → 三个入口都在', (tester) async {
      await _pumpShell(tester);
      expect(find.text('添加图标'), findsOneWidget);
      expect(find.text('添加封面'), findsOneWidget);
      expect(find.text('添加评论'), findsOneWidget);
    });

    testWidgets('pageIcon 非空 → 「添加图标」消失', (tester) async {
      await _pumpShell(tester, pageIcon: '📊');
      expect(find.text('添加图标'), findsNothing);
      expect(find.text('添加封面'), findsOneWidget);
    });

    testWidgets('pageCoverKey 非空 → 「添加封面」消失、且只剩「添加评论」', (tester) async {
      await _pumpShell(tester, pageCoverKey: 'assets/cover1.png');
      expect(find.text('添加封面'), findsNothing);
      expect(find.text('添加图标'), findsNothing, reason: '有封面时整列入隐藏（与实测一致：只剩添加评论）');
      expect(find.text('添加评论'), findsOneWidget);
    });
  });

  group('数据层：coverKey 列与迁移', () {
    test('schemaVersion = 9（v8→v9 加 coverKey）', () async {
      final db = AppDatabase.forTesting(NativeDatabase.memory());
      addTearDown(db.close);
      expect(db.schemaVersion, 9);
    });

    test('setPageCover 写入与清空', () async {
      final db = AppDatabase.forTesting(NativeDatabase.memory());
      addTearDown(db.close);
      final page = await db.createPage(title: '带封面');
      expect(page.coverKey, '');
      await db.setPageCover(page.id, 'assets/cover1.png');
      expect((await db.pageById(page.id))!.coverKey, 'assets/cover1.png');
      await db.setPageCover(page.id, '');
      expect((await db.pageById(page.id))!.coverKey, '');
    });

    test('setPageIcon 与 icon 列联动（侧栏 emoji 的数据来源）', () async {
      final db = AppDatabase.forTesting(NativeDatabase.memory());
      addTearDown(db.close);
      final page = await db.createPage(title: 'x');
      await db.setPageIcon(page.id, '📰');
      expect((await db.pageById(page.id))!.icon, '📰');
    });
  });
}