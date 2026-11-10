// M2-T35 自动备份验收：复制 db+wal+shm 到 backups/，并按时间戳轮转只留最新 N 组
//
// 用真实临时目录（dart:io 在 flutter test 里可用），不碰应用数据库。
// 跑法：cd client && flutter test test/db_backup_test.dart

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

import 'package:bijiapp/data/database.dart';

void main() {
  late Directory tmp;

  setUp(() {
    tmp = Directory.systemTemp.createTempSync('bijiapp-backup-test');
  });

  tearDown(() {
    try {
      tmp.deleteSync(recursive: true);
    } catch (_) {}
  });

  File makeDb(Directory dir) {
    final db = File(p.join(dir.path, 'bijiapp.sqlite'));
    db.writeAsStringSync('MAIN');
    File(db.path + '-wal').writeAsStringSync('WAL');
    File(db.path + '-shm').writeAsStringSync('SHM');
    return db;
  }

  test('库不存在时不做备份（返回 null、不建 backups 目录）', () async {
    final missing = File(p.join(tmp.path, 'bijiapp.sqlite'));
    expect(await backupDbWithRotation(missing), isNull);
    expect(Directory(p.join(tmp.path, 'backups')).existsSync(), isFalse);
  });

  test('一次备份会带上 -wal 与 -shm（只拷主库会丢最新数据）', () async {
    final db = makeDb(tmp);
    final made = await backupDbWithRotation(db);
    expect(made, isNotNull);
    expect(made!.existsSync(), isTrue);
    expect(File(made.path + '-wal').readAsStringSync(), 'WAL');
    expect(File(made.path + '-shm').readAsStringSync(), 'SHM');
  });

  test('轮转：keep=3 时只保留最新 3 组（每组 3 个文件）', () async {
    final db = makeDb(tmp);
    for (var i = 0; i < 5; i++) {
      await backupDbWithRotation(db, keep: 3);
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    final backups = Directory(p.join(tmp.path, 'backups')).listSync()
        .whereType<File>()
        .map((f) => p.basename(f.path))
        .toList();
    // 每组 = .bak / .bak-wal / .bak-shm
    expect(backups.length, 3 * 3, reason: '应剩 3 组 × 3 个文件');
    // 文件名的时间戳应递增：最新那组存在即可（取最大戳）
    final ids = backups
        .where((n) => n.endsWith('.bak'))
        .map((n) => n.substring('bijiapp.sqlite.'.length, n.length - 4))
        .toList()
      ..sort();
    expect(ids.length, 3);
    final latest = ids.last;
    expect(File(p.join(tmp.path, 'backups', 'bijiapp.sqlite.$latest.bak')).existsSync(), isTrue);
  });
}