// 多维表「表格视图」主容器（M4-T02 骨架 + M4-T04~T11 的**交互装配**）
//
// 这个文件是 M4 的**交付面**：把引擎（table_engine）、单元格编辑（cell_editors）、
// 列头菜单与筛选器（column_menu）、记录页（record_page）组装成一个真能用的表格。
//
// ⚠️ 验收铁律（M2R 段立的规矩）：每条交互都要能演示「点它 → 数据真的变了 → 重开还在」。
//    所以这里的所有操作都**回调到宿主**去落库（onCollectionChanged），
//    本文件自己**不碰数据库** —— 落库由壳层负责，UI 只负责改出新的 collection。

import 'package:flutter/material.dart';

import 'cell_editors.dart';
import 'cell_renderers.dart';
import 'column_menu.dart';
import 'flowus_table.dart';
import 'record_page.dart';
import 'table_engine.dart';
import '../design/tokens.dart';

/// 一个真能用的表格视图
class FlowUsTableView extends StatefulWidget {
  const FlowUsTableView({
    super.key,
    required this.collection,
    required this.onCollectionChanged,
    this.onOpenRecord,
    this.columnWidths = const {},
    this.onColumnResized,
    this.aiActions = const [],
    this.aiStatusOf,
  });

  final FlowUsCollection collection;

  /// collection 变了（列增删改、单元格改了、筛选排序改了）→ 宿主负责落库
  final void Function(FlowUsCollection collection) onCollectionChanged;

  /// 点某一行 → 打开记录页
  final void Function(FlowUsRecord record)? onOpenRecord;

  final Map<String, double> columnWidths;
  final void Function(String fieldId, double width)? onColumnResized;

  /// 整篇级 AI 动作（图标+文案+回调），M9 注入
  final List<(String, VoidCallback)> aiActions;

  /// 某条记录的 AI 状态文案
  final String? Function(FlowUsRecord record)? aiStatusOf;

  @override
  State<FlowUsTableView> createState() => _FlowUsTableViewState();
}

class _FlowUsTableViewState extends State<FlowUsTableView> {
  late Map<String, double> _widths = {
    for (final f in widget.collection.fields)
      f.id: widget.columnWidths[f.id] ?? FlowUsTable.columnWidth,
  };

  /// 当前视图（多条件筛选 + 排序都挂在它身上）
  late FlowUsView? _view = widget.collection.defaultView;

  late List<FlowUsFilterGroup> _filters = _readFilters(_view);
  late List<FlowUsSorter> _sorters = _readSorters(_view);

  /// 正在编辑的单元格：'recordId|fieldId'
  String? _editing;

  /// 打开列菜单的字段 id
  String? _menuFieldId;

  /// 打开筛选器的字段 id
  String? _filterFieldId;

  /// 打开记录页的记录 id
  String? _openRecordId;

  @override
  void didUpdateWidget(covariant FlowUsTableView old) {
    super.didUpdateWidget(old);
    if (widget.collection.views.length != old.collection.views.length ||
        widget.collection.id != old.collection.id) {
      _view = widget.collection.defaultView;
      _filters = _readFilters(_view);
      _sorters = _readSorters(_view);
    }
  }

  // ------------------------------------------------------------ 数据变换

  void _commit(FlowUsCollection next) {
    widget.onCollectionChanged(next);
    setState(() {});
  }

  List<FlowUsRecord> get _visibleRecords {
    final filtered = FlowUsTableEngine.applyFilters(widget.collection, _filters);
    return FlowUsTableEngine.applySorters(widget.collection, _sorters)
      ..removeWhere((r) => !filtered.any((f) => f.uuid == r.uuid));
  }

  // ------------------------------------------------------------ 列操作

  Future<void> _addColumn({int? at}) async {
    final name = await _askName(context, title: '新建字段', initial: '新字段');
    if (name == null || !mounted) return;
    var next = FlowUsTableEngine.addColumn(widget.collection, name: name);
    if (at != null) next = FlowUsTableEngine.reorderColumn(next, next.fields.last.id, at);
    _commit(next);
  }

