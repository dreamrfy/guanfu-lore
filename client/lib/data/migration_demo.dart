// 平台条件导出：迁移演示需要本地文件（dart:io），网页端给降级提示。
export 'migration_demo_stub.dart' if (dart.library.io) 'migration_demo_io.dart';
