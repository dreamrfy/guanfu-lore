// 存储占用统计接口（P1-T07）：原生读文件系统，网页只报数据库侧计数。
export 'storage_stats_common.dart';
export 'storage_stats_stub.dart'
    if (dart.library.io) 'storage_stats_io.dart'
    if (dart.library.js_interop) 'storage_stats_web.dart';
