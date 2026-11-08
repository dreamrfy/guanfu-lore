import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/table/table_model.dart';

void main() {
  TableData sample() {
    final t = decodeTable('');
    final withCol = addColumn(t, name: '来源');
    final withRow = addRow(withCol);
    return updateCell(withRow, withRow.rows.last.id, withCol.cols.last.id, '公众号');
  }

  test('decode 空内容 → 默认表：一列「标题」、零行', () {
    final t = decodeTable('');
    expect(t.cols, hasLength(1));
    expect(t.cols.first.name, '标题');
    expect(t.rows, isEmpty);
  });

  test('encode→decode 往返：列、行、单元格、pid 全部保真', () {
    final t = sample();
    final row = t.rows.last;
    final withPid = setRowPid(t, row.id, 'PAGE123');
    final round = decodeTable(encodeTable(withPid));
    expect(round.cols.map((c) => c.name), ['标题', '来源']);
    expect(round.cols.map((c) => c.id), t.cols.map((c) => c.id), reason: '列 id 稳定');
    expect(round.rows, hasLength(1));
    expect(round.rows.first.id, row.id);
    expect(round.rows.first.pid, 'PAGE123');
    expect(round.rows.first.cells[row.id == '' ? '' : t.cols.last.id], '公众号');
  });

  test('纯函数性：addColumn 等操作不改入参', () {
    final t = sample();
    final beforeCols = t.cols.length;
    final beforeRows = t.rows.length;
    addColumn(t);
    addRow(t);
    updateCell(t, t.rows.first.id, t.cols.first.id, '改动');
    deleteRow(t, t.rows.first.id);
    expect(t.cols.length, beforeCols);
    expect(t.rows.length, beforeRows);
    expect(t.rows.first.cells[t.cols.first.id] ?? '', isNot('改动'));
  });

  test('列操作：加/改名/删，删列连带清单元格，最后一列拒绝删', () {
    final t = sample();
    final colId = t.cols.last.id;
    expect(t.rows.first.cells[colId], '公众号');

    final renamed = renameColumn(t, colId, '渠道');
    expect(renamed.colById(colId)!.name, '渠道');

    final deleted = deleteColumn(renamed, colId);
    expect(deleted.cols, hasLength(1));
    expect(deleted.rows.first.cells.containsKey(colId), isFalse,
        reason: '删列应连带丢弃该列单元格');

    expect(() => deleteColumn(deleted, deleted.cols.first.id), throwsArgumentError);
    expect(() => renameColumn(t, 'c_nope', 'x'), throwsArgumentError);
  });

  test('行操作：加/改格/删，未知行列拒绝', () {
    final t = sample();
    final rowId = t.rows.first.id;
    final colId = t.cols.first.id;

    final updated = updateCell(t, rowId, colId, '我的文章');
    expect(updated.rows.first.cells[colId], '我的文章');

    final added = addRow(updated);
    expect(added.rows, hasLength(2));
    expect(added.rows.last.cells[colId] ?? '', '', reason: '新行单元格为空');

    final deleted = deleteRow(added, rowId);
    expect(deleted.rows, hasLength(1));

    expect(() => updateCell(t, 'r_nope', colId, 'x'), throwsArgumentError);
    expect(() => updateCell(t, rowId, 'c_nope', 'x'), throwsArgumentError);
    expect(() => deleteRow(t, 'r_nope'), throwsArgumentError);
    expect(() => setRowPid(t, 'r_nope', 'p'), throwsArgumentError);
  });

  test('空单元格不落盘：encode 后 cells 里没有空串键', () {
    final t = addRow(sample());
    final json = encodeTable(t);
    expect(json.contains('""'), isFalse, reason: '空串值不应出现在 JSON 里：$json');
  });

  test('脏数据兜底：块正文/坏 JSON/结构不符 → 默认表，不抛异常', () {
    final asBlocks = '{"v":1,"b":[{"t":"p","x":"正文","i":"b1"}]}';
    for (final bad in <String>[asBlocks, 'not-json-at-all', '{"v":1}', '[]']) {
      final t = decodeTable(bad);
      expect(t.cols, hasLength(1), reason: '坏内容应兜底为默认表：$bad');
      expect(t.cols.first.name, '标题');
    }
  });

  test('行 id 稳定：decode 缺 id 的行会补新 id 而不是崩溃', () {
    final t = decodeTable(
        '{"v":1,"kind":"table","cols":[{"id":"c1","name":"标题"}],"rows":[{"cells":{"c1":"a"}}]}');
    expect(t.rows, hasLength(1));
    expect(t.rows.first.id, startsWith('r'));
    expect(t.rows.first.cells['c1'], 'a');
  });
}