  Future<void> _renameColumn(FlowUsFieldDefinition f) async {
    final name = await _askName(context, title: '重命名字段', initial: f.name);
    if (name == null || name.isEmpty || !mounted) return;
    _commit(FlowUsTableEngine.renameColumn(widget.collection, f.id, name));
  }

  Future<void> _changeColumnType(FlowUsFieldDefinition f) async {
    final picked = await showDialog<FlowUsFieldType>(
      context: context,
      builder: (ctx) => _FieldTypeDialog(current: f.type),
    );
    if (!mounted || picked == null || picked == f.type) return;

    // ⚠️ M4-T11：不默默丢数据 —— 先评估影响，有损就问用户确认
    final impact = FlowUsTableEngine.assessTypeChange(widget.collection, f.id, picked);
    if (!impact.safe) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('改成这个类型会丢数据'),
          content: Text(impact.note),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('取消')),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFFCB4042)),
              child: const Text('仍然改'),
            ),
          ],
        ),
      );
      if (!mounted || ok != true) return;
    }
    if (!mounted) return;
    _commit(FlowUsTableEngine.changeColumnType(widget.collection, f.id, picked));
  }

  Future<void> _deleteColumn(FlowUsFieldDefinition f) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('删除字段「${f.name}」？'),
        content: const Text('这一列的值也会一起删掉，无法恢复。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFCB4042)),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (!mounted || ok != true) return;
    _commit(FlowUsTableEngine.deleteColumn(widget.collection, f.id));
  }

  Future<void> _insertColumn(FlowUsFieldDefinition f, {required bool left}) async {
    final name = await _askName(context, title: left ? '在左侧插入字段' : '在右侧插入字段', initial: '新字段');
    if (name == null || !mounted) return;
    final index = widget.collection.fields.indexWhere((x) => x.id == f.id);
    var next = FlowUsTableEngine.addColumn(widget.collection, name: name);
    final newId = next.fields.last.id;
    next = FlowUsTableEngine.reorderColumn(next, newId, left ? index : index + 1);
    _commit(next);
  }

  // ------------------------------------------------------------ 行操作

  void _addRow() {
    _commit(FlowUsTableEngine.addRow(widget.collection));
  }

  Future<void> _deleteRow(FlowUsRecord r) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除这一行？'),
        content: const Text('这一行的所有字段值都会删掉。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFCB4042)),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (!mounted || ok != true) return;
    _commit(FlowUsTableEngine.deleteRow(widget.collection, r.uuid));
  }

  void _setCell(String recordId, String fieldId, Object? value) {
    _commit(FlowUsTableEngine.setCell(widget.collection, recordId, fieldId, value));
  }

  // ------------------------------------------------------------ 排序 / 筛选

  void _sortBy(String fieldId, {required bool descending}) {
    final existing = [..._sorters];
    existing.removeWhere((s) => s.fieldId == fieldId);
    if (existing.isEmpty && !descending) {
      // 取消排序
    } else {
      existing.add(FlowUsSorter(fieldId: fieldId, descending: descending));
    }
    _sorters = existing;
    _persistViewConfig();
  }

  void _clearSort() {
    _sorters = const [];
    _persistViewConfig();
  }

  void _applyFilters(List<FlowUsFilterGroup> groups) {
    _filters = groups;
    setState(() => _filterFieldId = null);
    _persistViewConfig();
  }

  void _persistViewConfig() {
    final v = _view;
    if (v == null) {
      _commit(widget.collection);
      return;
    }
    _commit(FlowUsTableEngine.writeViewConfig(
      widget.collection,
      v.uuid,
      filters: _filters,
      sorters: _sorters,
    ));
  }

  bool _isFiltered(String fieldId) =>
      _filters.any((g) => g.conditions.any((c) => c.fieldId == fieldId));

  // ------------------------------------------------------------ 构建

  /// 列菜单 / 筛选器要画到**表格盒子外面**（真 FlowUs 是浮在表格上方），
  /// 而 Flutter 的 hit test 出不了父边界 → 用 [OverlayPortal] 挂根 Overlay。
  final OverlayPortalController _menuPortal = OverlayPortalController(debugLabel: 'table-col-menu');
  final OverlayPortalController _filterPortal = OverlayPortalController(debugLabel: 'table-filter');

  /// 菜单锚点（列头的全局坐标）
  Offset _menuAnchor = Offset.zero;
  final Offset _filterAnchor = Offset.zero;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _menuPortal.show();
      _filterPortal.show();
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    final records = _visibleRecords;
    final titleFieldId = widget.collection.titleField?.id;

    final frozen = [
      for (final f in widget.collection.fields)
        if (f.id == titleFieldId) f,
    ];
    final scrollable = [
      for (final f in widget.collection.fields)
        if (f.id != titleFieldId) f,
    ];

    return Stack(
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
        // ---- 工具条 ----
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(
            children: [
              TextButton.icon(
                onPressed: _addRow,
                icon: const Icon(Icons.add, size: 15),
                label: const Text('新建记录', style: TextStyle(fontSize: 13, height: 18 / 13)),
                style: TextButton.styleFrom(
                  foregroundColor: c.primary,
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  minimumSize: const Size(0, 26),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ),
              TextButton.icon(
                onPressed: () => _addColumn(),
                icon: const Icon(Icons.add, size: 15),
                label: const Text('新建字段', style: TextStyle(fontSize: 13, height: 18 / 13)),
                style: TextButton.styleFrom(
                  foregroundColor: c.primary,
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  minimumSize: const Size(0, 26),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ),
              const Spacer(),
              Text(
                '${records.length} / ${widget.collection.records.length} 条',
                style: const TextStyle(fontSize: 12, height: 18 / 12, color: Color(0xFF91918E)),
              ),
            ],
          ),
        ),

        // ---- 列头 ----
        SizedBox(
          height: FlowUsTable.headerHeight,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const _IndexHeaderCell(),
              for (final f in frozen)
                _HeaderCell(
                  key: ValueKey('h_${f.id}'),
                  field: f,
                  width: _widthOf(f.id),
                  sorted: _sorters.where((s) => s.fieldId == f.id).firstOrNull,
                  filtered: _isFiltered(f.id),
                  onTap: (anchor) => setState(() {
                    _menuAnchor = anchor;
                    _menuFieldId = _menuFieldId == f.id ? null : f.id;
                  }),
                  onResize: (d) => _resize(f.id, d),
                ),
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final f in scrollable)
                        _HeaderCell(
                          key: ValueKey('h_${f.id}'),
                          field: f,
                          width: _widthOf(f.id),
                          sorted: _sorters.where((s) => s.fieldId == f.id).firstOrNull,
                          filtered: _isFiltered(f.id),
                          onTap: (anchor) => setState(() {
                    _menuAnchor = anchor;
                    _menuFieldId = _menuFieldId == f.id ? null : f.id;
                  }),
                          onResize: (d) => _resize(f.id, d),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),

        // ---- 行 ----
        if (records.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 28),
            child: Center(
              child: Text(
                _filters.isEmpty ? '还没有记录，点「新建记录」开始' : '没有符合条件的记录',
                style: const TextStyle(fontSize: 14, height: 24 / 14, color: Color(0xFFBDBDBD)),
              ),
            ),
          )
        else
          for (final r in records)
            _RowView(
              record: r,
              index: records.indexOf(r) + 1,
              collection: widget.collection,
              frozenFields: frozen,
              scrollableFields: scrollable,
              widthOf: _widthOf,
              editingCell: _editing,
              isOpen: _openRecordId == r.uuid,
              aiStatus: widget.aiStatusOf?.call(r),
              onEditCell: (fieldId) => setState(() => _editing = '${r.uuid}|$fieldId'),
              onCommitCell: (fieldId, v) {
                setState(() => _editing = null);
                _setCell(r.uuid, fieldId, v);
              },
              onCancelEdit: () => setState(() => _editing = null),
              onOpen: () {
                setState(() => _openRecordId = r.uuid);
                widget.onOpenRecord?.call(r);
              },
              onDelete: () => _deleteRow(r),
            ),
            // ---- 列菜单（OverlayPortal：画到表格外）----
            OverlayPortal(
              controller: _menuPortal,
              overlayChildBuilder: (ctx) => _buildColumnMenu(ctx),
            ),
            // ---- 筛选器（OverlayPortal）----
            OverlayPortal(
              controller: _filterPortal,
              overlayChildBuilder: (ctx) => _buildFilterPanel(ctx),
            ),
          ],
        ),
      ],
    );
  }

  /// 列菜单浮层
  Widget _buildColumnMenu(BuildContext ctx) {
    final id = _menuFieldId;
    if (id == null) return const SizedBox.shrink();
    final f = widget.collection.fieldById(id);
    if (f == null) return const SizedBox.shrink();
    final index = widget.collection.fields.indexWhere((x) => x.id == id);
    final sorter = _sorters.where((s) => s.fieldId == id).firstOrNull;
    return Positioned(
      left: _menuAnchor.dx,
      top: _menuAnchor.dy,
      child: FlowUsColumnMenu(
        field: f,
        index: index,
        total: widget.collection.fields.length,
        filtered: _isFiltered(id),
        sortAscending: sorter != null && !sorter.descending,
        sortDescending: sorter != null && sorter.descending,
        onRename: () {
          setState(() => _menuFieldId = null);
          _renameColumn(f);
        },
        onChangeType: () {
          setState(() => _menuFieldId = null);
          _changeColumnType(f);
        },
        onInsertLeft: () {
          setState(() => _menuFieldId = null);
          _insertColumn(f, left: true);
        },
        onInsertRight: () {
          setState(() => _menuFieldId = null);
          _insertColumn(f, left: false);
        },
        onDelete: () {
          setState(() => _menuFieldId = null);
          _deleteColumn(f);
        },
        onFilter: () {
          setState(() {
            _menuFieldId = null;
            _filterFieldId = id;
          });
        },
        onSortAsc: () {
          setState(() => _menuFieldId = null);
          _sortBy(id, descending: false);
        },
        onSortDesc: () {
          setState(() => _menuFieldId = null);
          _sortBy(id, descending: true);
        },
        onClearSort: () {
          setState(() => _menuFieldId = null);
          _clearSort();
        },
      ),
    );
  }

  /// 筛选器浮层
  Widget _buildFilterPanel(BuildContext ctx) {
    final id = _filterFieldId;
    if (id == null) return const SizedBox.shrink();
    final f = widget.collection.fieldById(id);
    if (f == null) return const SizedBox.shrink();
    return Positioned(
      left: _filterAnchor.dx,
      top: _filterAnchor.dy,
      child: FlowUsFilterPanel(
        collection: widget.collection,
        groups: _filters,
        onApply: (g) => _applyFilters(g),
        onCancel: () => setState(() => _filterFieldId = null),
      ),
    );
  }

  static List<FlowUsFilterGroup> _readFilters(FlowUsView? v) =>
      v == null ? const [] : FlowUsTableEngine.readFilters(v);

  static List<FlowUsSorter> _readSorters(FlowUsView? v) =>
      v == null ? const [] : FlowUsTableEngine.readSorters(v);

  double _widthOf(String fieldId) => _widths[fieldId] ?? FlowUsTable.columnWidth;

  void _resize(String fieldId, double delta) {
    final cur = _widthOf(fieldId);
    final next = (cur + delta).clamp(FlowUsTable.minColumnWidth, FlowUsTable.maxColumnWidth).toDouble();
    if (next == cur) return;
    setState(() => _widths = {..._widths, fieldId: next});
    widget.onColumnResized?.call(fieldId, next);
  }
}

