import 'dart:collection';

/// 诊断日志（P1-T07）：环形缓冲 + 出厂即脱敏。
/// 脱敏规则（需求 §16/验收口径：日志搜不到密钥与正文全文）：
/// 1) 内容类载荷只记录「字节数/字数」，不记录原文；
/// 2) 形似密钥的串（token/secret/key/password 赋值）一律掩码；
/// 3) 日志总条数封顶，防止无限增长。
class DiagnosticsLog {
  DiagnosticsLog._();
  static final DiagnosticsLog I = DiagnosticsLog._();

  static const int capacity = 100;
  final Queue<String> _lines = Queue<String>();
  int _dropped = 0;

  /// 事件写入：只收固定词表 + 编号 + 计数，正文/密钥传进来也会被掩码。
  void add(String event, {String? id, int? count, Object? error}) {
    final sb = StringBuffer(event);
    if (id != null) sb.write(' id=$id');
    if (count != null) sb.write(' count=$count');
    if (error != null) sb.write(' err=${_mask(_clip(error.toString(), 120))}');
    _push('${DateTime.now().toLocal()} ${sb.toString()}');
  }

  /// 文本载荷的替身：绝不写原文，只写长度。
  String textPlaceholder(String content) => '<文本 ${content.length} 字>';

  /// 载荷截断（错误信息等非内容文本）：超长剪断。
  String _clip(String s, int max) => s.length <= max ? s : '${s.substring(0, max)}…';

  /// 形似密钥的赋值掩码。
  String _mask(String s) {
    return s.replaceAllMapped(
      RegExp(r'(token|secret|key|password|passwd|app_?secret)\s*[=:]\s*\S+',
          caseSensitive: false),
      (m) => '${m.group(1)}=<已脱敏>',
    );
  }

  void _push(String line) {
    if (_lines.length >= capacity) {
      _lines.removeFirst();
      _dropped++;
    }
    _lines.add(line);
  }

  /// 最新在前（界面展示顺序）。
  List<String> latest() => _lines.toList().reversed.toList();

  int get droppedCount => _dropped;

  void clear() {
    _lines.clear();
    _dropped = 0;
  }
}
