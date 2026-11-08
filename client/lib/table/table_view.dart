import 'package:flutter/material.dart';

import 'table_model.dart';

/// 多维表视图（V2.1 ②）：列头 + 记录行 + 单元格编辑 + 加列加行删列删行。
/// 变更通过 [onChanged] 回传完整序列化 JSON（上层走既有防抖保存链，与块编辑器同构）。
class TablePageView extends StatefulWidget {
  const TablePageView({
    super.key,
    required this.initialContent,
    required this.onChanged,
    this.onOpenRecord,
  });

  final String initialContent;
  final ValueChanged<String> onChanged;

  /// 点第一列（标题）打开记录详情页（③）；上层负责物化记录页。为 null 时点单元格一律编辑。
  final void Function(TableRowData row)? onOpenRecord;

  @override
  State<TablePageView> createState() => _TablePageViewState();
}

class _TablePageViewState extends State<TablePageView> {
  TableData? _t;
  static const double _cellWidth = 150;
  static const double _firstCellWidth = 190;

  @override
  void initState() {
    super.initState();
    _t = decodeTable(widget.initialContent);
  }

  @override
  void didUpdateWidget(covariant TablePageView old) {
    super.didUpdateWidget(old);
    // 外部内容变化（如草稿恢复）：仅当输入真的变了才重载
    if (widget.initialContent != old.initialContent &&
        widget.initialContent != encodeTable(_t!)) {
      setState(() => _t = decodeTable(widget.initialContent));
    }
  }

  void _apply(TableData next) {
    setState(() => _t = next);
    widget.onChanged(encodeTable(next));
  }

  // —— 操作 ——

  void _addColumn() => _apply(addColumn(_t!));

  Future<void> _renameColumn(TableColumn col) async {
    final name = await _textDialog('重命名列', '列名', col.name);
    if (name == null || name.trim().isEmpty || name == col.name) return;
    _apply(renameColumn(_t!, col.id, name.trim()));
  }

  Future<void> _deleteColumn(TableColumn col) async {
    if (_t!.cols.length <= 1) {
      _toast('至少保留一列');
      return;
    }
    final yes = await _confirm('删除列「${col.name}」？', '该列所有单元格的数据将一并删除，不可恢复。');
    if (yes != true) return;
    _apply(deleteColumn(_t!, col.id));
  }

  void _addRow() => _apply(addRow(_t!));

  Future<void> _deleteRow(TableRowData row) async {
    final yes = await _confirm('删除这一行？', '删除后不可恢复（记录页与批注不受影响）。');
    if (yes != true) return;
    _apply(deleteRow(_t!, row.id));
  }

  Future<void> _editCell(TableRowData row, TableColumn col) async {
    final value = await _textDialog('编辑：${col.name}', col.name, row.cells[col.id] ?? '');
    if (value == null) return;
    if (value == (row.cells[col.id] ?? '')) return;
    _apply(updateCell(_t!, row.id, col.id, value));
  }

  // —— 对话框工具 ——

  Future<String?> _textDialog(String title, String label, String initial) {
    final ctl = TextEditingController(text: initial);
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: ctl,
          autofocus: true,
          maxLines: 1,
          decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
          onSubmitted: (v) => Navigator.pop(ctx, v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctl.text), child: const Text('确定')),
        ],
      ),
    );
  }

  Future<bool?> _confirm(String title, String body) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  // —— 绘制 ——

  @override
  Widget build(BuildContext context) {
    final t = _t!;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // 工具行：加列 / 加行
      Row(children: [
        OutlinedButton.icon(
          onPressed: _addColumn,
          icon: const Icon(Icons.add, size: 16),
          label: const Text('加列', style: TextStyle(fontSize: 13)),
        ),
        const SizedBox(width: 8),
        OutlinedButton.icon(
          onPressed: _addRow,
          icon: const Icon(Icons.add, size: 16),
          label: const Text('加行', style: TextStyle(fontSize: 13)),
        ),
        const SizedBox(width: 8),
        Text('${t.rows.length} 行 × ${t.cols.length} 列',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
      ]),
      const SizedBox(height: 8),
      // 表体：横向可滚（列多时），行内纵向排
      Expanded(
        child: t.rows.isEmpty
            ? Center(
                child: Text('还没有记录。点上面「加行」添加，\n点任意单元格直接填写。',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey, fontSize: 13)),
              )
            : SingleChildScrollView(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  _headerRow(t),
                  for (final row in t.rows) _dataRow(t, row),
                ]),
              ),
      ),
    ]);
  }

  Widget _headerRow(TableData t) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        border: Border(bottom: BorderSide(color: Colors.grey.shade300)),
      ),
      child: Row(children: [
        for (final col in t.cols)
          _headerCell(col, isFirst: col.id == t.cols.first.id),
      ]),
    );
  }

  Widget _headerCell(TableColumn col, {required bool isFirst}) {
    return SizedBox(
      width: isFirst ? _firstCellWidth : _cellWidth,
      child: PopupMenuButton<String>(
        tooltip: '列操作（重命名/删除）',
        padding: EdgeInsets.zero,
        onSelected: (v) {
          if (v == 'rename') _renameColumn(col);
          if (v == 'delete') _deleteColumn(col);
        },
        itemBuilder: (_) => const [
          PopupMenuItem(value: 'rename', child: Text('重命名列')),
          PopupMenuItem(value: 'delete', child: Text('删除列', style: TextStyle(color: Colors.red))),
        ],
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          child: Row(children: [
            Expanded(
              child: Text(
                col.name.isEmpty ? '（未命名）' : col.name,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Icon(Icons.arrow_drop_down, size: 18, color: Colors.grey.shade600),
          ]),
        ),
      ),
    );
  }

  Widget _dataRow(TableData t, TableRowData row) {
    final firstColId = t.cols.first.id;
    return Container(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
      ),
      child: Row(children: [
        for (final col in t.cols)
          SizedBox(
            width: col.id == firstColId ? _firstCellWidth : _cellWidth,
            child: InkWell(
              onTap: () {
                if (col.id == firstColId && widget.onOpenRecord != null) {
                  widget.onOpenRecord!(row); // 首列=打开记录页（③）
                } else {
                  _editCell(row, col);
                }
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                child: Text(
                  row.cells[col.id] ?? '',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: col.id == firstColId ? FontWeight.w600 : null,
                    color: col.id == firstColId && widget.onOpenRecord != null
                        ? Colors.blue.shade800
                        : null,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          ),
        // 行尾操作：删除行
        SizedBox(
          width: 44,
          child: IconButton(
            visualDensity: VisualDensity.compact,
            tooltip: '删除这一行',
            icon: Icon(Icons.close, size: 16, color: Colors.grey.shade500),
            onPressed: () => _deleteRow(row),
          ),
        ),
      ]),
    );
  }
}