/// 一行：冻结列 + 可滚动列 + 行操作
class _RowView extends StatelessWidget {
  const _RowView({
    required this.record,
    required this.index,
    required this.collection,
    required this.frozenFields,
    required this.scrollableFields,
    required this.widthOf,
    required this.editingCell,
    required this.isOpen,
    required this.onEditCell,
    required this.onCommitCell,
    required this.onCancelEdit,
    required this.onOpen,
    required this.onDelete,
    this.aiStatus,
  });

  final FlowUsRecord record;
  final int index;
  final FlowUsCollection collection;
  final List<FlowUsFieldDefinition> frozenFields;
  final List<FlowUsFieldDefinition> scrollableFields;
  final double Function(String) widthOf;
  final String? editingCell;
  final bool isOpen;
  final void Function(String fieldId) onEditCell;
  final void Function(String fieldId, Object? value) onCommitCell;
  final VoidCallback onCancelEdit;
  final VoidCallback onOpen;
  final VoidCallback onDelete;
  final String? aiStatus;

  bool _isEditing(String fieldId) => editingCell == '${record.uuid}|$fieldId';

  @override
  Widget build(BuildContext context) {
    return Container(
      color: isOpen ? const Color(0x0A0285FF) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: FlowUsTable.rowHeight,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _IndexCell(text: '$index'),
                for (final f in frozenFields) _cell(f),
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (final f in scrollableFields) _cell(f),
                      ],
                    ),
                  ),
                ),
                // 行操作钮
                //
                // ⚠️ 不用 IconButton：它的默认最小宽度是 48px（tap target），
                //    两个并排就 96px > 64px 的槽位 → 必然溢出。
                //    这里自绘 24×24 的点击区（真 FlowUs 行内操作钮就是 20×20）。
                SizedBox(
                  width: 56,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      _RowActionButton(
                        icon: Icons.open_in_new,
                        size: 14,
                        tooltip: '打开',
                        onTap: onOpen,
                      ),
                      _RowActionButton(
                        icon: Icons.delete_outline,
                        size: 14,
                        tooltip: '删除',
                        onTap: onDelete,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (isOpen) _RecordPageHost(record: record, collection: collection, aiStatus: aiStatus),
        ],
      ),
    );
  }

  Widget _cell(FlowUsFieldDefinition f) {
    final editing = _isEditing(f.id);
    return _BodyCell(
      field: f,
      record: record,
      width: widthOf(f.id),
      editing: editing,
      onStartEdit: () => onEditCell(f.id),
      onCommit: (v) => onCommitCell(f.id, v),
      onCancel: onCancelEdit,
    );
  }
}

