import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqlite3/sqlite3.dart';

/// P1-T02 迁移与回滚演示（独立演示库，不碰正式数据）。
///
/// 演示的正是 drift 等框架底层做的事：
/// ① 旧版本库写入数据 → ② 升级前自动备份 → ALTER TABLE 加列 + user_version 升号 → 数据完整
/// → ③ 回滚 = 用备份恢复 → 重开校验数据与版本号回到旧版。
Future<String> runMigrationDemo() async {
  final dir = await getApplicationSupportDirectory();
  final demoDir = Directory(p.join(dir.path, 'migration-demo'));
  if (demoDir.existsSync()) demoDir.deleteSync(recursive: true);
  demoDir.createSync(recursive: true);
  final dbPath = p.join(demoDir.path, 'demo.sqlite');

  // ① 造一个「旧版本」库（v1：没有 tags 列），写入 2 条数据
  final old = sqlite3.open(dbPath);
  old.execute(
      'CREATE TABLE pages (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL)');
  old.execute("INSERT INTO pages VALUES ('a-1', '旧库笔记一', '升级前写入的第一条')");
  old.execute("INSERT INTO pages VALUES ('a-2', '旧库笔记二', '升级前写入的第二条')");
  old.execute('PRAGMA user_version = 1');
  old.dispose();

  // ② 升级：先自动备份（回滚的保险），再加列、升版本号
  final backupPath = '$dbPath.before-v2.bak';
  File(dbPath).copySync(backupPath);
  final up = sqlite3.open(dbPath);
  up.execute("ALTER TABLE pages ADD COLUMN tags TEXT NOT NULL DEFAULT ''");
  up.execute("UPDATE pages SET tags = '演示标签' WHERE id = 'a-1'");
  up.execute('PRAGMA user_version = 2');
  final migrated = up.select('SELECT id, title, tags FROM pages ORDER BY id');
  final migratedOk = migrated.length == 2 && migrated.first['tags'] == '演示标签';
  up.dispose();

  // ③ 回滚：备份覆盖回去，重开校验（应回到 v1 原样，2 条数据完好）
  final dbFile = File(dbPath);
  dbFile.deleteSync();
  File(backupPath).copySync(dbPath);
  final down = sqlite3.open(dbPath);
  final version = down.select('PRAGMA user_version').first.values[0] as int;
  final rows = down.select('SELECT id, title FROM pages ORDER BY id');
  final rollbackOk = version == 1 && rows.length == 2;
  down.dispose();

  final ok = migratedOk && rollbackOk;
  return '迁移演示${ok ? '通过' : '失败'}（演示库 $dbPath，独立于正式数据）：\n'
      '① 旧库 v1 写入 2 条 → 自动备份 → 加列升级 v2 → ${migratedOk ? '2 条数据完整 ✅' : '数据异常 ❌'}\n'
      '② 回滚到备份重开 → ${rollbackOk ? '版本号回到 1、2 条完好 ✅' : '回滚异常 ❌'}';
}
