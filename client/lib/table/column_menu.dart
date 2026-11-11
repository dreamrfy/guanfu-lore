// 列头菜单 + 筛选器面板（M4-T05 列头菜单 / M4-T09 组合筛选器 / M4-T10 排序）
//
// 实测依据（真 FlowUs 数据库页，M0-T18 采到「列头菜单 11 项」；M0-T23 采到中文名 test-id 可用）：
//   · 列头菜单在**列头下方**弹出，项高 32、文字 14/20、图标 16 距左 15、文字距左 39
//   · 筛选器支持**多条件 AND + 一组 OR**（用户明选：「未读 + 某个公众号 + 本周」）
//   · 排序是**点列头**（升/降/取消），不是菜单项
//
// ⚠️ 这里的几何是照 FlowUs 的通用面板规格来的，**不是从真 FlowUs 的数据库页逐项量出来的**
//    （那一页需要用户配合才能进）。做完后要与真机复核。

import 'package:flutter/material.dart';

import 'flowus_table.dart';
import 'table_engine.dart';
import '../design/tokens.dart';

/// 列头菜单：改名 / 换类型 / 左右插入 / 排序 / 筛选 / 隐藏 / 冻结 / 删除
class FlowUsColumnMenu extends StatelessWidget {
  const FlowUsColumnMenu({
    super.key,
    required this.field,
    required this.index,
    required this.total,
    required this.onRename,
    required this.onChangeType,
    required this.onInsertLeft,
    required this.onInsertRight,
    required this.onDelete,
    required this.onFilter,
    this.onHide,
    this.onFreeze,
    this.onSortAsc,
    this.onSortDesc,
    this.onClearSort,
    this.sortAscending = false,
    this.sortDescending = false,
    this.filtered = false,
  });

  final FlowUsFieldDefinition field;
  final int index;
  final int total;

  final VoidCallback onRename;
  final VoidCallback onChangeType;
  final VoidCallback onInsertLeft;
  final VoidCallback onInsertRight;
  final VoidCallback onDelete;
  final VoidCallback onFilter;
  final VoidCallback? onHide;
  final VoidCallback? onFreeze;

  final VoidCallback? onSortAsc;
  final VoidCallback? onSortDesc;
  final VoidCallback? onClearSort;
  final bool sortAscending;
  final bool sortDescending;
  final bool filtered;

  @override
  Widget build(BuildContext context) {
    return _MenuPanel(
      children: [
        _MenuItem(label: field.name, bold: true, subLabel: field.type.label),
        const _MenuDivider(),
        _MenuItem(label: '按${field.name}升序排列', onTap: onSortAsc, dim: onSortAsc == null),
        _MenuItem(label: '按${field.name}降序排列', onTap: onSortDesc, dim: onSortDesc == null),
        if (sortAscending || sortDescending)
          _MenuItem(label: '取消排序', onTap: onClearSort),
        _MenuItem(label: '筛选', onTap: onFilter, badge: filtered),
        const _MenuDivider(),
        _MenuItem(label: '重命名', onTap: onRename),
        _MenuItem(label: '更改类型', onTap: onChangeType),
        _MenuItem(label: '在左侧插入', onTap: onInsertLeft, dim: index == 0),
        _MenuItem(label: '在右侧插入', onTap: onInsertRight, dim: index == total - 1),
        if (onHide != null) _MenuItem(label: '隐藏字段', onTap: onHide),
        if (onFreeze != null) _MenuItem(label: '冻结到此列', onTap: onFreeze),
        const _MenuDivider(),
        _MenuItem(label: '删除字段', onTap: onDelete, danger: true),
      ],
    );
  }
}

/// 筛选器面板：**多条件 AND + 一组 OR**
class FlowUsFilterPanel extends StatefulWidget {
  const FlowUsFilterPanel({
    super.key,
    required this.collection,
    required this.groups,
    required this.onApply,
    required this.onCancel,
  });

  final FlowUsCollection collection;
  final List<FlowUsFilterGroup> groups;
  final void Function(List<FlowUsFilterGroup> groups) onApply;
  final VoidCallback onCancel;

  @override
  State<FlowUsFilterPanel> createState() => _FlowUsFilterPanelState();
}

class _FlowUsFilterPanelState extends State<FlowUsFilterPanel> {
  late List<FlowUsFilterGroup> _groups = _initGroups();

  List<FlowUsFilterGroup> _initGroups() {
    final out = <FlowUsFilterGroup>[];
    for (final g in widget.groups) {
      out.add(g.isEmpty ? FlowUsFilterGroup(const <FlowUsFilterCondition>[]) : g);
    }
    if (out.isEmpty) out.add(FlowUsFilterGroup(const <FlowUsFilterCondition>[]));
    return out;
  }

  void _updateGroup(int gi, FlowUsFilterGroup g) {
    setState(() => _groups = [
      for (var i = 0; i < _groups.length; i++) i == gi ? g : _groups[i],
    ]);
  }