/// 行内展开的记录页（右侧展开形态；整页形态由宿主另开页面）
class _RecordPageHost extends StatelessWidget {
  const _RecordPageHost({required this.record, required this.collection, this.aiStatus});

  final FlowUsRecord record;
  final FlowUsCollection collection;
  final String? aiStatus;

  @override
  Widget build(BuildContext context) {
    // 记录页的编辑由外部（宿主）负责落库；这里先给出只读骨架 + 占位回调
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 12),
      child: FlowUsRecordPage(
        collection: collection,
        record: record,
        aiStatusText: aiStatus,
        onTitleChanged: (_) {},
        onCellChanged: (_, _) {},
        onNotesChanged: (_) {},
      ),
    );
  }
}

// ---------------------------------------------------------------- 零件

class _IndexHeaderCell extends StatelessWidget {
  const _IndexHeaderCell();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: FlowUsTable.indexColumnWidth,
      decoration: const BoxDecoration(
        border: Border(right: BorderSide(color: FlowUsTable.gridColor, width: FlowUsTable.gridWidth)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: FlowUsTable.cellPaddingH),
      alignment: Alignment.centerLeft,
      child: const Text('No.', style: TextStyle(fontSize: 14, height: 24 / 14, color: FlowUsTable.headerTextColor)),
    );
  }
}

