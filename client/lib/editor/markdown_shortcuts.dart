// Markdown 快捷转换（M2-T09）
//
// 内核 `standardCharacterShortcutEvents` 自带一批字符快捷事件，但**有两处与 FlowUs 不一致**：
//   ① 引述：内核是 `"` + 空格 → 引述；FlowUs 是 **`>` + 空格**
//   ② 分割线：内核是 `--` / `**` / `__`（两个字符就转，会把 `**加粗**` 打断）；FlowUs 是 **`---` / `***` / `___`**
// 另外内核缺 **` ``` ` → 代码块**（它没有代码块组件）。
//
// 这里补上三条 FlowUs 口径的事件，并在注册表里把内核那四条冲突事件按 key 剔除
// （见 [kKernelShortcutsShadowedByFlowUs]）。标题/项目符号/编号/待办/行内样式内核与 FlowUs 一致，保持。
//
// 依据：FlowUs 写作规则与 Notion 同源（`#`/`-`/`1.`/`>`/`[]`/`[x]`/`---`/` ``` `）；
// 真机逐条敲键验证仍受"AI 面板抢键入"限制（任务表已记），本轮以内核事件行为断言为准。

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';

import 'code_block_component.dart';

// ---------- ① 引述：> + 空格 ----------

CharacterShortcutEvent formatGreaterThanToQuote = CharacterShortcutEvent(
  key: 'flowus: format greater-than to quote',
  character: ' ',
  handler: (editorState) async {
    final selection = editorState.selection;
    if (selection == null || !selection.isCollapsed) return false;
    final node = editorState.getNodeAtPath(selection.end.path);
    if (node == null || node.type == QuoteBlockKeys.type) return false;
    final delta = node.delta;
    if (delta == null) return false;
    final offset = selection.end.offset;
    final text = delta.toPlainText();
    if (offset > text.length || text.substring(0, offset) != '>') return false;

    final attrs = <String, Object>{
      QuoteBlockKeys.delta: delta.compose(Delta()..delete(1)).toJson(),
    };
    final textDirection = node.attributes[blockComponentTextDirection];
    if (textDirection != null) attrs[blockComponentTextDirection] = textDirection;

    final transaction = editorState.transaction
      ..updateNodeType(node, QuoteBlockKeys.type, attrs)
      ..afterSelection = Selection.collapsed(Position(path: node.path));
    await editorState.apply(transaction);
    return true;
  },
);

// ---------- ② 分割线：--- / *** / ___ ----------

Future<bool> _convertThreeToDivider(EditorState editorState, List<String> syntaxes) async {
  final selection = editorState.selection;
  if (selection == null || !selection.isCollapsed) return false;
  final node = editorState.getNodeAtPath(selection.end.path);
  final delta = node?.delta;
  if (node == null || delta == null) return false;
  if (!syntaxes.contains(delta.toPlainText())) return false;

  final path = node.path;
  // 先插分割线、再插段落：结果 = 分割线在 path、段落在 path.next（光标落到段落里，"线在上、空行在下"）
  final transaction = editorState.transaction
    ..insertNode(path, dividerNode())
    ..insertNode(path, paragraphNode())
    ..deleteNode(node)
    ..afterSelection = Selection.collapsed(Position(path: path.next));
  await editorState.apply(transaction);
  return true;
}

CharacterShortcutEvent formatTripleMinusesToDivider = CharacterShortcutEvent(
  key: 'flowus: ---- to divider',
  character: '-',
  handler: (s) => _convertThreeToDivider(s, const ['---', '—-', '——']),
);

CharacterShortcutEvent formatTripleStarsToDivider = CharacterShortcutEvent(
  key: 'flowus: *** to divider',
  character: '*',
  handler: (s) => _convertThreeToDivider(s, const ['***']),
);

CharacterShortcutEvent formatTripleUnderscoresToDivider = CharacterShortcutEvent(
  key: 'flowus: ___ to divider',
  character: '_',
  handler: (s) => _convertThreeToDivider(s, const ['___']),
);

// ---------- ③ 代码块： ``` ----------

/// 行首输入三个反引号 → 代码块（内容为空、光标留在块内）
CharacterShortcutEvent formatTripleBackquoteToCodeBlock = CharacterShortcutEvent(
  key: 'flowus: ``` to code block',
  character: '`',
  handler: (editorState) async {
    final selection = editorState.selection;
    if (selection == null || !selection.isCollapsed) return false;
    final node = editorState.getNodeAtPath(selection.end.path);
    if (node == null) return false;
    final delta = node.delta;
    if (delta == null) return false;

    final text = delta.toPlainText();
    final offset = selection.end.offset;
    if (offset > text.length) return false;
    // 只认"整段就是 ```"的情形（真 FlowUs 同样只在行首三连反引号时转）
    if (text.substring(0, offset) != '```') return false;

    final transaction = editorState.transaction
      ..updateNodeType(node, CodeBlockKeys.type, codeNode().attributes)
      ..afterSelection = Selection.collapsed(Position(path: node.path));
    await editorState.apply(transaction);
    return true;
  },
);

/// 我们的 Markdown 快捷转换（挂在标准事件之前）
List<CharacterShortcutEvent> get flowUsMarkdownShortcuts => [
      formatGreaterThanToQuote,
      formatTripleMinusesToDivider,
      formatTripleStarsToDivider,
      formatTripleUnderscoresToDivider,
      formatTripleBackquoteToCodeBlock,
    ];

/// 内核里与 FlowUs 口径冲突、必须剔除的事件 key
///
/// · `format greater to quote`：内核认 `"`，FlowUs 认 `>`
/// · `convert minuses/stars/underscore to a divider`：内核两个字符就转，会把 `**加粗**` 打断
const List<String> kKernelShortcutsShadowedByFlowUs = [
  'format greater to quote',
  'convert minuses to a divider',
  'convert stars to a divider',
  'convert underscore to a divider',
];