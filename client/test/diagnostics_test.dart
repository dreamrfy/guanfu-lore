import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/data/diagnostics.dart';

void main() {
  test('脱敏：形似密钥的赋值被掩码，原文不出现在日志', () {
    final diag = DiagnosticsLog.I..clear();
    diag.add('config.load', error: 'token=abc123secret url=https://x/y key= hunters');
    final all = diag.latest().join('\n');
    expect(all.contains('abc123secret'), isFalse, reason: '密钥原文不得出现');
    expect(all, contains('<已脱敏>'));
  });

  test('脱敏：文本载荷只允许以字数替身出现', () {
    final diag = DiagnosticsLog.I..clear();
    final secret = '这是一段绝密正文内容';
    final placeholder = diag.textPlaceholder(secret);
    expect(placeholder, '<文本 10 字>');
    expect(placeholder.contains('绝密'), isFalse);
    diag.add('content.saved', count: secret.length);
    final all = diag.latest().join('\n');
    expect(all.contains(secret), isFalse);
    expect(all, contains('count=10'));
  });

  test('环形缓冲：容量封顶 100，滚动丢弃有计数', () {
    final diag = DiagnosticsLog.I..clear();
    for (var i = 0; i < 150; i++) {
      diag.add('event.$i');
    }
    expect(diag.latest().length, 100);
    expect(diag.droppedCount, 50);
    expect(diag.latest().first, contains('event.149'), reason: '最新在前');
    expect(diag.latest().last, contains('event.50'), reason: '最老的 50 条被丢弃');
  });

  test('清空：全清且丢弃计数归零', () {
    final diag = DiagnosticsLog.I..clear();
    diag.add('x', count: 1);
    diag.clear();
    expect(diag.latest(), isEmpty);
    expect(diag.droppedCount, 0);
  });
}
