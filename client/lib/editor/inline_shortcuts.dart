// 行内样式快捷键（M2-T18）
//
// 背景：`appflowy_editor_ce 6.1.1` **没有内置行内样式快捷键**（`shortcuts/` 下只有 Markdown 转换与斜杠命令），
// 所以这里自己注册 `CommandShortcutEvent`，用**公开 API** `editorState.formatDelta(selection, attributes)` 落地。
//
// 键位来源（`键盘快捷键` 帮助页实测，见 docs/基准/证据/M2-T18/）：
//   · **加粗 = cmd/ctrl + B**（✅ 官方帮助页确认）
//   · 斜体 / 下划线 / 删除线 / 行内代码：帮助页是懒加载表格，滚动也没逼出这几行 →
//     **暂按同一族的通用键位**（I / U / Shift+S / E）实现，并在任务表标注"键位待实测"。
//     宁可先能用、也不假装已对齐。
//
// 切换语义：选区里"全是该样式"→ 去掉；否则 → 全部加上（与 FlowUs 的按钮/快捷键行为一致）。

import 'dart:async';

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/material.dart';

/// 六种行内样式在我们这边的 key
enum FlowUsInlineMark {
  bold('bold', '加粗'),
  italic('italic', '斜体'),
  underline('underline', '下划线'),
  strikethrough('strikethrough', '删除线'),
  code('code', '行内代码');

  const FlowUsInlineMark(this.attribute, this.label);

  /// appflowy delta 里的属性名
  final String attribute;
  final String label;
}

/// 转义成 delta 属性
Attributes _attrs(FlowUsInlineMark mark, bool on) => {mark.attribute: on ? true : null};

/// 选区里是否"全部"带这个样式
bool _allHaveMark(EditorState state, FlowUsInlineMark mark) {
  final selection = state.selection?.normalized;
  if (selection == null || selection.isCollapsed) return false;
  final nodes = state.getNodesInSelection(selection);
  if (nodes.isEmpty) return false;
  var sawText = false;
  for (final node in nodes) {
    final delta = node.delta;
    if (delta == null) continue;
    final start = node == nodes.first ? selection.startIndex : 0;
    final end = node == nodes.last ? selection.endIndex : delta.length;
    var index = 0;
    for (final op in delta) {
      final len = op.length; // TextOperation.length 非空
      if (index + len <= start || index >= end) {
        index += len;
        continue;
      }
      // 只有 TextInsert 带文字与属性（TextRetain/TextDelete 的 data 为 null）
      if (op is TextInsert && op.text.isNotEmpty) {
        sawText = true;
        if (op.attributes?[mark.attribute] != true) return false;
      }
      index += len;
    }
  }
  return sawText;
}

/// 切换某个行内样式（供快捷键与将来的工具栏共用）
Future<void> toggleInlineMark(EditorState state, FlowUsInlineMark mark) async {
  final selection = state.selection?.normalized;
  if (selection == null || selection.isCollapsed) return;
  final turnOn = !_allHaveMark(state, mark);
  await state.formatDelta(selection, _attrs(mark, turnOn));
}

/// 五条快捷键（加粗键位已实测；其余见文件头说明）
final List<CommandShortcutEvent> flowUsInlineShortcuts = [
  CommandShortcutEvent(
    key: 'flowus-bold',
    command: 'ctrl+b',
    macOSCommand: 'cmd+b',
    getDescription: () => '加粗',
    handler: (state) {
      unawaited(toggleInlineMark(state, FlowUsInlineMark.bold));
      return KeyEventResult.handled;
    },
  ),
  CommandShortcutEvent(
    key: 'flowus-italic',
    command: 'ctrl+i',
    macOSCommand: 'cmd+i',
    getDescription: () => '斜体',
    handler: (state) {
      unawaited(toggleInlineMark(state, FlowUsInlineMark.italic));
      return KeyEventResult.handled;
    },
  ),
  CommandShortcutEvent(
    key: 'flowus-underline',
    command: 'ctrl+u',
    macOSCommand: 'cmd+u',
    getDescription: () => '下划线',
    handler: (state) {
      unawaited(toggleInlineMark(state, FlowUsInlineMark.underline));
      return KeyEventResult.handled;
    },
  ),
  CommandShortcutEvent(
    key: 'flowus-strikethrough',
    command: 'ctrl+shift+s',
    macOSCommand: 'cmd+shift+s',
    getDescription: () => '删除线',
    handler: (state) {
      unawaited(toggleInlineMark(state, FlowUsInlineMark.strikethrough));
      return KeyEventResult.handled;
    },
  ),
  CommandShortcutEvent(
    key: 'flowus-code',
    command: 'ctrl+e',
    macOSCommand: 'cmd+e',
    getDescription: () => '行内代码',
    handler: (state) {
      unawaited(toggleInlineMark(state, FlowUsInlineMark.code));
      return KeyEventResult.handled;
    },
  ),
];