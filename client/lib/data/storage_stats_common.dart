/// 存储占用快照（数值语义各端一致：dbBytes 在网页端为 0，界面显示「浏览器托管」）。
class StorageStats {
  const StorageStats({
    required this.dbBytes,
    required this.assetsBytes,
    required this.assetFileCount,
    required this.pagesCount,
    required this.assetsCount,
    required this.draftsCount,
  });

  final int dbBytes;
  final int assetsBytes;
  final int assetFileCount;
  final int pagesCount;
  final int assetsCount;
  final int draftsCount;

  String get dbLabel => dbBytes > 0 ? _fmt(dbBytes) : '浏览器托管';
  String get assetsLabel =>
      assetFileCount == 0 && assetsBytes == 0 ? '空' : '${_fmt(assetsBytes)} / $assetFileCount 个';

  static String _fmt(int b) {
    if (b < 1024) return '$b B';
    if (b < 1024 * 1024) return '${(b / 1024).toStringAsFixed(1)} KB';
    return '${(b / 1024 / 1024).toStringAsFixed(1)} MB';
  }
}
