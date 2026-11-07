import 'package:crypto/crypto.dart';

/// 允许的扩展名白名单（与服务端 images.ts 口径一致：只收位图）。
const assetExtWhitelist = {'png', 'jpg', 'jpeg', 'gif', 'webp'};

class StoredAsset {
  const StoredAsset({
    required this.id,
    required this.sha256Hex,
    required this.size,
    required this.ext,
  });
  final String id; // sha256 前 16 位
  final String sha256Hex; // 完整 64 位
  final int size;
  final String ext;
}

/// 资源存储接口：调用方只见「按编号存取」，不接触路径与实现（G1）。
abstract class AssetStore {
  Future<StoredAsset> save(List<int> bytes, String ext);
  Future<List<int>?> read(String assetId, String ext);
  Future<bool> verify(String assetId, String ext, String sha256Hex);
}

String assetIdOf(List<int> bytes) => sha256.convert(bytes).toString().substring(0, 16);
String fullShaOf(List<int> bytes) => sha256.convert(bytes).toString();

void assertExtAllowed(String ext) {
  if (!assetExtWhitelist.contains(ext)) {
    throw ArgumentError('不支持的资源类型: $ext（白名单: ${assetExtWhitelist.join('/')}）');
  }
}
