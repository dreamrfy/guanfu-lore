import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'database.dart';
import 'storage_stats_common.dart';

/// 原生实现：读库文件与资源目录的真实占用。
/// 注意：drift_flutter 默认把库放在 documents 目录（app_flutter/），资源在 support 目录——两者不同，别猜。
Future<StorageStats> collectStorageStats(AppDatabase db) async {
  final docs = await getApplicationDocumentsDirectory();
  final dbFile = File(p.join(docs.path, 'bijiapp.sqlite'));
  final wal = File(p.join(docs.path, 'bijiapp.sqlite-wal'));
  var dbBytes = dbFile.existsSync() ? dbFile.lengthSync() : 0;
  if (wal.existsSync()) dbBytes += wal.lengthSync();

  final support = await getApplicationSupportDirectory();
  final assetsDir = Directory(p.join(support.path, 'assets'));
  var assetsBytes = 0;
  var assetFiles = 0;
  if (assetsDir.existsSync()) {
    await for (final f in assetsDir.list(recursive: true, followLinks: false)) {
      if (f is File && !f.path.endsWith('.tmp')) {
        assetFiles++;
        assetsBytes += f.lengthSync();
      }
    }
  }

  final pages = await db.select(db.pages).get();
  final assets = await db.select(db.assets).get();
  final drafts = await db.select(db.drafts).get();
  return StorageStats(
    dbBytes: dbBytes,
    assetsBytes: assetsBytes,
    assetFileCount: assetFiles,
    pagesCount: pages.length,
    assetsCount: assets.length,
    draftsCount: drafts.length,
  );
}