class _HeaderCell extends StatelessWidget {
  const _HeaderCell({
    super.key,
    required this.field,
    required this.width,
    required this.onTap,
    required this.onResize,
    this.sorted,
    this.filtered = false,
  });

  final FlowUsFieldDefinition field;
  final double width;

  /// 点列头 → 回调菜单锚点（全局坐标）
  final void Function(Offset anchor) onTap;
  final void Function(double delta) onResize;
  final FlowUsSorter? sorted;
  final bool filtered;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return SizedBox(
      width: width,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          InkWell(
            onTap: () {
              final box = context.findRenderObject() as RenderBox?;
              final origin = box == null ? Offset.zero : box.localToGlobal(Offset.zero);
              onTap(Offset(origin.dx, origin.dy + FlowUsTable.headerHeight));
            },
            child: Container(
              decoration: const BoxDecoration(
                border: Border(
                  right: BorderSide(color: FlowUsTable.gridColor, width: FlowUsTable.gridWidth),
                  bottom: BorderSide(color: FlowUsTable.gridColor, width: FlowUsTable.gridWidth),
                ),
              ),
              padding: const EdgeInsets.symmetric(horizontal: FlowUsTable.cellPaddingH),
              alignment: Alignment.centerLeft,
              child: Row(
                children: [
                  Flexible(
                    child: Text(
                      field.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: FlowUsTable.headerFontSize,
                        height: FlowUsTable.headerLineHeight / FlowUsTable.headerFontSize,
                        fontWeight: FontWeight.w400,
                        color: FlowUsTable.headerTextColor,
                      ),
                    ),
                  ),
                  if (filtered) ...[
                    const SizedBox(width: 4),
                    Icon(Icons.filter_alt, size: 12, color: c.primary),
                  ],
                  if (sorted != null) ...[
                    const SizedBox(width: 3),
                    Icon(sorted!.descending ? Icons.arrow_downward : Icons.arrow_upward, size: 12, color: c.textTertiary),
                  ],
                ],
              ),
            ),
          ),
          Positioned(
            right: -FlowUsTable.resizeHandleWidth / 2,
            top: 0,
            bottom: 0,
            child: _ResizeHandle(onDrag: onResize),
          ),
        ],
      ),
    );
  }
}

