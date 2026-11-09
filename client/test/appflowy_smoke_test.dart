import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter_test/flutter_test.dart';

/// 冒烟：确认 appflowy_editor_ce 能在本机 Flutter/Dart 下编译，
/// 且文档 JSON 的「创建 → 序列化 → 反序列化」往返可用（数据层要依赖它）。
void main() {
  test('appflowy_editor_ce 文档 JSON 往返', () {
    final document = Document.blank(withInitialText: true);
    final json = document.toJson();
    final back = Document.fromJson(json);
    expect(back.root.children.length, document.root.children.length);
    expect(back.toJson(), isA<Map<String, dynamic>>());
  });
}
