// 记录页（M4-T07）：点表格一行 → 右侧展开这个记录
//
// 结构（11-11 用户逐项确认）：
//   ┌ 标题（可改）
//   ├ 属性区（**与表格列共用同一份数据**，点击即改）
//   │   + 整篇级 AI 工具条（总结 / 提炼要点 / 生成标签）
//   ├ ────────────────────────────
//   ├ 【作者原文】  ← 剪藏来的正文，**只读**
//   ├ ────────────────────────────
//   └ 【我的想法】  ← 可编辑
//
// 为什么正文分两块（需求文档 NOTE-03）：清楚区分「作者原文」与「本人笔记」，
// 原文只读 → 剪藏快照不被改坏；想法另起一块 → 不会跟原文混在一起分不清。
//
// ⚠️ 本轮先做**结构 + 数据接线**（属性区可改、两块正文能存），
//    AI 工具条先留回调位（M9 接）。

import 'package:flutter/material.dart';

import 'cell_editors.dart';
import 'cell_renderers.dart';
import 'flowus_table.dart';
import '../design/tokens.dart';

/// 一条记录的完整内容（属性 + 两块正文）
class FlowUsRecordContent {
  const FlowUsRecordContent({
    required this.title,
    required this.authorText,
    required this.notesText,
  });

  final String title;

  /// 「作者原文」块（只读）
  final String authorText;

  /// 「我的想法」块（可编辑）
  final String notesText;

  static const empty = FlowUsRecordContent(title: '', authorText: '', notesText: '');
}

class FlowUsRecordPage extends StatefulWidget {
  const FlowUsRecordPage({
    super.key,
    required this.collection,
    required this.record,
    required this.onTitleChanged,
    required this.onCellChanged,
    required this.onNotesChanged,
    this.onOpenFullPage,
    this.aiActions = const [],
    this.aiStatusText,
  });

  final FlowUsCollection collection;
  final FlowUsRecord record;

  final void Function(String title) onTitleChanged;

  /// 属性区改了一个字段的值
  final void Function(String fieldId, Object? value) onCellChanged;

  /// 「我的想法」正文改了
  final void Function(String text) onNotesChanged;

  /// 「展开成整页」
  final VoidCallback? onOpenFullPage;

  /// AI 动作（图标+文案+回调），由 M9 注入
  final List<(String, VoidCallback)> aiActions;

  /// AI 状态文案（如「已生成」）
  final String? aiStatusText;

  @override
  State<FlowUsRecordPage> createState() => _FlowUsRecordPageState();
}

class _FlowUsRecordPageState extends State<FlowUsRecordPage> {
  late final TextEditingController _notes = TextEditingController(text: '');

  @override
  void initState() {
    super.initState();
    _notes.text = widget.record.cells['__notes'] as String? ?? '';
  }

