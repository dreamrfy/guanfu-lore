import 'dart:async';
import 'dart:convert';

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/material.dart';

import 'block_handle.dart';
import 'inline_shortcuts.dart';
import 'slash_menu.dart';

/// 路线 A：新块编辑器（appflowy_editor 内核 + FlowUs 风格外观与中文菜单）。
///
/// 数据格式（pages.content）：
/// - 新格式：appflowy 文档 JSON（顶层含 "document"）
/// - 旧块格式 {"v":1,"b":[...]}：按 A3 决策**不迁移**，打开时视为空文档，
///   首次保存即覆盖为新格式（数据库已另行备份）。
const String kFlowUsDocPlaceholder = '写点什么…';

bool isFlowUsDocument(String content) {
  final t = content.trim();
  if (t.isEmpty || !t.startsWith('{')) return false;
  try {
    final m = jsonDecode(t);
    return m is Map && m['document'] is Map;
  } catch (_) {
    return false;
  }
}

Document documentFromContent(String content) {
  if (isFlowUsDocument(content)) {
    try {
      final doc = Document.fromJson(jsonDecode(content) as Map<String, dynamic>);
      if (doc.root.children.isEmpty) {
        doc.insert([0], [paragraphNode()]);
      }
      return doc;
    } catch (_) {
      // 坏数据 → 空文档（宁可空，不可崩）
    }
  }
  // 空文档必须带一个空段落，否则编辑器无块可渲染（也就无法输入）
  return Document.blank(withInitialText: true);
}

String contentFromDocument(Document doc) => jsonEncode(doc.toJson());

/// 保存基准用的规范化内容：新格式取文档序列化；旧块格式按 A3 视为空文档。
String normalizedContent(String raw) => contentFromDocument(documentFromContent(raw));

/// 正文编辑器。变更通过 [onChanged] 回传序列化 JSON（上层走既有防抖保存链）。
class FlowUsEditor extends StatefulWidget {
  const FlowUsEditor({
    super.key,
    required this.initialContent,
    required this.onChanged,
    this.autoFocus = false,
    this.readOnly = false,
    this.shrinkWrap = false,
    this.onReady,
  });

  final String initialContent;
  final ValueChanged<String> onChanged;
  final bool autoFocus;
  final bool readOnly;

  /// 放在可滚动容器里时必须 true（否则要无限高度 → BoxConstraints 断言）
  final bool shrinkWrap;

  /// 测试/诊断用：编辑器状态就绪后回调（可用来驱动文档操作）。
  final void Function(EditorState state)? onReady;

  @override
  State<FlowUsEditor> createState() => _FlowUsEditorState();
}

class _FlowUsEditorState extends State<FlowUsEditor> {
  late EditorState _editorState;
  late String _lastEmitted;
  StreamSubscription? _sub;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _editorState = _buildState(widget.initialContent);
    _lastEmitted = contentFromDocument(_editorState.document);
    _sub = _editorState.transactionStream.listen((_) => _onEditorChanged());
    _ready = true;
    widget.onReady?.call(_editorState);
  }

  @override
  void didUpdateWidget(covariant FlowUsEditor old) {
    super.didUpdateWidget(old);
    // 外部内容变化（草稿恢复等）：与当前文档不同才整体重建
    if (widget.initialContent != old.initialContent &&
        widget.initialContent != contentFromDocument(_editorState.document)) {
      _sub?.cancel();
      _editorState = _buildState(widget.initialContent);
      _lastEmitted = contentFromDocument(_editorState.document);
      _sub = _editorState.transactionStream.listen((_) => _onEditorChanged());
      setState(() {});
    }
  }

  EditorState _buildState(String content) {
    final state = EditorState(document: documentFromContent(content));
    state.selectionMenuItems = buildFlowUsSlashItems();
    return state;
  }

  void _onEditorChanged() {
    if (!_ready) return;
    final json = contentFromDocument(_editorState.document);
    if (json == _lastEmitted) return;
    _lastEmitted = json;
    widget.onChanged(json);
  }

  @override
  void dispose() {
    _sub?.cancel();
    _editorState.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final style = _flowUsEditorStyle(context);
    return AppFlowyEditor(
      editorState: _editorState,
      editorStyle: style,
      editable: !widget.readOnly,
      autoFocus: widget.autoFocus,
      shrinkWrap: widget.shrinkWrap,
      blockComponentBuilders: _buildBlockComponents(style),
      // M2-T07：每个块套一层 hover 外壳（块手柄 + 「＋」）
      blockWrapper: flowUsBlockWrapper,
      // 默认斜杠命令挂的是它自己的英文菜单；必须显式替换成我们的中文菜单项
      characterShortcutEvents: [
        customSlashCommand(buildFlowUsSlashItems()),
        ...standardCharacterShortcutEvents
            .where((e) => e.key != 'show the slash menu'),
      ],
      // M2-T18：内核没有行内样式快捷键，这里注册我们自己的（加粗键位已实测）
      commandShortcutEvents: [
        ...flowUsInlineShortcuts,
        ...standardCommandShortcutEvents,
      ],
    );
  }
}

