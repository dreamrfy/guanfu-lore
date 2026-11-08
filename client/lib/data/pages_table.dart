import 'package:drift/drift.dart';

/// 页面类型（方案-FlowUs对齐调整 v1 ①：一切皆页面，多维表是一种页面类型）。
class PageTypes {
  static const String page = 'page'; // 普通页面（块编辑器）
  static const String table = 'table'; // 多维表（表格视图，P2-② 提供视图）

  static bool isValid(String t) => t == page || t == table;
}

/// P1-T02 数据模型 v1：页面/笔记。
/// 需求 §4.1：稳定身份不依赖标题与路径（id 为 26 位 ULID 主键）；
/// 需求 §4.2：同步状态独立建模（rev/baseRev/updatedBy 按 P0-T07 冻结方案预埋，P7 启用）。
class Pages extends Table {
  TextColumn get id => text()(); // 26 位 ULID
  TextColumn get parentId => text().nullable()(); // 页面树（P2-T01 启用）
  TextColumn get type => text().withDefault(const Constant(PageTypes.page))(); // 页面类型（V2.1 ①）
  TextColumn get title => text().withDefault(const Constant(''))();
  TextColumn get content => text().withDefault(const Constant(''))();
  IntColumn get sortKey => integer().withDefault(const Constant(0))();
  BoolColumn get deleted => boolean().withDefault(const Constant(false))(); // 软删除（回收站 P1-T06 启用）
  DateTimeColumn get deletedAt => dateTime().nullable()(); // 移入回收站的时间（恢复时清空）
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();

  // —— 同步预埋（P0-T07 冻结方案，P7 启用）——
  IntColumn get rev => integer().withDefault(const Constant(0))(); // 云端最新版本号
  IntColumn get baseRev => integer().withDefault(const Constant(0))(); // 本机基于的版本号
  TextColumn get updatedBy => text().withDefault(const Constant(''))(); // 最后修改设备

  @override
  Set<Column> get primaryKey => {id};
}
