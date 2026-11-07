import 'asset_store_common.dart';
import 'database.dart';

/// 兜底实现（既无 io 也无 web 的平台不存在；保持条件导出链完整）。
class PlatformAssetStore implements AssetStore {
  PlatformAssetStore({AppDatabase? db});

  @override
  Future<StoredAsset> save(List<int> bytes, String ext) => throw UnsupportedError('此平台不支持资源存储');

  @override
  Future<List<int>?> read(String assetId, String ext) => throw UnsupportedError('此平台不支持资源存储');

  @override
  Future<bool> verify(String assetId, String ext, String sha256Hex) => throw UnsupportedError('此平台不支持资源存储');
}
