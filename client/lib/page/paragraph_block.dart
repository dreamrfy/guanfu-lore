// 段落块与排版（M2-T03）
//
// 规格来自 `基准-正文行高与块结构.md`（M0-T31 沿 DOM 逐层实测，锁死了三层数字）：
//   · 行内文字行高 **26**（SPAN/DIV 层）
//   · 块容器行高 **24**（SECTION 层）—— 两个都对，量的是不同层，别混
//   · 块高 **34** = 行内行高 26 + 上下内边距各 4（py-1）
//   · 块间距 **2** = 上下外边距各 1（my-px）
//   · 正文 **16px**、颜色 #37352F、左缘对齐内容列
//
// 空块占位文案：「按空格使用 AI，输入文字或 / 命令」（`汇总结论-FlowUs逆向与重做规格-v1.md` 第 6 条实测）。
//
// 本任务只做**段落这一种块**：Enter 新建段落、空块占位。
// 首行退格合并 / Markdown 快捷 / 其他块类型属 M2-T04、M2-T09。

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../design/tokens.dart';

/// 一个段落块的最小数据：稳定 id + 文本（与 `lib/editor/block_model.dart` 的 BlockData 对齐，但不绑定）
class ParagraphData {
  const ParagraphData({required this.id, this.text = ''});
  final String id;
  final String text;
}

/// 段落列表：负责排版（块高 34 / 间距 2）、Enter 分段、空块占位
class FlowUsParagraphList extends StatefulWidget {
  const FlowUsParagraphList({
    super.key,
    required this.paragraphs,
    required this.onChanged,
    this.onEnter,
    this.placeholder = '按空格使用 AI，输入文字或 / 命令',
  });

  final List<ParagraphData> paragraphs;

  /// (段落 id, 新文本)
  final void Function(String id, String text) onChanged;

  /// 在某段回车 → 请求宿主在它后面插入新段（分段交互属 M2-T03 的最小集，合并/删除在 M2-T04）
  final void Function(String id)? onEnter;

  final String placeholder;

  @override
  State<FlowUsParagraphList> createState() => _FlowUsParagraphListState();
}

class _FlowUsParagraphListState extends State<FlowUsParagraphList> {
  /// 每个段落的焦点/控制器：按 id 复用，光标不跳
  final Map<String, TextEditingController> _controllers = {};
  final Map<String, FocusNode> _focusNodes = {};
  String? _focusedId;

  TextEditingController _controllerOf(ParagraphData p) =>
      _controllers.putIfAbsent(p.id, () => TextEditingController(text: p.text));

  FocusNode _focusOf(ParagraphData p) => _focusNodes.putIfAbsent(p.id, () {
        final node = FocusNode();
        node.addListener(() {
          if (!mounted) return;
          setState(() {
            if (node.hasFocus) {
              _focusedId = p.id;
            } else if (_focusedId == p.id) {
              _focusedId = null;
            }
          });
        });
        return node;
      });

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    for (final f in _focusNodes.values) {
      f.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final p in widget.paragraphs)
          // 块间距 2 = 上下外边距各 1（my-px）
          Padding(
            padding: const EdgeInsets.symmetric(vertical: FlowUsBlockMetrics.blockMarginVertical),
            child: _ParagraphBlock(
              key: ValueKey('para-${p.id}'),
              controller: _controllerOf(p),
              focusNode: _focusOf(p),
              textColor: c.textMain,
              placeholderColor: c.textTertiary,
              placeholder: widget.placeholder,
              // 占位只在"空块 + 正在编辑"或"整页只有一个空块"时出现（与真 FlowUs 行为一致）
              showPlaceholder: p.text.isEmpty &&
                  (_focusedId == p.id || (widget.paragraphs.length == 1 && _focusedId == null)),
              onChanged: (v) => widget.onChanged(p.id, v),
              onEnter: widget.onEnter == null ? null : () => widget.onEnter!(p.id),
            ),
          ),
      ],
    );
  }
}

/// 单个段落块：块内边距上下各 4（py-1），行内行高 26，块容器行高 24
class _ParagraphBlock extends StatelessWidget {
  const _ParagraphBlock({
    super.key,
    required this.controller,
    required this.focusNode,
    required this.textColor,
    required this.placeholderColor,
    required this.placeholder,
    required this.showPlaceholder,
    required this.onChanged,
    this.onEnter,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final Color textColor;
  final Color placeholderColor;
  final String placeholder;
  final bool showPlaceholder;
  final ValueChanged<String> onChanged;
  final VoidCallback? onEnter;

  @override
  Widget build(BuildContext context) {
    return Padding(
      // py-1：上下各 4
      padding: const EdgeInsets.symmetric(vertical: FlowUsBlockMetrics.blockPaddingVertical),
      child: ConstrainedBox(
        // 单行时内容区 26 → 块高 34（26 + 4 + 4）；多行时由内容撑开（不能写死高度，否则第二行被切）
        constraints: const BoxConstraints(
          minHeight: FlowUsBlockMetrics.singleLineBlockHeight - FlowUsBlockMetrics.blockPaddingVertical * 2,
        ),
        child: Focus(
          // Enter = 新建下一段（Shift+Enter 让 TextField 自己换行）
          onKeyEvent: (node, event) {
            final enter = event is KeyDownEvent && event.logicalKey == LogicalKeyboardKey.enter;
            if (enter && !HardwareKeyboard.instance.isShiftPressed && onEnter != null) {
              onEnter!();
              return KeyEventResult.handled;
            }
            return KeyEventResult.ignored;
          },
          child: TextField(
          controller: controller,
          focusNode: focusNode,
          maxLines: null,
          expands: false,
          keyboardType: TextInputType.multiline,
          cursorColor: flowUsColors(context).primary,
          style: TextStyle(
            fontSize: FlowUsTypography.bodyFontSize, // 16
            height: FlowUsTypography.bodyInlineLineHeight / FlowUsTypography.bodyFontSize, // 26/16
            color: textColor,
          ),
          onChanged: onChanged,
          onSubmitted: (_) {},
          inputFormatters: const [],
          decoration: InputDecoration(
            isDense: true,
            border: InputBorder.none,
            contentPadding: EdgeInsets.zero,
            hintText: showPlaceholder ? placeholder : null,
            hintStyle: TextStyle(
              fontSize: FlowUsTypography.bodyFontSize,
              height: FlowUsTypography.bodyInlineLineHeight / FlowUsTypography.bodyFontSize,
              color: placeholderColor,
            ),
          ),
        ),
        ),
      ),
    );
  }
}

/// 在 afterId 这段之后插入一个新段（Enter 用）
List<ParagraphData> insertParagraphAfter(List<ParagraphData> list, String afterId, String newId) {
  final out = <ParagraphData>[];
  for (final p in list) {
    out.add(p);
    if (p.id == afterId) out.add(ParagraphData(id: newId));
  }
  if (!out.any((p) => p.id == newId)) out.add(ParagraphData(id: newId));
  return out;
}
