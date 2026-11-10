// M2-T09 Markdown 快捷转换验收
//
// 逐条验证内核带的 13 条字符快捷事件 + 我们补的行首三反引号 → 代码块。
// 做法：造一个只有一段文字、光标在末尾的 EditorState，直接调用对应 handler（事件触发时就这样跑）。
// 跑法：cd client && flutter test test/markdown_shortcuts_test.dart

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/editor/code_block_component.dart';
import 'package:bijiapp/editor/flowus_editor.dart';
import 'package:bijiapp/editor/markdown_shortcuts.dart';

EditorState _state(String text) {
  final doc = Document.fromJson({
    'document': {
      'type': 'page',
      'children': [
        {
          'type': 'paragraph',
          'data': {
            'delta': [
              {'insert': text},
            ],
          },
        },
      ],
    },
  });
  final st = EditorState(document: doc);
  final node = doc.root.children.first;
  st.selection = Selection.collapsed(Position(path: node.path, offset: text.length));
  return st;
}

Node _first(EditorState st) => st.document.root.children.first;

void main() {
  test('`#` → 标题 1；`###` → 标题 3（文字清空）', () async {
    final st = _state('#');
    expect(await formatSignToHeading.handler(st), isTrue);
    expect(_first(st).type, HeadingBlockKeys.type);
    expect(_first(st).attributes[HeadingBlockKeys.level], 1);
    expect(_first(st).delta!.toPlainText(), '');

    final st3 = _state('###');
    expect(await formatSignToHeading.handler(st3), isTrue);
    expect(_first(st3).attributes[HeadingBlockKeys.level], 3);
  });

  test('`-` → 项目符号；`*` → 项目符号', () async {
    final a = _state('-');
    expect(await formatMinusToBulletedList.handler(a), isTrue);
    expect(_first(a).type, BulletedListBlockKeys.type);

    final b = _state('*');
    expect(await formatAsteriskToBulletedList.handler(b), isTrue);
    expect(_first(b).type, BulletedListBlockKeys.type);
  });

  test('`1.` → 编号列表', () async {
    final st = _state('1.');
    expect(await formatNumberToNumberedList.handler(st), isTrue);
    expect(_first(st).type, NumberedListBlockKeys.type);
  });

  test('`>` + 空格 → 引述（FlowUs 口径；内核准 `"` 的那条已剔除）', () async {
    final st = _state('>');
    expect(await formatGreaterThanToQuote.handler(st), isTrue);
    expect(_first(st).type, QuoteBlockKeys.type);
    expect(_first(st).delta!.toPlainText(), '');
  });

  test('`[]` → 未勾选待办；`[x]` → 已勾选待办', () async {
    final a = _state('[]');
    expect(await formatEmptyBracketsToUncheckedBox.handler(a), isTrue);
    expect(_first(a).type, TodoListBlockKeys.type);
    expect(_first(a).attributes[TodoListBlockKeys.checked], false);

    final b = _state('[x]');
    expect(await formatFilledBracketsToCheckedBox.handler(b), isTrue);
    expect(_first(b).type, TodoListBlockKeys.type);
    expect(_first(b).attributes[TodoListBlockKeys.checked], true);
  });

  test('`---` / `***` / `___` → 分割线（三字符口径）', () async {
    for (final pair in [
      ('---', formatTripleMinusesToDivider),
      ('***', formatTripleStarsToDivider),
      ('___', formatTripleUnderscoresToDivider),
    ]) {
      final st = _state(pair.$1);
      expect(await pair.$2.handler(st), isTrue, reason: '${pair.$1} 应转分割线');
      expect(_first(st).type, DividerBlockKeys.type, reason: '${pair.$1} 应转分割线');
    }
  });

  test('分割线：线在上、空段落在下，光标落到段落里', () async {
    final st = _state('---');
    expect(await formatTripleMinusesToDivider.handler(st), isTrue);
    final kids = st.document.root.children;
    expect(kids.length, 2);
    expect(kids[0].type, DividerBlockKeys.type);
    expect(kids[1].type, ParagraphBlockKeys.type);
    expect(st.selection!.start.path, kids[1].path);
  });

  test('破折号被替换成 em dash 后仍能出分割线（—- / ——）', () async {
    for (final t in ['—-', '——']) {
      final st = _state(t);
      expect(await formatTripleMinusesToDivider.handler(st), isTrue, reason: '应转分割线');
      expect(_first(st).type, DividerBlockKeys.type);
    }
  });

  test('两个字符不转分割线（守住 **加粗** 不被打断）', () async {
    for (final two in ['--', '**', '__']) {
      final st = _state(two);
      final fired = await formatTripleMinusesToDivider.handler(st) ||
          await formatTripleStarsToDivider.handler(st) ||
          await formatTripleUnderscoresToDivider.handler(st);
      expect(fired, isFalse, reason: '$two 不该转');
      expect(_first(st).type, ParagraphBlockKeys.type);
    }
  });

  test('编辑器真正注册的表：我们的在前、内核冲突项不在、斜杠菜单不在', () {
    final keys = flowUsCharacterShortcuts().map((e) => e.key).toList();
    // 我们的 5 条排最前
    for (var i = 0; i < flowUsMarkdownShortcuts.length; i++) {
      expect(keys[i], flowUsMarkdownShortcuts[i].key);
    }
    for (final k in kKernelShortcutsShadowedByFlowUs) {
      expect(keys.contains(k), isFalse, reason: '$k 仍在注册表里');
    }
    // 斜杠菜单：'/' 只能有一条（我们的中文菜单），内核英文那条已被同 key 剔除
    expect(keys.where((k) => k == 'show the slash menu').length, 1);
    // 内核的其它 Markdown 事件还在（标题/列表/待办/行内样式）
    expect(keys.contains('format sign to heading list'), isTrue);
    expect(keys.contains('format empty square brackets to unchecked todo list'), isTrue);
  });

  test('行首 ``` → 代码块（我们补的那条），块类型 = code、文字清空', () async {
    final st = _state('```');
    expect(await formatTripleBackquoteToCodeBlock.handler(st), isTrue);
    expect(_first(st).type, CodeBlockKeys.type);
    expect(_first(st).delta!.toPlainText(), '');
    // 光标留在该块内
    expect(st.selection?.start.path, _first(st).path);
  });

  test('不是整段 ``` 时不该转（如文字中间的 ```）', () async {
    final st = _state('abc```');
    expect(await formatTripleBackquoteToCodeBlock.handler(st), isFalse);
    expect(_first(st).type, ParagraphBlockKeys.type);
  });

  test('注册表里三反引号排在标准事件之前（否则会被行内代码那条先吃掉）', () {
    final ours = flowUsMarkdownShortcuts;
    expect(ours.length, 5);
    expect(ours.last.key, 'flowus: ``` to code block');
    expect(ours.last.character, '`');
  });
}