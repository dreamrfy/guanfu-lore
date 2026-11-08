import 'database.dart';
import 'storage_stats_common.dart';

/// 兜底实现（既无 io 也无 web 的平台不存在；保持条件导出链完整）。
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
