// 多维表「表格视图」骨架（M4-T02）
//
// 数值全部来自 `tokens.dart` 的 `FlowUsTable`（2026-11-10 现场实测）：
//   列头高 37、行高 36、默认列宽 180、序号列 66、网格线 1px rgba(55,53,47,0.1)、
//   列头文字 14/24 #37352F + 左右内边距 8、列宽拖拽手柄 4×37 贴列右缘。
//
// **前两列（序号 + 标题）冻结**：实测横向滚动 +320 后这两列的 x 一点没动，所以它们不放在滚动区里。
//
// 本任务只做骨架：列头 / 行 / 单元格尺寸 / 网格线 / 冻结 / 列宽拖拽。
// 单元格的**值渲染**（单选彩色胶囊、日期格式、勾选框……）属 M4-T03；列头菜单（更换类型等 11 项）属 M4-T04。
// ⚠️ 拖拽的最小/最大列宽**未实测**（只量到当前 180），先按 80/600 一档，等拖拽样本再收紧。

import 'package:flutter/material.dart';

import 'cell_renderers.dart';
import 'flowus_table.dart';
import '../design/tokens.dart';

/// 表格视图骨架：序号列 + 标题列冻结，其余列可横向滚动、可拖拽改宽
class FlowUsTableSkeleton extends StatefulWidget {
  const FlowUsTableSkeleton({
    super.key,
    required this.collection,
    this.columnWidths = const {},
    this.onColumnResized,
  });

  final FlowUsCollection collection;

  /// 初始列宽覆盖（字段 id → 宽度）；未给则用 [FlowUsTable.columnWidth]
  final Map<String, double> columnWidths;

  /// 拖拽结束回调（字段 id, 新宽度）
  final void Function(String fieldId, double width)? onColumnResized;

  @override
  State<FlowUsTableSkeleton> createState() => _FlowUsTableSkeletonState();
}

class _FlowUsTableSkeletonState extends State<FlowUsTableSkeleton> {
  late Map<String, double> _widths;

  @override
  void initState() {
    super.initState();
    _widths = {
      for (final f in widget.collection.fields)
        f.id: widget.columnWidths[f.id] ?? FlowUsTable.columnWidth,
    };
  }

  double _widthOf(String fieldId) => _widths[fieldId] ?? FlowUsTable.columnWidth;

  /// 标题列：type=title 的那一列（数据模型保证唯一；没有就不特殊对待）
  String? get _titleFieldId => widget.collection.titleField?.id;

  List<FlowUsFieldDefinition> get _frozenFields => [
        for (final f in widget.collection.fields)
          if (f.id == _titleFieldId) f,
      ];

  List<FlowUsFieldDefinition> get _scrollFields => [
        for (final f in widget.collection.fields)
          if (f.id != _titleFieldId) f,
      ];

  void _resize(String fieldId, double delta) {
    final cur = _widthOf(fieldId);
    final next = (cur + delta).clamp(FlowUsTable.minColumnWidth, FlowUsTable.maxColumnWidth).toDouble();
    if (next == cur) return;
    setState(() => _widths = {..._widths, fieldId: next});
    widget.onColumnResized?.call(fieldId, next);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: FlowUsTable.headerHeight,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 冻结：序号列（66）+ 标题列
              const _IndexHeaderCell(),
              for (final f in _frozenFields)
                _HeaderCell(
                  key: ValueKey('h_${f.id}'),
                  field: f,
                  width: _widthOf(f.id),
                  showResizeHandle: true,
                  onResize: (d) => _resize(f.id, d),
                ),
              // 其余列：横向滚动
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final f in _scrollFields)
                        _HeaderCell(
                          key: ValueKey('h_${f.id}'),
                          field: f,
                          width: _widthOf(f.id),
                          showResizeHandle: true,
                          onResize: (d) => _resize(f.id, d),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        for (final record in widget.collection.records)
          SizedBox(
            height: FlowUsTable.rowHeight,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _IndexCell(text: '${widget.collection.records.indexOf(record) + 1}'),
                for (final f in _frozenFields) _BodyCell(field: f, record: record, width: _widthOf(f.id)),
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (final f in _scrollFields)
                          _BodyCell(field: f, record: record, width: _widthOf(f.id)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// 序号列头（66 宽，实测 16/24；无拖拽手柄）
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
    this.showResizeHandle = false,
    this.onResize,
  });

  final FlowUsFieldDefinition field;
  final double width;
  final bool showResizeHandle;
  final void Function(double delta)? onResize;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            decoration: const BoxDecoration(
              border: Border(
                right: BorderSide(color: FlowUsTable.gridColor, width: FlowUsTable.gridWidth),
                bottom: BorderSide(color: FlowUsTable.gridColor, width: FlowUsTable.gridWidth),
              ),
            ),
            padding: const EdgeInsets.symmetric(horizontal: FlowUsTable.cellPaddingH),
            alignment: Alignment.centerLeft,
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
          if (showResizeHandle)
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

/// 列宽拖拽手柄：4px 宽、贴列右缘、cursor: col-resize（实测）
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

/// 行内单元格：只出**文本**（值渲染属 M4-T03）
class _BodyCell extends StatelessWidget {
  const _BodyCell({required this.field, required this.record, required this.width});

  final FlowUsFieldDefinition field;
  final FlowUsRecord record;
  final double width;

  @override
  Widget build(BuildContext context) {
    final raw = record.cells[field.id];
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
      // 值渲染按字段类型走（M4-T03）：文本/数字/单选/多选/日期/勾选框
      child: FlowUsCellValue(field: field, raw: raw),
    );
  }
}