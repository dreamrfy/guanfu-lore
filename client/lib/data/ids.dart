import 'dart:math';

/// 稳定身份 ID：26 位 ULID（Crockford Base32）。
/// 需求 §4.1：稳定身份不得依赖页面标题和目录路径；时间可排序便于本地索引。
const _encoding = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // 32 字符，无 I/L/O/U
final Random _secure = Random.secure();

String newId() {
  var ts = DateTime.now().millisecondsSinceEpoch;
  final chars = List<String>.generate(26, (i) {
    if (i < 10) {
      // 前 10 位：毫秒时间戳（48bit → 10×~4.8bit，逐位取模简单可靠）
      final digit = ts % 32;
      ts = ts ~/ 32;
      return _encoding[digit];
    }
    return _encoding[_secure.nextInt(32)];
  });
  // 时间戳是倒着取的，反转前 10 位
  final tsPart = chars.sublist(0, 10).reversed.toList();
  return (tsPart + chars.sublist(10)).join();
}