  @override
  void didUpdateWidget(covariant FlowUsRecordPage old) {
    super.didUpdateWidget(old);
    if (widget.record.uuid != old.record.uuid) {
      _notes.text = widget.record.cells['__notes'] as String? ?? '';
    }
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  /// 「作者原文」块的内容：优先读 record 自己的正文键；没有就退回一个约定键
  String get _authorText {
    final v = widget.record.cells['__author'];
    if (v is String) return v;
    final alt = widget.record.cells['__content'];
    return alt is String ? alt : '';
  }

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    final titleField = widget.collection.titleField;
    final titleValue = titleField == null
        ? ''
        : (widget.record.cells[titleField.id] as String? ?? '');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ---- 标题 ----
        Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: TextFormField(
                  initialValue: titleValue,
                  maxLines: null,
                  style: const TextStyle(
                    fontSize: 24,
                    height: 32 / 24,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF37352F),
                  ),
                  decoration: const InputDecoration(
                    isDense: true,
                    contentPadding: EdgeInsets.zero,
                    border: InputBorder.none,
                  ),
                  onChanged: widget.onTitleChanged,
                ),
              ),
              if (widget.onOpenFullPage != null)
                IconButton(
                  onPressed: widget.onOpenFullPage,
                  icon: const Icon(Icons.open_in_full, size: 16),
                  tooltip: '展开成整页',
                  visualDensity: VisualDensity.compact,
                ),
            ],
          ),
        ),

        // ---- 属性区（与表格列共用同一份数据）----
        _PropertyArea(
          collection: widget.collection,
          record: widget.record,
          onCellChanged: widget.onCellChanged,
          onAddProperty: null,
        ),

        // ---- AI 工具条（整篇级）----
        if (widget.aiActions.isNotEmpty || widget.aiStatusText != null) ...[
          const SizedBox(height: 10),
          Row(
            children: [
              for (final (label, action) in widget.aiActions)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: OutlinedButton.icon(
                    onPressed: action,
                    icon: const Icon(Icons.auto_awesome, size: 13),
                    label: Text(label, style: const TextStyle(fontSize: 13, height: 18 / 13)),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: c.primary,
                      side: BorderSide(color: c.primary.withValues(alpha: 0.35)),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      minimumSize: const Size(0, 26),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                ),
              if (widget.aiStatusText != null)
                Text(
                  widget.aiStatusText!,
                  style: const TextStyle(fontSize: 12, height: 18 / 12, color: Color(0xFF91918E)),
                ),
            ],
          ),
        ],

        const SizedBox(height: 12),
        const Divider(height: 1, thickness: 1, color: Color(0xFFE5E5E5)),
        const SizedBox(height: 12),

        // ---- 作者原文（只读）----
        _BlockLabel(text: '作者原文', icon: Icons.lock_outline, readonly: true),
        const SizedBox(height: 6),
        Container(
          width: double.infinity,
          constraints: const BoxConstraints(minHeight: 40),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: const Color(0xFFF7F7F7),
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: const Color(0x0F000000)),
          ),
          child: _authorText.isEmpty
              ? const Text('（无原文内容）',
                  style: TextStyle(fontSize: 14, height: 26 / 14, color: Color(0xFFBDBDBD)))
              : SelectableText(
                  _authorText,
                  style: const TextStyle(fontSize: 14, height: 26 / 14, color: Color(0xFF37352F)),
                ),
        ),

        const SizedBox(height: 14),
        const Divider(height: 1, thickness: 1, color: Color(0xFFE5E5E5)),
        const SizedBox(height: 12),

        // ---- 我的想法（可编辑）----
        _BlockLabel(text: '我的想法', icon: Icons.edit_outlined, readonly: false),
        const SizedBox(height: 6),
        TextField(
          controller: _notes,
          maxLines: null,
          minLines: 3,
          style: const TextStyle(fontSize: 14, height: 26 / 14, color: Color(0xFF37352F)),
          cursorColor: c.primary,
          decoration: const InputDecoration(
            isDense: true,
            contentPadding: EdgeInsets.zero,
            border: InputBorder.none,
            hintText: '写下你的想法…',
            hintStyle: TextStyle(fontSize: 14, height: 26 / 14, color: Color(0xFFBDBDBD)),
          ),
          onChanged: widget.onNotesChanged,
        ),
      ],
    );
  }
}

/// 属性区：字段名 + 值，点击值即可改
class _PropertyArea extends StatelessWidget {
  const _PropertyArea({
    required this.collection,
    required this.record,
    required this.onCellChanged,
    this.onAddProperty,
  });

  final FlowUsCollection collection;
  final FlowUsRecord record;
  final void Function(String fieldId, Object? value) onCellChanged;
  final VoidCallback? onAddProperty;

  @override
  Widget build(BuildContext context) {
    // 标题列不在属性区里重复显示
    final fields = [for (final f in collection.fields) if (!f.isTitle) f];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final f in fields)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 80,
                  child: Text(
                    f.name,
                    style: const TextStyle(fontSize: 13, height: 20 / 13, color: Color(0xFF91918E)),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _PropertyValue(
                    field: f,
                    record: record,
                    onChanged: (v) => onCellChanged(f.id, v),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _PropertyValue extends StatelessWidget {
  const _PropertyValue({required this.field, required this.record, required this.onChanged});

  final FlowUsFieldDefinition field;
  final FlowUsRecord record;
  final void Function(Object? value) onChanged;

  @override
  Widget build(BuildContext context) {
    final raw = record.cells[field.id];
    return InkWell(
      onTap: () => _edit(context),
      child: Container(
        constraints: const BoxConstraints(minHeight: 24),
        alignment: Alignment.centerLeft,
        child: FlowUsCellValue(field: field, raw: raw),
      ),
    );
  }

  Future<void> _edit(BuildContext context) async {
    final picked = await showFlowUsOptionPicker(context, field: field, current: record.cells[field.id]);
    if (picked != null) onChanged(picked);
  }
}

class _BlockLabel extends StatelessWidget {
  const _BlockLabel({required this.text, required this.icon, required this.readonly});

  final String text;
  final IconData icon;
  final bool readonly;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 13, color: const Color(0xFF91918E)),
        const SizedBox(width: 5),
        Text(
          text,
          style: const TextStyle(fontSize: 12, height: 18 / 12, color: Color(0xFF91918E)),
        ),
        if (readonly) ...[
          const SizedBox(width: 6),
          const Text('（只读）',
              style: TextStyle(fontSize: 12, height: 18 / 12, color: Color(0xFFBDBDBD))),
        ],
      ],
    );
  }
}
