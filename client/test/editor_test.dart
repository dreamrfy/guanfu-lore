import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/editor/block_model.dart';
import 'package:bijiapp/editor/blocks_editor.dart';
import 'package:bijiapp/editor/markdown_controller.dart';

void main() {
  test('序列化往返：类型/文本/勾选/块 ID 全保留', () {
    final blocks = [
      BlockData(id: 'b1', type: BlockType.h1, text: '标题'),
      BlockData(id: 'b2', type: BlockType.p, text: '正文**加粗**段落'),
      BlockData(id: 'b3', type: BlockType.todo, text: '买牛奶', checked: true),
      BlockData(id: 'b4', type: BlockType.quote, text: '引用'),
      BlockData(id: 'b5', type: BlockType.bullet, text: '列表项'),
      BlockData(id: 'b6', type: BlockType.divider, text: ''),
    ];
    final decoded = decodeBlocks(encodeBlocks(blocks));
    expect(decoded.length, 6);
    expect(decoded.map((b) => b.type).toList(),
        [BlockType.h1, BlockType.p, BlockType.todo, BlockType.quote, BlockType.bullet, BlockType.divider]);
    expect(decoded[2].checked, isTrue);
    expect(decoded.map((b) => b.id).toList(), ['b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
  });

  test('旧纯文本兼容：按行转段落，不丢内容', () {
    final decoded = decodeBlocks('第一行\n第二行');
    expect(decoded.length, 2);
    expect(decoded[0].type, BlockType.p);
    expect(decoded[0].text, '第一行');
    expect(decoded[1].text, '第二行');
    // 空内容 → 一个空段落
    expect(decodeBlocks(''), hasLength(1));
  });

  test('Enter 拆分：光标处一分为二，标题后新块降级为段落', () {
    final blocks = [
      BlockData(id: 'a', type: BlockType.h1, text: '我的标题'),
      BlockData(id: 'b', type: BlockType.p, text: '正文'),
    ];
    final after = splitBlock(blocks, 'a', 2); // 「我的|标题」处回车
    expect(after.length, 3);
    expect(after[0].text, '我的');
    expect(after[0].type, BlockType.h1);
    expect(after[1].text, '标题');
    expect(after[1].type, BlockType.p, reason: '标题中回车，新块应为段落');
  });

  test('Enter 拆分：勾选块回车继承勾选类型', () {
    final blocks = [BlockData(id: 't', type: BlockType.todo, text: '采购清单')];
    final after = splitBlock(blocks, 't', 2);
    expect(after[1].type, BlockType.todo);
    expect(after[1].checked, isFalse, reason: '新勾选块默认未勾选');
  });

  test('块首退格：与前块合并，光标落点=前块原长度', () {
    final blocks = [
      BlockData(id: 'a', type: BlockType.p, text: '前半'),
      BlockData(id: 'b', type: BlockType.p, text: '后半'),
    ];
    final merged = mergeWithPrevious(blocks, 'b')!;
    expect(merged.blocks.length, 1);
    expect(merged.blocks.first.text, '前半后半');
    expect(merged.mergedIntoId, 'a');
    expect(merged.mergeOffset, 2);
  });

  test('块首退格：前块为分割线时删除分割线本身', () {
    final blocks = [
      BlockData(id: 'd', type: BlockType.divider, text: ''),
      BlockData(id: 'b', type: BlockType.p, text: '正文'),
    ];
    final merged = mergeWithPrevious(blocks, 'b')!;
    expect(merged.blocks.length, 1);
    expect(merged.blocks.first.id, 'b');
  });

  test('第一个块退格：无可合并返回 null', () {
    final blocks = [BlockData(id: 'only', type: BlockType.p, text: 'x')];
    expect(mergeWithPrevious(blocks, 'only'), isNull);
  });

  test('加粗：wrapSelectionWithBold 选区包裹与无选区插入', () {
    final ctl = MarkdownTextController(text: 'hello world')..selection = const TextSelection(baseOffset: 0, extentOffset: 5);
    ctl.wrapSelectionWithBold();
    expect(ctl.text, '**hello** world');
    ctl.selection = TextSelection.collapsed(offset: ctl.text.length);
    ctl.wrapSelectionWithBold();
    expect(ctl.text, '**hello** world****');
  });

  test('加粗：渲染为粗体 span（显示层剥标记，粗体样式就位）', () {
    final span = MarkdownTextController.buildMarkdownSpan(
        'a **bold** b', const TextStyle(fontSize: 14), true);
    final boldSpan =
        span.children!.whereType<TextSpan>().firstWhere((s) => s.style?.fontWeight == FontWeight.w700);
    expect(boldSpan.text, 'bold');
    expect(span.toPlainText(), 'a bold b', reason: '显示层不出现 ** 标记');
  });

  test('加粗关闭时：渲染退回纯文本原样（含标记）', () {
    final span = MarkdownTextController.buildMarkdownSpan(
        'a **bold** b', const TextStyle(fontSize: 14), false);
    expect(span.toPlainText(), 'a **bold** b');
  });

  testWidgets('块编辑器：首屏块打字必须触发 onChanged（回归 P2-T03 装配缺陷）', (tester) async {
    String? fired;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: BlocksEditor(initialContent: '', onChanged: (s) => fired = s),
      ),
    ));
    expect(fired, isNull, reason: '打开页面不应有幽灵保存');
    await tester.enterText(find.byType(TextField).first, 'hello');
    expect(fired, isNotNull, reason: '首屏块打字必须走 onChanged，否则保存链全死');
    expect(fired, contains('hello'));
  });

  group('Markdown 快捷输入（V2.1 ⑤）', () {
    test('触发词匹配：七种全中、长短语不误伤、顺序不抢先', () {
      expect(markdownTriggerOf('#')!.type, BlockType.h1);
      expect(markdownTriggerOf('-')!.type, BlockType.bullet);
      expect(markdownTriggerOf('>')!.type, BlockType.quote);
      expect(markdownTriggerOf('[]')!.type, BlockType.todo);
      expect(markdownTriggerOf('[]')!.checked, isFalse);
      expect(markdownTriggerOf('[ ]')!.type, BlockType.todo);
      expect(markdownTriggerOf('[x]')!.checked, isTrue);
      expect(markdownTriggerOf('---')!.type, BlockType.divider);
      // 不该误伤的
      expect(markdownTriggerOf(''), isNull);
      expect(markdownTriggerOf('abc-'), isNull);
      expect(markdownTriggerOf('##'), isNull, reason: '只有一级标题，## 不触发');
      expect(markdownTriggerOf('--'), isNull);
    });

    testWidgets('「- 」变列表、「# 」变标题、「[x] 」变已勾选', (tester) async {
      final fired = <String>[];
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: BlocksEditor(initialContent: '', onChanged: fired.add),
        ),
      ));
      final field = find.byType(TextField).first;
      await tester.enterText(field, '- ');
      await tester.pumpAndSettle();
      expect(fired.last, contains('"t":"bullet"'), reason: fired.last);
      expect(tester.widget<TextField>(field).controller!.text, '',
          reason: '触发词不应残留在输入框（显示层与块模型一致）');
      await tester.enterText(field, '# ');
      await tester.pumpAndSettle();
      expect(fired.last, contains('"t":"h1"'), reason: fired.last);
      expect(tester.widget<TextField>(field).controller!.text, '');
      await tester.enterText(field, '[x] ');
      await tester.pumpAndSettle();
      expect(fired.last, contains('"t":"todo"'), reason: fired.last);
      expect(fired.last, contains('"d":true'), reason: fired.last);
      expect(tester.widget<TextField>(field).controller!.text, '');
    });

    testWidgets('空块输入 / 弹块菜单，选类型后生效且 / 不留在正文', (tester) async {
      final fired = <String>[];
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: BlocksEditor(initialContent: '', onChanged: fired.add),
        ),
      ));
      await tester.enterText(find.byType(TextField).first, '/');
      await tester.pumpAndSettle();
      expect(find.text('块操作'), findsOneWidget, reason: '输入 / 应弹出块菜单');
      await tester.tap(find.text('引用'));
      await tester.pumpAndSettle();
      expect(fired.last, contains('"t":"quote"'), reason: fired.last);
      expect(fired.last, isNot(contains('/')), reason: '唤起符不留在正文');
    });
  });
}
