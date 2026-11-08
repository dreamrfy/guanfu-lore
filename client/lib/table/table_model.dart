import 'dart:convert';

/// 多维表数据模型（V2.1 ② 多维表最小版）。
/// 存储形态：表页面（type=table）的 content 列存本 JSON，走既有保存链
/// （状态灯/草稿/崩溃恢复全部复用）。所有操作都是纯函数：入参不动，返回新表。
/// 记录页（③）物化后把页面 id 回写到行的 pid。
class TableColumn {
  TableColumn({required this.id, required this.name});

  final String id;
  String name;
}

class TableRowData {
  TableRowData({required this.id, this.pid, this.clip, Map<String, String>? cells})
      : cells = cells ?? {};

  final String id;
  String? pid; // 打开过详情页（③）后指向记录页；null=尚未物化
  String? clip; // 剪藏来源 ID（④）：已入库的剪藏记录，App 端去重锚点
  final Map<String, String> cells; // colId → 文本值；缺键=空
}

class TableData {
  TableData({required this.cols, required this.rows});

  final List<TableColumn> cols;
  final List<TableRowData> rows;

  TableColumn? colById(String id) {
    for (final c in cols) {
      if (c.id == id) return c;
    }
    return null;
  }

  TableRowData? rowById(String id) {
    for (final r in rows) {
      if (r.id == id) return r;
    }
    return null;
  }
}

TableColumn _copyCol(TableColumn c) => TableColumn(id: c.id, name: c.name);
TableRowData _copyRow(TableRowData r) =>
    TableRowData(id: r.id, pid: r.pid, clip: r.clip, cells: Map.of(r.cells));

TableData cloneTable(TableData t) => TableData(
      cols: [for (final c in t.cols) _copyCol(c)],
      rows: [for (final r in t.rows) _copyRow(r)],
    );

TableData _defaultTable() => TableData(
      cols: [TableColumn(id: newColId(), name: '标题')],
      rows: [],
    );

// —— 列操作 ——

/// 加一个文本列（默认名「文本」，UI 可改名）。首列「标题」之外的列都视同文本列。
TableData addColumn(TableData t, {String name = '文本'}) {
  final out = cloneTable(t);
  out.cols.add(TableColumn(id: newColId(), name: name));
  return out;
}

TableData renameColumn(TableData t, String colId, String name) {
  final out = cloneTable(t);
  final col = out.colById(colId);
  if (col == null) throw ArgumentError('列不存在：$colId');
  col.name = name;
  return out;
}

/// 删列：该列的所有单元格一并丢弃。至少保留一列（首列不可删时 UI 禁用）。
TableData deleteColumn(TableData t, String colId) {
  if (t.cols.length <= 1) {
    throw ArgumentError('至少保留一列');
  }
  final out = cloneTable(t);
  out.cols.removeWhere((c) => c.id == colId);
  if (out.cols.length == t.cols.length) throw ArgumentError('列不存在：$colId');
  for (final r in out.rows) {
    r.cells.remove(colId);
  }
  return out;
}

// —— 行操作 ——

TableData addRow(TableData t) {
  final out = cloneTable(t);
  out.rows.add(TableRowData(id: newRowId()));
  return out;
}

/// 建行并直接填 cells（colId → 值）；clip/pid 可选（④ 剪藏入库一次性物化用）。
TableData addRowFilled(
  TableData t, {
  Map<String, String> cells = const {},
  String? clip,
  String? pid,
}) {
  final out = cloneTable(t);
  out.rows.add(TableRowData(id: newRowId(), pid: pid, clip: clip, cells: Map.of(cells)));
  return out;
}

/// 按列名找列 id（没有则 null）。
String? colIdByName(TableData t, String name) {
  for (final c in t.cols) {
    if (c.name == name) return c.id;
  }
  return null;
}

TableData updateCell(TableData t, String rowId, String colId, String value) {
  final out = cloneTable(t);
  final row = out.rowById(rowId);
  if (row == null) throw ArgumentError('行不存在：$rowId');
  if (out.colById(colId) == null) throw ArgumentError('列不存在：$colId');
  row.cells[colId] = value;
  return out;
}

TableData deleteRow(TableData t, String rowId) {
  final out = cloneTable(t);
  final before = out.rows.length;
  out.rows.removeWhere((r) => r.id == rowId);
  if (out.rows.length == before) throw ArgumentError('行不存在：$rowId');
  return out;
}

/// 记录页物化（③）：行 ↔ 记录页绑定。
TableData setRowPid(TableData t, String rowId, String pid) {
  final out = cloneTable(t);
  final row = out.rowById(rowId);
  if (row == null) throw ArgumentError('行不存在：$rowId');
  row.pid = pid;
  return out;
}

// —— 序列化 ——

String encodeTable(TableData t) {
  return jsonEncode({
    'v': 1,
    'kind': 'table',
    'cols': [for (final c in t.cols) {'id': c.id, 'name': c.name}],
    'rows': [
      for (final r in t.rows)
        {
          'id': r.id,
          if (r.pid != null) 'pid': r.pid,
          if (r.clip != null) 'clip': r.clip,
          'cells': {
            // 空值不落盘，JSON 保持精瘦
            for (final e in r.cells.entries)
              if (e.value.isNotEmpty) e.key: e.value,
          },
        },
    ],
  });
}

/// 解码规则：空内容 → 默认表（一列「标题」）；结构不符或解析失败 → 默认表兜底
/// （表页面不会持有块正文——类型转换被 UI 限制在空页面，这里只防脏数据）。
TableData decodeTable(String content) {
  if (content.isEmpty) return _defaultTable();
  try {
    final map = jsonDecode(content);
    if (map is! Map<String, dynamic> || map['kind'] != 'table') {
      return _defaultTable();
    }
    final cols = <TableColumn>[
      for (final e in (map['cols'] as List? ?? const []))
        if (e is Map)
          TableColumn(
            id: (e['id'] as String?) ?? newColId(),
            name: (e['name'] as String?) ?? '',
          ),
    ];
    if (cols.isEmpty) cols.add(TableColumn(id: newColId(), name: '标题'));
    final rows = <TableRowData>[
      for (final e in (map['rows'] as List? ?? const []))
        if (e is Map)
          TableRowData(
            id: (e['id'] as String?) ?? newRowId(),
            pid: e['pid'] as String?,
            clip: e['clip'] as String?,
            cells: {
              for (final entry in ((e['cells'] as Map?) ?? const {}).entries)
                entry.key.toString(): entry.value?.toString() ?? '',
            },
          ),
    ];
    return TableData(cols: cols, rows: rows);
  } catch (_) {
    return _defaultTable();
  }
}

// —— 稳定 ID（列/行各自成体系，与块 ID 同风格）——

String newColId() => 'c${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}${_nextSeq()}';
String newRowId() => 'r${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}${_nextSeq()}';
int _seqN = 0;
String _nextSeq() {
  _seqN = (_seqN + 1) % 1296;
  return _seqN.toRadixString(36).padLeft(2, '0');
}
