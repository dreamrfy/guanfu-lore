// 平台条件导出：原生走文件系统，网页走数据库字节仓；上层只认 AssetStore 接口与统一类名 PlatformAssetStore。
export 'asset_store_common.dart';
export 'asset_store_stub.dart'
    if (dart.library.io) 'asset_store_io.dart'
    if (dart.library.js_interop) 'asset_store_web.dart';
