import 'dart:typed_data';

import 'package:drift/drift.dart';

import 'asset_store_common.dart';
import 'database.dart';

/// 网页实现：资源字节存数据库（WebAssetBlobs 表，OPFS/IndexedDB 之上的 drift 管理）。
class PlatformAssetStore implements AssetStore {
  PlatformAssetStore({AppDatabase? db}) : _db = db!;
  final AppDatabase _db;

  @override
  Future<StoredAsset> save(List<int> bytes, String ext) async {
    assertExtAllowed(ext);
    final full = fullShaOf(bytes);
    final id = full.substring(0, 16);
    await _db.into(_db.webAssetBlobs).insertOnConflictUpdate(
          WebAssetBlobsCompanion.insert(id: id, bytes: Uint8List.fromList(bytes)),
        );
    return StoredAsset(id: id, sha256Hex: full, size: bytes.length, ext: ext);
  }

  @override
  Future<List<int>?> read(String assetId, String ext) async {
    final row = await (_db.select(_db.webAssetBlobs)
          ..where((t) => t.id.equals(assetId)))
        .getSingleOrNull();
    return row?.bytes;
  }

  @override
  Future<bool> verify(String assetId, String ext, String sha256Hex) async {
    final bytes = await read(assetId, ext);
    if (bytes == null) return false;
    return fullShaOf(bytes) == sha256Hex;
  }
}
