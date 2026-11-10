// M2-T19 代码块组件验收
//
// 实测规格：等宽 **14 / 21**、缩进 **25**、单行块高 26（基准-正文行高与块结构 §2）
// 跑法：cd client && flutter test test/code_block_test.dart

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/editor/code_block_component.dart';
import 'package:bijiapp/editor/flowus_editor.dart';

/// 一段正文 + 一个代码块
const _doc = '{"document":{"type":"page","children":['
    '{"type":"paragraph","data":{"delta":[{"insert":"普通段落"}]}},'
    '{"type":"code","data":{"delta":[{"insert":"sudo -i"}]}}'
    ']}}';

Future<void> _pump(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1200, 800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: SizedBox(width: 708, child: FlowUsEditor(initialContent: _doc, onChanged: (_) {})),
    ),
  ));
  await tester.pumpAndSettle();
}

TextStyle? _styleOf(WidgetTester tester, String text) {
  TextStyle? found;
  for (final rich in tester.widgetList<RichText>(find.byType(RichText))) {
    rich.text.visitChildren((inline) {
      if (inline is TextSpan && (inline.text ?? '') == text) found = inline.style;
      return true;
    });
  }
  return found;
}

void main() {
  group('常量与实测一致', () {
    test('字号 14 / 行高 21 / 缩进 25', () {
      expect(kCodeFontSize, 14);
      expect(kCodeLineHeight, 21);
      expect(kCodeIndent, 25);
    });

    test('codeNode 造出的块类型是 code，且带 delta', () {
      final n = codeNode(text: 'x = 1');
      expect(n.type, CodeBlockKeys.type);
      expect(n.delta, isNotNull);
      expect(n.delta!.toPlainText(), 'x = 1');
    });
  });

  group('渲染', () {
    testWidgets('代码块用等宽 14/21（不是正文的 16/26）', (tester) async {
      await _pump(tester);
      final code = _styleOf(tester, 'sudo -i');
      expect(code, isNotNull, reason: '代码块的文字没渲染出来');
      expect(code?.fontFamily, 'monospace');
      expect(code?.fontSize, 14);
      expect(code?.height, closeTo(21 / 14, 0.0001));

      // 对照：普通段落仍是 16
      final body = _styleOf(tester, '普通段落');
      expect(body?.fontSize, 16);
    });

    testWidgets('代码块相对正文缩进 25', (tester) async {
      await _pump(tester);
      Rect rectOf(String text) {
        Rect? r;
        for (final e in find.byType(RichText).evaluate()) {
          final rich = e.widget as RichText;
          rich.text.visitChildren((inline) {
            if (inline is TextSpan && (inline.text ?? '') == text) {
              r = tester.getRect(find.byWidget(rich));
            }
            return true;
          });
        }
        return r!;
      }

      final body = rectOf('普通段落');
      final code = rectOf('sudo -i');
      expect(code.left - body.left, closeTo(kCodeIndent, 1));
    });
  });
}