class _ResizeHandle extends StatelessWidget {
  const _ResizeHandle({this.onDrag});
  final void Function(double delta)? onDrag;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.resizeColumn,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onHorizontalDragUpdate: (d) => onDrag?.call(d.delta.dx),
        child: SizedBox(width: FlowUsTable.resizeHandleWidth, height: FlowUsTable.headerHeight),
      ),
    );
  }
}

class _IndexCell extends StatelessWidget {
  const _IndexCell({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: FlowUsTable.indexColumnWidth,
      decoration: const BoxDecoration(
        border: Border(
          right: BorderSide(color: FlowUsTable.gridColor, width: FlowUsTable.gridWidth),
          bottom: BorderSide(color: FlowUsTable.gridColor, width: FlowUsTable.gridWidth),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: FlowUsTable.cellPaddingH),
      alignment: Alignment.centerLeft,
      child: Text(text, style: const TextStyle(fontSize: 14, height: 24 / 14, color: Color(0xFF91918E))),
    );
  }
}

class _BodyCell extends StatelessWidget {
  const _BodyCell({
    required this.field,
    required this.record,
    required this.width,
    required this.editing,
    required this.onStartEdit,
    required this.onCommit,
    required this.onCancel,
  });

  final FlowUsFieldDefinition field;
  final FlowUsRecord record;
  final double width;
  final bool editing;
  final VoidCallback onStartEdit;
  final void Function(Object? value) onCommit;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final raw = record.cells[field.id];
    final type = field.type;

