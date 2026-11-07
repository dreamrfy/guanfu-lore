import 'package:drift/drift.dart';

/// P1-T02 数据模型 v1：页面/笔记。
/// 需求 §4.1：稳定身份不依赖标题与路径（id 为 26 位 ULID 主键）；
/// 需求 §4.2：同步状态独立建模（rev/baseRev/updatedBy 按 P0-T07 冻结方案预埋，P7 启用）。
class Pages extends Table {
  TextColumn get id => text()(); // 26 位 ULID
  TextColumn get parentId => text().nullable()(); // 页面树（P2-T01 启用）
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
