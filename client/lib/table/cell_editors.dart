// 单元格编辑器（M4-T05/T06：点格子能改值，改完真落库）
//
// 为什么单独一个文件：`FlowUsCellValue` 只负责**显示**，这里负责**编辑**。
// 两者共用同一套字段类型语义，但交互完全不同，混在一起会互相拖累。
//
// 各字段类型的编辑形态：
//   · 文本/长文本 → 单行输入框（长文本多行）
//   · 数字       → 数字输入框
//   · 勾选框     → 点一下切换 true/false
//   · 单选/多选  → 下拉选已有选项（可新建选项）
//   · 日期       → 日期 + 时间
//   · 链接/邮箱/电话 → 单行输入框
//   · 人员       → 单行输入框（先存名字，关联能力属 M4-T04）

import 'package:flutter/material.dart';

import 'cell_renderers.dart';
import 'flowus_table.dart';
import '../design/tokens.dart';

/// 单元格编辑器：返回一个用于**就地编辑**的 widget
class FlowUsCellEditor extends StatefulWidget {
  const FlowUsCellEditor({
    super.key,
    required this.field,
    required this.value,
    required this.onCommit,
    this.onCancel,
    this.autofocus = true,
  });

  final FlowUsFieldDefinition field;

  /// 当前值
  final Object? value;

  /// 提交新值（null = 清空）
  final void Function(Object? value) onCommit;

  /// 取消编辑
  final VoidCallback? onCancel;

  final bool autofocus;

  @override
  State<FlowUsCellEditor> createState() => _FlowUsCellEditorState();
}

class _FlowUsCellEditorState extends State<FlowUsCellEditor> {
  late final TextEditingController _controller =
      TextEditingController(text: _initialText());
  late final FocusNode _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    if (widget.autofocus) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _focus.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  String _initialText() {
    final v = widget.value;
    if (v == null) return '';
    if (v is String) return v;
    if (v is num || v is bool) return '$v';
    if (v is List) {
      // 多选：编辑时显示第一个（逐个改用选项弹层）
      return v.isEmpty ? '' : '${v.first}';
    }
    return '$v';
  }

  void _commitText() {
    final text = _controller.text;
    switch (widget.field.type) {
      case FlowUsFieldType.number:
        final t = text.trim();
        widget.onCommit(t.isEmpty ? null : (num.tryParse(t) ?? t));
        break;
      case FlowUsFieldType.checkbox:
        widget.onCommit(text.trim() == 'true');
        break;
      default:
        widget.onCommit(text.trim().isEmpty ? null : text);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    final type = widget.field.type;

    // 勾选框：点一下就翻转，不用输入框
    if (type == FlowUsFieldType.checkbox) {
      return InkWell(
        onTap: () => widget.onCommit(!(widget.value == true)),
        child: Align(
          alignment: Alignment.centerLeft,
          child: FlowUsCheckboxCell(checked: widget.value == true),
        ),
      );
    }

    // 单选/多选：进入编辑态就直接弹选项面板
    if (type == FlowUsFieldType.select || type == FlowUsFieldType.multiSelect) {
      // 编辑态被拉起 → 立刻开面板
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _openOptions();
      });
      return Align(
        alignment: Alignment.centerLeft,
        child: FlowUsCellValue(field: widget.field, raw: widget.value),
      );
    }

    final isLong = type == FlowUsFieldType.title;
    return TextField(
      controller: _controller,
      focusNode: _focus,
      autofocus: widget.autofocus,
      maxLines: isLong ? null : 1,
      style: const TextStyle(
        fontSize: FlowUsTable.cellTextSize,
        height: FlowUsTable.cellLineHeight / FlowUsTable.cellTextSize,
        color: Color(0xFF37352F),
      ),
      cursorColor: c.primary,
      decoration: const InputDecoration(
        isDense: true,
        contentPadding: EdgeInsets.symmetric(horizontal: 0),
        border: InputBorder.none,
      ),
      onSubmitted: (_) => _commitText(),
      onTapOutside: (_) {
        _commitText();
        widget.onCancel?.call();
      },
    );
  }

  Future<void> _openOptions() async {
    final picked = await showFlowUsOptionPicker(
      context,
      field: widget.field,
      current: widget.value,
      multi: widget.field.type == FlowUsFieldType.multiSelect,
    );
    if (picked != null) widget.onCommit(picked);
  }
}

