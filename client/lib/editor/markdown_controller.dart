import 'package:flutter/material.dart';

/// Markdown 行内渲染控制器：文本仍存 **标记**（选中映射不失真），
/// 显示层把成对的 **加粗** 渲染为粗体（P2-T03 的「加粗」）。
class MarkdownTextController extends TextEditingController {
  MarkdownTextController({super.text});

  bool renderMarkdown = true;

  static final _boldPattern = RegExp(r'\*\*(.+?)\*\*');

  @override
  TextSpan buildTextSpan({
    required BuildContext context,
    TextStyle? style,
    required bool withComposing,
  }) {
    return buildMarkdownSpan(text, style, renderMarkdown);
  }

  /// 纯函数渲染（可测试）：把成对 **x** 渲染为粗体 span，底层文本不变。
  static TextSpan buildMarkdownSpan(String text, TextStyle? style, bool enabled) {
    if (!enabled || !text.contains('**')) {
      return TextSpan(style: style, text: text);
    }
    final children = <TextSpan>[];
    var cursor = 0;
    for (final m in _boldPattern.allMatches(text)) {
      if (m.start > cursor) {
        children.add(TextSpan(text: text.substring(cursor, m.start)));
      }
      children.add(TextSpan(
        text: m.group(1),
        style: (style ?? const TextStyle()).copyWith(fontWeight: FontWeight.w700),
      ));
      cursor = m.end;
    }
    if (cursor < text.length) {
      children.add(TextSpan(text: text.substring(cursor)));
    }
    return TextSpan(style: style, children: children);
  }

  /// 工具栏动作：给当前选区包上 **（无选区则插入一对）。
  void wrapSelectionWithBold() {
    final sel = selection;
    final t = text;
    if (!sel.isValid) return;
    final start = sel.start.clamp(0, t.length);
    final end = sel.end.clamp(0, t.length);
    if (start == end) {
      final next = '${t.substring(0, start)}****${t.substring(start)}';
      value = TextEditingValue(
        text: next,
        selection: TextSelection.collapsed(offset: start + 2),
      );
      return;
    }
    final inner = t.substring(start, end);
    final next = '${t.substring(0, start)}**$inner**${t.substring(end)}';
    value = TextEditingValue(
      text: next,
      selection: TextSelection(baseOffset: start + 2, extentOffset: start + 2 + inner.length),
    );
  }
}
