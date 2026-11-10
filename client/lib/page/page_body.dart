// 页面正文 = FlowUs 富文本内核（M2-T20 架构收敛）
//
// 为什么收敛：之前正文有**两套实现**
//   · `page/blocks.dart`（自研块列表，演示壳在用）
//   · `lib/editor/flowus_editor.dart`（appflowy 内核，斜杠菜单 M2-T06 与行内快捷键 M2-T18 都在这里，却没有入口）
// 行内样式（加粗/斜体…）**必须有富文本引擎**，自研 TextField 那套做不了 → 统一收敛到 appflowy 内核。
//
// 这一层只做"接线"：把页面 content 交给 FlowUsEditor，并把变更回传给宿主；
// 块级排版数值（16/26、标题 30/45 等）在 `flowus_editor.dart` 的 EditorStyle 里，不在本文件重复。

import 'package:flutter/material.dart';

import '../editor/flowus_editor.dart';

class FlowUsPageBody extends StatelessWidget {
  const FlowUsPageBody({
    super.key,
    required this.content,
    required this.onChanged,
    this.autoFocus = false,
    this.readOnly = false,
    this.shrinkWrap = false,
  });

  /// 页面正文（appflowy 文档 JSON；空串 = 空文档）
  final String content;
  final ValueChanged<String> onChanged;
  final bool autoFocus;
  final bool readOnly;
  final bool shrinkWrap;

  @override
  Widget build(BuildContext context) {
    return FlowUsEditor(
      initialContent: content,
      onChanged: onChanged,
      autoFocus: autoFocus,
      readOnly: readOnly,
      shrinkWrap: shrinkWrap,
    );
  }
}