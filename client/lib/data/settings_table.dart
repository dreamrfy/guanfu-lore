import 'package:drift/drift.dart';

/// 应用级键值设置（V2.1 ④）：剪藏服务端地址、剪藏目标表 id 等轻量配置。
/// 值一律字符串；结构化配置由上层自行序列化。
class AppSettings extends Table {
  TextColumn get key => text()();
  TextColumn get value => text().withDefault(const Constant(''))();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {key};
}
