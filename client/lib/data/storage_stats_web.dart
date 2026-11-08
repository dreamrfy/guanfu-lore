import 'database.dart';
import 'storage_stats_common.dart';

/// 网页实现：浏览器托管，无文件系统可读；只报数据库侧计数。
Future<StorageStats> collectStorageStats(AppDatabase db) async {
  final pages = await db.select(db.pages).get();
  final assets = await db.select(db.assets).get();
  final drafts = await db.select(db.drafts).get();
  return StorageStats(
    dbBytes: 0,
    assetsBytes: 0,
    assetFileCount: 0,
    pagesCount: pages.length,
    assetsCount: assets.length,
    draftsCount: drafts.length,
  );
}
