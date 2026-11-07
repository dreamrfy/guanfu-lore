import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'ids.dart';
import 'pages_table.dart';

part 'database.g.dart';

@DriftDatabase(tables: [Pages])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_open());

  /// 测试/演示用：显式注入执行器（内存库或指定文件）。
  AppDatabase.forTesting(super.e);

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        // P1-T02 只有 v1；真实升级路径在此逐版本追加（迁移前自动备份见 backupDbFile）。
        onUpgrade: (m, from, to) async {},
        beforeOpen: (details) async {
          // 断电/杀进程可靠性的底线：WAL + 参数绑定外键
          await customStatement('PRAGMA journal_mode = WAL');
          await customStatement('PRAGMA synchronous = NORMAL');
          await customStatement('PRAGMA foreign_keys = ON');
        },
      );

  static QueryExecutor _open() => driftDatabase(
        name: 'bijiapp',
        // 网页端：wasm 引擎与 worker 均为本地文件（web/ 目录，构建自动携带）
        web: DriftWebOptions(
          sqlite3Wasm: Uri.parse('sqlite3.wasm'),
          driftWorker: Uri.parse('drift_worker.js'),
        ),
      );

  /// 主库里当前未删除的页面（按更新时间倒序）。
  Future<List<Page>> listActivePages() {
    return (select(pages)..where((t) => t.deleted.equals(false)) ..orderBy([
          (t) => OrderingTerm.desc(t.updatedAt),
        ]))
        .get();
  }

  /// 新建一条页面并返回（稳定 ID 在应用层生成）。
  Future<Page> createPage({String title = '', String content = ''}) async {
    final now = DateTime.now();
    final row = PagesCompanion.insert(
      id: newId(),
      title: Value(title),
      content: Value(content),
      createdAt: now,
      updatedAt: now,
    );
    await into(pages).insert(row);
    final created = await (select(pages)..where((t) => t.id.equals(row.id.value))).getSingle();
    return created;
  }

  Future<void> renamePage(String id, String title) {
    return (update(pages)..where((t) => t.id.equals(id)))
        .write(PagesCompanion(title: Value(title), updatedAt: Value(DateTime.now())));
  }
}

/// 数据库文件位置（与 drift_flutter 的 driftDatabase(name:) 默认目录一致）。
Future<File> appDbFile(String name) async {
  final dir = await getApplicationSupportDirectory();
  return File(p.join(dir.path, '$name.sqlite'));
}

/// 迁移/升级前的安全备份：复制 db 与 -wal/-shm 到同目录 backups/ 子目录。
/// P1-T08 的整库备份会在此基础扩展；这里保证「升级失败可回滚」。
Future<File?> backupDbFile(File dbFile) async {
  if (!dbFile.existsSync()) return null;
  final backupDir = Directory(p.join(dbFile.parent.path, 'backups'));
  if (!backupDir.existsSync()) backupDir.createSync(recursive: true);
  final stamp = DateTime.now().millisecondsSinceEpoch;
  final target = File(p.join(backupDir.path, '${p.basename(dbFile.path)}.$stamp.bak'));
  await dbFile.copy(target.path);
  for (final side in ['-wal', '-shm']) {
    final f = File(dbFile.path + side);
    if (f.existsSync()) await f.copy(File(target.path + side).path);
  }
  return target;
}