/// FlowUs 风格排版（M2-T05：全部换成实测值，替换掉原来的"拍脑袋"值）
///
/// 实测依据：
///   · 正文 **16 / 26**（行高倍数 26/16 = 1.625）、字色 **#37352F**（`基准-正文行高与块结构` M0-T31）
///   · 字重只用 **400 / 500 / 600**（`基准-字体与图标`）→ 加粗是 **w600**，不是内核默认的 w700
///   · 行内代码：16 号 + 背景 **rgba(2,133,255,0.1)**（在「网站」页量到 8 个带此底色的块，即含行内代码的段落）
///   · 链接色 = 主色 **#0285FF**
///   · 高亮底色**未实测**（先用 appflowy 默认，已在任务表标注）
EditorStyle _flowUsEditorStyle(BuildContext context) {
  const bodyFontSize = 16.0;
  const bodyLineHeightPx = 26.0;
  const body = TextStyle(fontSize: bodyFontSize, height: bodyLineHeightPx / bodyFontSize, color: Color(0xFF37352F));
  return EditorStyle.desktop(
    padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 1),
    cursorColor: const Color(0xFF0285FF),
    selectionColor: const Color(0x1A0285FF),
    textStyleConfiguration: const TextStyleConfiguration(
      text: body,
      // 实测：FlowUs 的字重只有 400/500/600 三档 → 加粗 = w600
      bold: TextStyle(fontWeight: FontWeight.w600),
      italic: TextStyle(fontStyle: FontStyle.italic),
      underline: TextStyle(decoration: TextDecoration.underline),
      strikethrough: TextStyle(decoration: TextDecoration.lineThrough),
      href: TextStyle(color: Color(0xFF0285FF), decoration: TextDecoration.underline),
      code: TextStyle(
        fontFamily: 'monospace',
        fontSize: bodyFontSize,
        backgroundColor: Color(0x1A0285FF), // rgba(2,133,255,0.1)
      ),
      lineHeight: bodyLineHeightPx / bodyFontSize,
    ),
  );
}

/// 块组件：在标准组件基础上把占位文案换成中文（FlowUs 口径）。
Map<String, BlockComponentBuilder> _buildBlockComponents(EditorStyle style) {
  const conf = BlockComponentConfiguration();
  return {
    ...standardBlockComponentBuilderMap,
    ParagraphBlockKeys.type: ParagraphBlockComponentBuilder(
      configuration: conf.copyWith(placeholderText: (_) => kFlowUsDocPlaceholder),
    ),
    HeadingBlockKeys.type: HeadingBlockComponentBuilder(
      configuration: conf.copyWith(placeholderText: (_) => '标题'),
    ),
    QuoteBlockKeys.type: QuoteBlockComponentBuilder(
      configuration: conf.copyWith(placeholderText: (_) => '引用文字'),
    ),
    TodoListBlockKeys.type: TodoListBlockComponentBuilder(
      configuration: conf.copyWith(placeholderText: (_) => '待办事项'),
    ),
    BulletedListBlockKeys.type: BulletedListBlockComponentBuilder(
      configuration: conf.copyWith(placeholderText: (_) => '列表项'),
    ),
    NumberedListBlockKeys.type: NumberedListBlockComponentBuilder(
      configuration: conf.copyWith(placeholderText: (_) => '列表项'),
    ),
  };
}

/// 斜杠菜单（中文 + 拼音快捷词，抄 FlowUs 的分组顺序：基础块优先）。