/// 单选/多选的选项选择弹层
Future<Object?> showFlowUsOptionPicker(
  BuildContext context, {
  required FlowUsFieldDefinition field,
  required Object? current,
  bool multi = false,
}) {
  return showModalBottomSheet<Object?>(
    context: context,
    backgroundColor: Colors.white,
    constraints: const BoxConstraints(maxHeight: 360),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
    ),
    builder: (ctx) => _OptionPickerSheet(
      key: const Key('flowus-option-picker'),
      field: field,
      current: current,
      multi: multi,
    ),
  );
}

class _OptionPickerSheet extends StatefulWidget {
  const _OptionPickerSheet({
    super.key,
    required this.field,
    required this.current,
    required this.multi,
  });

  final FlowUsFieldDefinition field;
  final Object? current;
  final bool multi;

  @override
  State<_OptionPickerSheet> createState() => _OptionPickerSheetState();
}

class _OptionPickerSheetState extends State<_OptionPickerSheet> {
  late final Set<String> _selected = {..._currentLabels};
  late final TextEditingController _newOption = TextEditingController();

  List<String> get _currentLabels {
    final v = widget.current;
    if (v == null) return const [];
    if (v is String) return [v];
    if (v is List) return [for (final e in v) '$e'];
    return [];
  }

  /// 字段定义里声明的选项（`options` 是数组）
  List<String> get _declaredOptions {
    final opts = widget.field.options ?? const [];
    return [
      for (final o in opts)
        if (o is String)
          o
        else if (o is Map)
          '${o['name'] ?? o['text'] ?? o['title'] ?? ''}',
    ].where((s) => s.isNotEmpty).toList();
  }

  @override
  void dispose() {
    _newOption.dispose();
    super.dispose();
  }

  void _toggle(String label) {
    setState(() {
      if (!widget.multi) {
        // 单选：点一个就是**换成它**（不是追加）——
        // 追加会让"未读→已读"变成两个都选中，提交时取 first 还是旧值。
        _selected
          ..clear()
          ..add(label);
        return;
      }
      if (_selected.contains(label)) {
        _selected.remove(label);
      } else {
        _selected.add(label);
      }
    });
  }

  void _submit() {
    if (widget.multi) {
      Navigator.of(context).pop(_selected.toList());
    } else {
      Navigator.of(context).pop(_selected.isEmpty ? null : _selected.first);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    final all = <String>{..._declaredOptions, ..._selected}.toList();
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            widget.multi ? '多选（可多选）' : '单选',
            style: const TextStyle(fontSize: 12, height: 18 / 12, color: Color(0xFF91918E)),
          ),
          const SizedBox(height: 8),
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final o in all)
                    InkWell(
                      // 单选：点一下就生效并关面板（真 FlowUs 是一次点击）
                      // 多选：先勾选，最后点「确定」
                      onTap: () {
                        if (widget.multi) {
                          _toggle(o);
                        } else {
                          Navigator.of(context).pop(o);
                        }
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 9),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 18,
                              height: 18,
                              child: _selected.contains(o)
                                  ? Icon(Icons.check, size: 16, color: c.primary)
                                  : null,
                            ),
                            const SizedBox(width: 6),
                            Text(o, style: const TextStyle(fontSize: 14, height: 20 / 14)),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _newOption,
                  style: const TextStyle(fontSize: 14, height: 20 / 14),
                  decoration: InputDecoration(
                    isDense: true,
                    hintText: '新选项',
                    hintStyle: const TextStyle(fontSize: 14, color: Color(0xFFBDBDBD)),
                    border: const OutlineInputBorder(),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  ),
                  onSubmitted: (v) {
                    if (v.trim().isEmpty) return;
                    setState(() => _selected.add(v.trim()));
                    _newOption.clear();
                  },
                ),
              ),
              const SizedBox(width: 8),
              TextButton(
                onPressed: _submit,
                child: const Text('确定'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
