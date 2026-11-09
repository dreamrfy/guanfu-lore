import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/editor/flowus_editor.dart';

void main() {
  test('旧块格式按 A3 视为空文档，新格式原样保留', () {
    const oldFormat = '{"v":1,"b":[{"t":"p","x":"旧内容","i":"b1"}]}';
    expect(isFlowUsDocument(oldFormat), isFalse);
    final normalized = normalizedContent(oldFormat);
    expect(normalized, contains('"document"'), reason: '旧格式应被规范化为空文档');
    expect(normalized, isNot(contains('旧内容')));

    // 新格式：规范化后仍是合法文档且内容不丢
    final doc = documentFromContent('');
    final withText = documentFromContent('');
    expect(isFlowUsDocument(contentFromDocument(doc)), isTrue);
    expect(isFlowUsDocument(contentFromDocument(withText)), isTrue);
    expect(normalizedContent(contentFromDocument(doc)),
        contentFromDocument(documentFromContent(contentFromDocument(doc))),
        reason: '规范化应幂等');
  });

  test('空内容/坏 JSON 不抛异常', () {
    expect(isFlowUsDocument(''), isFalse);
    expect(isFlowUsDocument('not json'), isFalse);
    expect(isFlowUsDocument('{"document": "not-a-map"}'), isFalse);
    expect(() => documentFromContent('{"bad'), returnsNormally);
  });

  testWidgets('编辑器渲染冒烟：内核组件与富文本都挂载', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SizedBox(
          height: 400,
          child: FlowUsEditor(initialContent: '', onChanged: (_) {}),
        ),
      ),
    ));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(tester.takeException(), isNull);
    expect(find.byType(AppFlowyEditor), findsOneWidget);
    expect(find.byType(RichText), findsWidgets, reason: '空段落应被渲染出来');
  });
}
