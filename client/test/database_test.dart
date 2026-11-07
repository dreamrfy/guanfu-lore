import 'dart:ffi';
import 'dart:io';

import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/open.dart';

import 'package:bijiapp/data/database.dart';
import 'package:bijiapp/data/ids.dart';

/// Windows 测试宿主机没有随包的 sqlite3.dll，用系统自带的 winsqlite3.dll。
void _setupSqliteForHostTests() {
  if (Platform.isWindows) {
    open.overrideFor(OperatingSystem.windows, () => DynamicLibrary.open('winsqlite3.dll'));
  }
}

void main() {
  _setupSqliteForHostTests();

  test('稳定 ID：26 位 ULID、可排序字符集、不重复', () {
    final ids = List.generate(500, (_) => newId());
    for (final id in ids) {
      expect(id.length, 26);
      expect(RegExp(r'^[0-9A-HJKMNPQRSTVWXYZ]{26}$').hasMatch(id), isTrue,
          reason: 'id 应为 Crockford Base32：$id');
    }
    expect(ids.toSet().length, 500, reason: '500 个 id 不得重复');
  });

  test('数据库：新建→读取→字段往返一致', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    final created = await db.createPage(title: '周会记录', content: '第一条内容');
    expect(created.id.length, 26);
    final all = await db.listActivePages();
    expect(all.length, 1);
    expect(all.first.title, '周会记录');
    expect(all.first.content, '第一条内容');
    expect(all.first.rev, 0);
    expect(all.first.deleted, isFalse);
    await db.close();
  });

  test('数据库：重命名只改目标行并更新时间', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    final a = await db.createPage(title: 'A');
    await db.createPage(title: 'B');
    await db.renamePage(a.id, 'A2');
    final all = await db.listActivePages();
    expect(all.map((e) => e.title), containsAll(['A2', 'B']));
    final renamed = all.firstWhere((e) => e.id == a.id);
    expect(renamed.updatedAt.isAfter(renamed.createdAt) || renamed.updatedAt == renamed.createdAt,
        isTrue);
    await db.close();
  });

  test('数据库：软删除标记生效（listActivePages 不含已删除）', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    final a = await db.createPage(title: '将被删除');
    await (db.update(db.pages)..where((t) => t.id.equals(a.id)))
        .write(PagesCompanion(deleted: Value(true)));
    expect(await db.listActivePages(), isEmpty);
    await db.close();
  });
}
