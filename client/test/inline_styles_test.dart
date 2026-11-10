// M2-T05 行内样式与快捷键验收
//
// 规格（实测）：
//   正文 16 / 26（=1.625）、字色 #37352F；字重只有 400/500/600 → **加粗 = w600**（不是内核默认 w700）
//   行内代码：16 号 + 背景 rgba(2,133,255,0.1)；链接色 #0285FF
// 跑法：cd client && flutter test test/inline_styles_test.dart

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/editor/flowus_editor.dart';

/// 造一个带全部行内样式的文档
String _styledDoc() {
  final doc = {
    'document': {
      'type': 'page',
      'children': [
        {
          'type': 'paragraph',
          'data': {
            'delta': [
              {
                'insert': '加粗',
                'attributes': {'bold': true}
              },
              {
                'insert': '斜体',
                'attributes': {'italic': true}
              },
              {
                'insert': '下划线',
                'attributes': {'underline': true}
              },
              {
                'insert': '删除线',
                'attributes': {'strikethrough': true}
              },
              {
                'insert': '行内码',
                'attributes': {'code': true}
              },
              {
                'insert': '普通',
                'attributes': <String, dynamic>{}
              },
            ],
          },
        },
      ],
    },
  };
  return jsonEncodeDoc(doc);
}

// 避免直接依赖 dart:convert 的名字冲突
String jsonEncodeDoc(Map<String, dynamic> m) => const JsonEncoderShim().convert(m);

class JsonEncoderShim {
  const JsonEncoderShim();
  String convert(Map<String, dynamic> m) => _encode(m);
}

String _encode(Object? v) {
  // 极简 JSON 编码（只用于本测试的固定结构）
  if (v is String) return '"${v.replaceAll('"', '\\"')}"';
  if (v is bool || v is num) return '$v';
  if (v is List) return '[${v.map(_encode).join(',')}]';
  if (v is Map) return '{${v.entries.map((e) => '"${e.key}":${_encode(e.value)}').join(',')}}';
  return 'null';
}

/// 收集所有富文本 span 的样式
// ignore: unused_element —— 调试用工具函数，平时不调用
List<TextStyle?> _spanStyles(WidgetTester tester) {
  final out = <TextStyle?>[];
  for (final rich in tester.widgetList<RichText>(find.byType(RichText))) {
    final span = rich.text;
    span.visitChildren((inline) {
      if (inline is TextSpan && (inline.text ?? '').isNotEmpty) out.add(inline.style);
      return true;
    });
  }
  return out;
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

Future<EditorState> _pump(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1200, 800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  late EditorState state;
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: SizedBox(
        width: 708,
        child: FlowUsEditor(
          initialContent: _styledDoc(),
          onChanged: (_) {},
          onReady: (s) => state = s,
        ),
      ),
    ),
  ));
  await tester.pumpAndSettle();
  return state;
}

void main() {
  group('行内样式渲染值（实测）', () {
    testWidgets('加粗 = w600（不是 w700）', (tester) async {
      await _pump(tester);
      final st = _styleOf(tester, '加粗');
      expect(st?.fontWeight, FontWeight.w600);
    });

    testWidgets('斜体 / 下划线 / 删除线', (tester) async {
      await _pump(tester);
      expect(_styleOf(tester, '斜体')?.fontStyle, FontStyle.italic);
      expect(_styleOf(tester, '下划线')?.decoration?.contains(TextDecoration.underline), isTrue);
      expect(_styleOf(tester, '删除线')?.decoration?.contains(TextDecoration.lineThrough), isTrue);
    });

    testWidgets('行内代码：等宽 + 背景 rgba(2,133,255,0.1) + 字号 16', (tester) async {
      await _pump(tester);
      final st = _styleOf(tester, '行内码');
      expect(st?.fontFamily, 'monospace');
      expect(st?.backgroundColor, const Color(0x1A0285FF));
      expect(st?.fontSize, 16);
    });

    testWidgets('正文 16 / 行高 26（1.625）、字色 #37352F', (tester) async {
      await _pump(tester);
      final st = _styleOf(tester, '普通');
      expect(st?.fontSize, 16);
      expect(st?.height, closeTo(26 / 16, 0.0001));
      expect(st?.color, const Color(0xFF37352F));
    });

    testWidgets('六种行内样式都能出现在同一段里（不是只能有一种）', (tester) async {
      await _pump(tester);
      for (final t in ['加粗', '斜体', '下划线', '删除线', '行内码', '普通']) {
        expect(_styleOf(tester, t), isNotNull, reason: '缺少 span: $t');
      }
    });
  });

  group('快捷键（M2-T18：我们自己注册的 CommandShortcutEvent）', () {
    Future<EditorState> pumpEditor(WidgetTester tester) async {
      tester.view.physicalSize = const Size(1200, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      late EditorState state;
      // 用 JSON 直接造一段两个字的正文，再用 API 选中它（不走 enterText，避免依赖 EditableText 定位）
      const doc = '{"document":{"type":"page","children":[{"type":"paragraph","data":{"delta":[{"insert":"文字"}]}}]}}';
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 708,
            child: FlowUsEditor(initialContent: doc, onChanged: (_) {}, autoFocus: true, onReady: (s) => state = s),
          ),
        ),
      ));
      await tester.pumpAndSettle();
      state.selection = Selection.single(path: [0], startOffset: 0, endOffset: 2);
      await tester.pumpAndSettle();
      return state;
    }

    Future<void> pressCtrl(WidgetTester tester, LogicalKeyboardKey key) async {
      await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await tester.sendKeyEvent(key);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      await tester.pumpAndSettle();
    }

    testWidgets('Ctrl+B 加粗；再按一次取消（toggle）', (tester) async {
      final state = await pumpEditor(tester);
      await pressCtrl(tester, LogicalKeyboardKey.keyB);
      var json = contentFromDocument(state.document);
      expect(json, contains('"bold"'), reason: 'Ctrl+B 应写入 bold；实际：$json');

      await pressCtrl(tester, LogicalKeyboardKey.keyB);
      json = contentFromDocument(state.document);
      expect(json.contains('"bold":true'), isFalse, reason: '再按一次应取消加粗；实际：$json');
    });

    testWidgets('Ctrl+I 斜体', (tester) async {
      final state = await pumpEditor(tester);
      await pressCtrl(tester, LogicalKeyboardKey.keyI);
      expect(contentFromDocument(state.document), contains('"italic"'));
    });

    testWidgets('Ctrl+U 下划线', (tester) async {
      final state = await pumpEditor(tester);
      await pressCtrl(tester, LogicalKeyboardKey.keyU);
      expect(contentFromDocument(state.document), contains('"underline"'));
    });

    testWidgets('Ctrl+E 行内代码', (tester) async {
      final state = await pumpEditor(tester);
      await pressCtrl(tester, LogicalKeyboardKey.keyE);
      expect(contentFromDocument(state.document), contains('"code"'));
    });
  });
}
