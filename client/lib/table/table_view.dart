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
  String _filter = ''; // 标题列本地过滤（FlowUs 的搜索框）
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

  /// 搜索过滤：只匹配首列（标题）文本，大小写不敏感。
  List<TableRowData> _filteredRows(TableData t) {
    if (_filter.isEmpty) return t.rows;
    final key = _filter.toLowerCase();
    final firstCol = t.cols.first.id;
    return t.rows
        .where((r) => (r.cells[firstCol] ?? '').toLowerCase().contains(key))
        .toList();
  }

  /// 视图菜单（FlowUs 形态）：当前只有表格，其它视图标注即将支持。
  Future<void> _showViewMenu(BuildContext context) async {
    await showDialog<void>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('视图'),
        children: [
          SimpleDialogOption(
            onPressed: () => Navigator.pop(ctx),
            child: const Row(children: [
              Icon(Icons.check, size: 16),
              SizedBox(width: 8),
              Text('表格'),
            ]),
          ),
          for (final name in const ['看板', '画廊', '目录', '时间轴', '日历', '收集表'])
            SimpleDialogOption(
              onPressed: null,
              child: Padding(
                padding: const EdgeInsets.only(left: 24),
                child: Row(children: [
                  Text(name, style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
                  const SizedBox(width: 8),
                  Text('即将支持', style: TextStyle(color: Colors.grey.shade400, fontSize: 11)),
                ]),
              ),
            ),
        ],
      ),
    );
  }

  /// 更多菜单：加列 / 加行 / 删除空行等（保持旧入口可用）。
  Future<void> _showMoreMenu(BuildContext context) async {
    final v = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: const Icon(Icons.playlist_add, size: 20),
            title: const Text('新建记录'),
            onTap: () => Navigator.pop(ctx, 'row'),
          ),
          ListTile(
            leading: const Icon(Icons.view_column_outlined, size: 20),
            title: const Text('新建列'),
            onTap: () => Navigator.pop(ctx, 'col'),
          ),
        ]),
      ),
    );
    if (v == 'row') _addRow();
    if (v == 'col') _addColumn();
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  // —— 绘制 ——

  @override
  Widget build(BuildContext context) {
    final t = _t!;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // 视图栏（FlowUs 形态）：左侧「表格 ▾」，右侧 搜索/⋯/创建▾
      Row(children: [
        InkWell(
          onTap: () => _showViewMenu(context),
          borderRadius: BorderRadius.circular(4),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 5),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.table_chart_outlined, size: 16),
              const SizedBox(width: 6),
              const Text('表格', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
              const Icon(Icons.keyboard_arrow_down, size: 16),
            ]),
          ),
        ),
        const SizedBox(width: 6),
        Text('${t.rows.length} 行',
            style: TextStyle(fontSize: 11.5, color: Colors.grey.shade500)),
        const Spacer(),
        IconButton(
          visualDensity: VisualDensity.compact,
          tooltip: '更多（加列 / 加行）',
          icon: const Icon(Icons.more_horiz, size: 18),
          onPressed: () => _showMoreMenu(context),
        ),
        const SizedBox(width: 2),
        // 「创建 ▾」：点主体=新建记录，点箭头=加列
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: Material(
            color: const Color(0xFF2B7CF6),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              InkWell(
                onTap: _addRow,
                child: const Padding(
                  padding: EdgeInsets.fromLTRB(12, 8, 10, 8),
                  child: Text('创建',
                      style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ),
              Container(width: 1, height: 18, color: Colors.white24),
              PopupMenuButton<String>(
                tooltip: '更多创建方式',
                padding: EdgeInsets.zero,
                onSelected: (v) {
                  if (v == 'row') _addRow();
                  if (v == 'col') _addColumn();
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'row', child: Text('新建记录')),
                  PopupMenuItem(value: 'col', child: Text('新建列')),
                ],
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                  child: Icon(Icons.keyboard_arrow_down, size: 16, color: Colors.white),
                ),
              ),
            ]),
          ),
        ),
      ]),
      const SizedBox(height: 6),
      // 搜索框（本地过滤标题列）
      SizedBox(
        height: 34,
        child: TextField(
          onChanged: (v) => setState(() => _filter = v.trim()),
          style: const TextStyle(fontSize: 13),
          decoration: InputDecoration(
            isDense: true,
            filled: true,
            fillColor: const Color(0xFFF3F4F6),
            prefixIcon: const Icon(Icons.search, size: 16),
            prefixIconConstraints: const BoxConstraints(minWidth: 32),
            hintText: '搜索',
            hintStyle: TextStyle(fontSize: 13, color: Colors.grey.shade500),
            contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(6),
              borderSide: BorderSide.none,
            ),
          ),
        ),
      ),
      const SizedBox(height: 6),
      // 表体：纵向可滚（行多）套横向可滚（列多）——列宽是 dp，360dp 手机屏装不下几列
      Expanded(
        child: t.rows.isEmpty
            ? Center(
                child: Text('还没有记录。点上面「加行」添加，\n点第一列打开记录页，点其他格编辑。',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey, fontSize: 13)),
              )
            : SingleChildScrollView(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    _headerRow(t),
                    for (final row in _filteredRows(t)) _dataRow(t, row),
                  ]),
                ),
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