  void _updateCondition(int gi, int ci, FlowUsFilterCondition cond) {
    final g = _groups[gi];
    final conds = [
      for (var i = 0; i < g.conditions.length; i++) i == ci ? cond : g.conditions[i],
    ];
    _updateGroup(gi, FlowUsFilterGroup(conds));
  }

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return _MenuPanel(
      width: 320,
      children: [
        const _MenuTitle('筛选'),
        for (var gi = 0; gi < _groups.length; gi++) ...[
          if (gi > 0)
            const _MenuDivider(),
          if (_groups.length > 1)
            _MenuItem(
              label: '满足以下任一条件',
              bold: true,
              onTap: () => setState(() => _groups = [
                    for (var i = 0; i < _groups.length; i++)
                      i == gi ? FlowUsFilterGroup(const <FlowUsFilterCondition>[]) : _groups[i],
                  ]),
            ),
          for (var ci = 0; ci < _groups[gi].conditions.length; ci++)
            _ConditionRow(
              collection: widget.collection,
              condition: _groups[gi].conditions[ci],
              onChanged: (cond) => _updateCondition(gi, ci, cond),
              onRemove: () {
                final g = _groups[gi];
                final conds = [
                  for (var i = 0; i < g.conditions.length; i++)
                    i == ci ? null : g.conditions[i],
                ].whereType<FlowUsFilterCondition>().toList();
                _updateGroup(gi, FlowUsFilterGroup(conds));
              },
            ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () {
                final g = _groups[gi];
                final first = widget.collection.fields.isEmpty
                    ? null
                    : widget.collection.fields.first;
                if (first == null) return;
                _updateGroup(gi, FlowUsFilterGroup([
                  ...g.conditions,
                  FlowUsFilterCondition(fieldId: first.id, operator: FlowUsFilterOperator.equals),
                ]));
              },
              icon: const Icon(Icons.add, size: 14),
              label: const Text('添加条件'),
              style: TextButton.styleFrom(
                foregroundColor: c.primary,
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                textStyle: const TextStyle(fontSize: 14, height: 20 / 14),
              ),
            ),
          ),
        ],
        if (_groups.length > 1)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() => _groups = [..._groups, FlowUsFilterGroup(const <FlowUsFilterCondition>[])]),
              icon: const Icon(Icons.add, size: 14),
              label: const Text('添加条件组'),
              style: TextButton.styleFrom(
                foregroundColor: c.primary,
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                textStyle: const TextStyle(fontSize: 14, height: 20 / 14),
              ),
            ),
          ),
        const _MenuDivider(),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            TextButton(
              onPressed: widget.onCancel,
              style: TextButton.styleFrom(textStyle: const TextStyle(fontSize: 14)),
              child: const Text('取消'),
            ),
            const SizedBox(width: 8),
            FilledButton(
              onPressed: () => widget.onApply([
                for (final g in _groups)
                  if (!g.isEmpty) g,
              ]),
              style: FilledButton.styleFrom(
                backgroundColor: c.primary,
                textStyle: const TextStyle(fontSize: 14),
              ),
              child: const Text('应用'),
            ),
          ],
        ),
      ],
    );
  }
}

class _ConditionRow extends StatelessWidget {
  const _ConditionRow({
    required this.collection,
    required this.condition,
    required this.onChanged,
    required this.onRemove,
  });

  final FlowUsCollection collection;
  final FlowUsFilterCondition condition;
  final void Function(FlowUsFilterCondition) onChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final field = collection.fieldById(condition.fieldId);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: _MiniSelect<String>(
                  value: condition.fieldId,
                  items: <(String, String)>[
                    for (final f in collection.fields) (f.id, f.name),
                  ],
                  onChanged: (v) => onChanged(condition.copyWith(fieldId: v)),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _MiniSelect<FlowUsFilterOperator>(
                  value: condition.operator,
                  items: <(FlowUsFilterOperator, String)>[
                    for (final o in FlowUsFilterOperator.values) (o, o.label),
                  ],
                  onChanged: (v) => onChanged(condition.copyWith(operator: v)),
                ),
              ),
              IconButton(
                onPressed: onRemove,
                icon: const Icon(Icons.close, size: 14),
                visualDensity: VisualDensity.compact,
                constraints: const BoxConstraints(minWidth: 24, minHeight: 24),
                padding: EdgeInsets.zero,
              ),
            ],
          ),
          if (field != null && _needsValue(condition.operator))
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 2),
              child: _ValueInput(
                field: field,
                condition: condition,
                onChanged: (v) => onChanged(condition.copyWith(value: v)),
              ),
            ),
        ],
      ),
    );
  }

  static bool _needsValue(FlowUsFilterOperator op) =>
      op != FlowUsFilterOperator.isEmpty && op != FlowUsFilterOperator.isNotEmpty;
}

class _ValueInput extends StatelessWidget {
  const _ValueInput({required this.field, required this.condition, required this.onChanged});

  final FlowUsFieldDefinition field;
  final FlowUsFilterCondition condition;
  final void Function(Object? value) onChanged;

