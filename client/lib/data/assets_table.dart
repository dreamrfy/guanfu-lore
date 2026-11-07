import 'package:drift/drift.dart';

/// 资源台账（G1 客户端版：只存内容指纹编号，绝不存来源 URL 或原路径）。
class Assets extends Table {
  TextColumn get id => text()(); // SHA-256 前 16 位十六进制（与服务端 assetId 同规格）
  TextColumn get sha256 => text()(); // 完整 64 位哈希（完整性校验基准）
  IntColumn get size => integer()(); // 字节数
  TextColumn get ext => text()(); // 白名单扩展名：png/jpg/jpeg/gif/webp
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// 页面 ↔ 资源 关联（一页多图，sortKey 定顺序）。
class PageAssets extends Table {
  TextColumn get pageId => text()();
  TextColumn get assetId => text()();
  IntColumn get sortKey => integer().withDefault(const Constant(0))();
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {pageId, assetId};
}

/// 网页端资源字节仓（浏览器无文件系统；原生端走文件存储，不使用此表）。
class WebAssetBlobs extends Table {
  TextColumn get id => text()();
  BlobColumn get bytes => blob()();

  @override
  Set<Column> get primaryKey => {id};
}