    // 单选/多选/勾选框：**点一下直接出面板**（不进"编辑态"）
    // —— 用户点一下就要能改；多一次"进入编辑"是多余的。
    // 文本/数字/日期才走"点一下出现输入框"的编辑态。
    final directPick = type == FlowUsFieldType.select ||
        type == FlowUsFieldType.multiSelect ||
        type == FlowUsFieldType.checkbox;

    if (directPick && !editing) {
      return Container(
        width: width,
        decoration: const BoxDecoration(
          border: Border(
            right: BorderSide(color: FlowUsTable.gridColor, width: FlowUsTable.gridWidth),
            bottom: BorderSide(color: FlowUsTable.gridColor, width: FlowUsTable.gridWidth),
          ),
        ),
        padding: const EdgeInsets.symmetric(horizontal: FlowUsTable.cellPaddingH),
        alignment: Alignment.centerLeft,
        child: InkWell(
          onTap: () => onStartEdit(),
          child: SizedBox(
            width: double.infinity,
            child: FlowUsCellValue(field: field, raw: raw),
          ),
        ),
      );
    }

    return Container(
      width: width,
      decoration: const BoxDecoration(
        border: Border(
          right: BorderSide(color: FlowUsTable.gridColor, width: FlowUsTable.gridWidth),
          bottom: BorderSide(color: FlowUsTable.gridColor, width: FlowUsTable.gridWidth),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: FlowUsTable.cellPaddingH),
      alignment: Alignment.centerLeft,
      child: editing
          ? FlowUsCellEditor(
              field: field,
              value: raw,
              onCommit: onCommit,
              onCancel: onCancel,
            )
          : InkWell(
              onTap: onStartEdit,
              child: SizedBox(
                width: double.infinity,
                child: FlowUsCellValue(field: field, raw: raw),
              ),
            ),
    );
  }
}

// ---------------------------------------------------------------- 弹窗

Future<String?> _askName(BuildContext context, {required String title, required String initial}) async {
  final controller = TextEditingController(text: initial);
  return await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: controller,
        autofocus: true,
        decoration: const InputDecoration(isDense: true),
        onSubmitted: (v) => Navigator.of(ctx).pop(v.trim()),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('取消')),
        FilledButton(onPressed: () => Navigator.of(ctx).pop(controller.text.trim()), child: const Text('确定')),
      ],
    ),
  );
}

class _FieldTypeDialog extends StatelessWidget {
  const _FieldTypeDialog({required this.current});
  final FlowUsFieldType current;

  static const List<FlowUsFieldType> _pickable = [
    FlowUsFieldType.text,
    FlowUsFieldType.number,
    FlowUsFieldType.select,
    FlowUsFieldType.multiSelect,
    FlowUsFieldType.date,
    FlowUsFieldType.checkbox,
    FlowUsFieldType.url,
    FlowUsFieldType.email,
    FlowUsFieldType.phone,
    FlowUsFieldType.person,
    FlowUsFieldType.formula,
    FlowUsFieldType.relation,
    FlowUsFieldType.rollup,
    FlowUsFieldType.file,
  ];

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('更改类型'),
      content: SizedBox(
        width: 320,
        height: 360,
        child: ListView(
          children: [
            for (final t in _pickable)
              RadioListTile<FlowUsFieldType>(
                value: t,
                // ignore: deprecated_member_use
                groupValue: current,
                // ignore: deprecated_member_use
                onChanged: (v) => Navigator.of(context).pop(v),
                title: Text(t.label, style: const TextStyle(fontSize: 14, height: 20 / 14)),
                dense: true,
              ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
      ],
    );
  }
}

/// 行内小按钮：24×24 点击区 + 14px 图标（不用 IconButton —— 它默认 48px 宽）
class _RowActionButton extends StatelessWidget {
  const _RowActionButton({
    required this.icon,
    required this.size,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final double size;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 24,
          height: 24,
          child: Icon(icon, size: size, color: const Color(0xFF91918E)),
        ),
      ),
    );
  }
}