  @override
  Widget build(BuildContext context) {
    final t = field.type;
    if (t == FlowUsFieldType.checkbox) {
      return _MiniSelect<bool>(
        value: condition.value is bool ? condition.value as bool : true,
        items: const [(true, '勾选'), (false, '未勾选')],
        onChanged: onChanged,
      );
    }
    if (t == FlowUsFieldType.select || t == FlowUsFieldType.multiSelect) {
      final opts = [
        for (final o in field.options ?? const [])
          if (o is String)
            o
          else if (o is Map)
            '${o['name'] ?? o['text'] ?? o['title'] ?? ''}',
      ].where((s) => s.isNotEmpty).toList();
      return _MiniSelect<String>(
        value: '${condition.value ?? ''}',
        items: [('', '请选择'), for (final o in opts) (o, o)],
        onChanged: (v) => onChanged(v.isEmpty ? null : v),
      );
    }
    if (t == FlowUsFieldType.date || t == FlowUsFieldType.createdTime || t == FlowUsFieldType.updatedTime) {
      return _MiniSelect<String>(
        value: '${condition.value ?? ''}',
        items: const [
          ('', '请选择'),
          ('today', '今天'),
          ('week', '本周'),
          ('month', '本月'),
          ('year', '今年'),
        ],
        onChanged: (v) => onChanged(v.isEmpty ? null : v),
      );
    }
    return _MiniSelect<String>(
      value: '${condition.value ?? ''}',
      items: const [('', '请选择')],
      allowCustom: true,
      onChanged: (v) => onChanged(v.isEmpty ? null : v),
    );
  }
}

/// 小下拉（筛选器里用；items 为空时退化成输入框）
class _MiniSelect<T> extends StatelessWidget {
  const _MiniSelect({
    required this.value,
    required this.items,
    required this.onChanged,
    this.allowCustom = false,
  });

  final T value;
  final List<(T, String)> items;
  final void Function(T) onChanged;
  final bool allowCustom;

  @override
  Widget build(BuildContext context) {
    if (allowCustom || items.length <= 1) {
      return TextFormField(
        initialValue: value is String ? value as String : '$value',
        style: const TextStyle(fontSize: 13, height: 18 / 13),
        decoration: const InputDecoration(
          isDense: true,
          contentPadding: EdgeInsets.symmetric(horizontal: 6, vertical: 5),
          border: OutlineInputBorder(),
        ),
        onChanged: (v) {
          if (allowCustom) {
            for (final it in items) {
              if (it.$1 == v) return onChanged(it.$1);
            }
            onChanged(v as T);
          }
        },
      );
    }
    return Container(
      height: 28,
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0x1A37352F)),
        borderRadius: BorderRadius.circular(4),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: items.any((e) => e.$1 == value) ? value : items.first.$1,
          isExpanded: true,
          isDense: true,
          icon: const Icon(Icons.arrow_drop_down, size: 16),
          style: const TextStyle(fontSize: 13, height: 18 / 13, color: Color(0xFF37352F)),
          items: [
            for (final it in items) DropdownMenuItem(value: it.$1, child: Text(it.$2, overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) {
            if (v != null) onChanged(v);
          },
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- 通用面板零件

class _MenuPanel extends StatelessWidget {
  const _MenuPanel({required this.children, this.width = 240});

  final List<Widget> children;
  final double width;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(FlowUsRadius.panel),
        boxShadow: const [
          BoxShadow(color: Color(0x0A191919), offset: Offset(0, 5), blurRadius: 8),
          BoxShadow(color: Color(0x0D191919), offset: Offset(0, 16), blurRadius: 24),
        ],
      ),
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
    );
  }
}

class _MenuTitle extends StatelessWidget {
  const _MenuTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(15, 8, 15, 6),
      child: Text(text, style: const TextStyle(fontSize: 14, height: 20 / 14, fontWeight: FontWeight.w600)),
    );
  }
}

class _MenuItem extends StatelessWidget {
  const _MenuItem({
    required this.label,
    this.onTap,
    this.dim = false,
    this.danger = false,
    this.bold = false,
    this.subLabel,
    this.badge = false,
  });

  final String label;
  final VoidCallback? onTap;
  final bool dim;
  final bool danger;
  final bool bold;
  final String? subLabel;
  final bool badge;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    final color = danger ? const Color(0xFFCB4042) : const Color(0xFF37352F);
    return InkWell(
      onTap: dim ? null : onTap,
      child: Container(
        height: 32,
        padding: const EdgeInsets.symmetric(horizontal: 15),
        alignment: Alignment.centerLeft,
        child: Row(
          children: [
            if (badge)
              Container(
                width: 6,
                height: 6,
                margin: const EdgeInsets.only(right: 6),
                decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle),
              ),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 14,
                  height: 20 / 14,
                  color: dim ? const Color(0xFFBDBDBD) : color,
                  fontWeight: bold ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ),
            if (subLabel != null) ...[
              const SizedBox(width: 6),
              Text(subLabel!, style: const TextStyle(fontSize: 12, height: 18 / 12, color: Color(0xFF91918E))),
            ],
          ],
        ),
      ),
    );
  }
}

class _MenuDivider extends StatelessWidget {
  const _MenuDivider();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(horizontal: 15, vertical: 4),
      child: Divider(height: 1, thickness: 1, color: Color(0xFFE5E5E5)),
    );
  }
}
