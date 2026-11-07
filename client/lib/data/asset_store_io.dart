import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'asset_store_common.dart';
import 'database.dart' show AppDatabase;

/// 原生实现：应用支持目录 `assets/<id 前 2 位>/<id>.<ext>`，两级分片 + 原子写入。
/// db 参数与网页实现保持构造签名一致，原生端不使用（故不落字段）。
class PlatformAssetStore implements AssetStore {
  PlatformAssetStore({AppDatabase? db, this.rootOverride});

  final Directory? rootOverride; // 测试注入临时目录
  Directory? _root;

  Future<Directory> _rootDir() async {
    final existing = _root;
    if (existing != null) return existing;
    if (rootOverride != null) {
      _root = rootOverride;
    } else {
      final base = await getApplicationSupportDirectory();
      _root = Directory(p.join(base.path, 'assets'));
    }
    if (!_root!.existsSync()) _root!.createSync(recursive: true);
    return _root!;
  }

  Future<File> _fileFor(String assetId, String ext) async {
    final root = await _rootDir();
    return File(p.join(root.path, assetId.substring(0, 2), '$assetId.$ext'));
  }

  @override
  Future<StoredAsset> save(List<int> bytes, String ext) async {
    assertExtAllowed(ext);
    final full = fullShaOf(bytes);
    final id = full.substring(0, 16);
    final f = await _fileFor(id, ext);
    await f.parent.create(recursive: true); // 分片子目录
    if (!f.existsSync()) {
      // 原子写入：先写临时名再重命名，断电不留半个文件
      final tmp = File('${f.path}.tmp');
      await tmp.writeAsBytes(bytes, flush: true);
      await tmp.rename(f.path);
    }
    return StoredAsset(id: id, sha256Hex: full, size: bytes.length, ext: ext);
  }

  @override
  Future<List<int>?> read(String assetId, String ext) async {
    final f = await _fileFor(assetId, ext);
    if (!f.existsSync()) return null;
    return f.readAsBytes();
  }

  @override
  Future<bool> verify(String assetId, String ext, String sha256Hex) async {
    final bytes = await read(assetId, ext);
    if (bytes == null) return false;
    return fullShaOf(bytes) == sha256Hex;
  }
}
