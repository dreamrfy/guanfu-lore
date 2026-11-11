// 多维表引擎：列操作 / 单元格编辑 / 筛选 / 排序（M4-T04~T11 的**逻辑层**）
//
// 为什么要单独一层：UI（列头菜单、筛选器面板）只是壳，
// 真正要保证的是"**改完真的落库、筛选排序真的生效**"——这层是纯函数，好测。
//
// ⚠️ 三条硬约束：
//   1. **改字段类型不默默丢数据**（M4-T11）：单选(有选项值) → 数字 这类不可逆转换，
//      必须先报出"会丢什么"，由用户确认后才执行（依据需求文档 M0-T26 的警告）。
//   2. **筛选条件是"多条件 AND + 一组 OR"**（M4-T09，用户明选：
//      「日常就要『未读 + 某个公众号 + 本周』这种组合筛选」）。
//   3. **筛选/排序配置存在视图里**（`format.filter` / `format.sorters`），重开还在。

import 'flowus_table.dart';
import 'locale_sort.dart';

/// 一个筛选条件
class FlowUsFilterCondition {
  const FlowUsFilterCondition({
    required this.fieldId,
    required this.operator,
    this.value,
  });

  /// 字段 id
  final String fieldId;

  /// 运算符（见 [FlowUsFilterOperator]）
  final FlowUsFilterOperator operator;

  /// 比较值：单选/多选/勾选框是选项名或 bool；日期是毫秒时间戳；文本是字符串
  final Object? value;

  FlowUsFilterCondition copyWith({
    String? fieldId,
    FlowUsFilterOperator? operator,
    Object? value,
  }) =>
      FlowUsFilterCondition(
        fieldId: fieldId ?? this.fieldId,
        operator: operator ?? this.operator,
        value: value ?? this.value,
      );

  Map<String, Object?> toJson() => {
        'fieldId': fieldId,
        'operator': operator.apiName,
        if (value != null) 'value': value,
      };

  static FlowUsFilterCondition fromJson(Map<String, Object?> json) => FlowUsFilterCondition(
        fieldId: (json['fieldId'] as String?) ?? '',
        operator: FlowUsFilterOperator.fromApi(json['operator'] as String?),
        value: json['value'],
      );
}

/// 筛选运算符
enum FlowUsFilterOperator {
  equals('is', '是'),
  notEquals('is_not', '不是'),
  contains('contains', '包含'),
  notContains('not_contains', '不包含'),
  greaterThan('gt', '大于'),
  lessThan('lt', '小于'),
  isEmpty('is_empty', '为空'),
  isNotEmpty('is_not_empty', '不为空');

  const FlowUsFilterOperator(this.apiName, this.label);
  final String apiName;
  final String label;

  static FlowUsFilterOperator fromApi(String? s) {
    if (s == null) return equals;
    for (final o in values) {
      if (o.apiName == s) return o;
    }
    return equals;
  }
}

/// 一组筛选条件：**组内 AND**。多组之间是 OR（用户要「未读 + 某公众号 + 本周」= 一组 AND）
class FlowUsFilterGroup {
  const FlowUsFilterGroup(this.conditions);

  final List<FlowUsFilterCondition> conditions;

  bool get isEmpty => conditions.isEmpty;

  Map<String, Object?> toJson() => {
        'conditions': [for (final c in conditions) c.toJson()],
      };

  static FlowUsFilterGroup fromJson(Map<String, Object?> json) => FlowUsFilterGroup([
        for (final c in (json['conditions'] as List?) ?? const [])
          if (c is Map) FlowUsFilterCondition.fromJson(c.cast<String, Object?>()),
      ]);
}

/// 排序规则
class FlowUsSorter {
  const FlowUsSorter({required this.fieldId, this.descending = false});

  final String fieldId;
  final bool descending;

  Map<String, Object?> toJson() => {'fieldId': fieldId, 'descending': descending};

  static FlowUsSorter fromJson(Map<String, Object?> json) => FlowUsSorter(
        fieldId: (json['fieldId'] as String?) ?? '',
        descending: json['descending'] == true,
      );
}

/// 改字段类型的**影响评估**（M4-T11）
class FlowUsTypeChangeImpact {
  const FlowUsTypeChangeImpact({
    required this.safe,
    required this.lostValues,
    required this.note,
  });

  /// true = 可无损转换；false = 需要用户确认
  final bool safe;

  /// 会丢失/需要人工处理的单元格值（人可读描述）
  final List<String> lostValues;

  final String note;

  static const FlowUsTypeChangeImpact safeChange = FlowUsTypeChangeImpact(
    safe: true,
    lostValues: [],
    note: '',
  );
}

/// 引擎：所有对 [FlowUsCollection] 的改动都在这里做，UI 只负责调用 + 提示
abstract final class FlowUsTableEngine {
  // ---------------------------------------------------------------- 列操作

  /// 加一列。类型默认文本；标题列只能有一个，所以新列不会是 title。
  static FlowUsCollection addColumn(
    FlowUsCollection c, {
    required String name,
    FlowUsFieldType type = FlowUsFieldType.text,
    String? id,
    List<Object?>? options,
  }) {
    final fieldId = id ?? _newFieldId(c);
    return FlowUsCollection(
      id: c.id,
      fields: [
        ...c.fields,
        FlowUsFieldDefinition(
          id: fieldId,
          name: name,
          rawType: type.apiName,
          options: options,
        ),
      ],
      records: c.records,
      views: c.views,
    );
  }

  /// 改列名
  static FlowUsCollection renameColumn(FlowUsCollection c, String fieldId, String newName) {
    return FlowUsCollection(
      id: c.id,
      fields: [
        for (final f in c.fields)
          if (f.id == fieldId) f.rename(newName) else f,
      ],
      records: c.records,
      views: c.views,
    );
  }

  /// 删列（连同该列的单元格值一起删）
  static FlowUsCollection deleteColumn(FlowUsCollection c, String fieldId) {
    return FlowUsCollection(
      id: c.id,
      fields: [for (final f in c.fields) if (f.id != fieldId) f],
      records: [
        for (final r in c.records)
          FlowUsRecord(
            uuid: r.uuid,
            parentId: r.parentId,
            cells: {...r.cells}..remove(fieldId),
            subNodes: r.subNodes,
          ),
      ],
      views: c.views,
    );
  }

  /// 拖列序：把 fieldId 挪到 targetIndex
  static FlowUsCollection reorderColumn(FlowUsCollection c, String fieldId, int targetIndex) {
    final fields = [...c.fields];
    final from = fields.indexWhere((f) => f.id == fieldId);
    if (from < 0) return c;
    final f = fields.removeAt(from);
    final to = targetIndex.clamp(0, fields.length);
    fields.insert(to, f);
    return FlowUsCollection(id: c.id, fields: fields, records: c.records, views: c.views);
  }

  /// 改字段类型。**先评估影响**（[assessTypeChange]），确认后才调这个。
  static FlowUsCollection changeColumnType(
    FlowUsCollection c,
    String fieldId,
    FlowUsFieldType newType,
  ) {
    final fields = [
      for (final f in c.fields)
        if (f.id == fieldId)
          FlowUsFieldDefinition(
            id: f.id,
            name: f.name,
            rawType: newType.apiName,
            options: f.options,
            extra: f.extra,
          )
        else
          f,
    ];
    return FlowUsCollection(id: c.id, fields: fields, records: c.records, views: c.views);
  }

  /// 评估"改字段类型"会丢什么（M4-T11 —— 不默默丢数据）
  static FlowUsTypeChangeImpact assessTypeChange(
    FlowUsCollection c,
    String fieldId,
    FlowUsFieldType newType,
  ) {
    final field = c.fieldById(fieldId);
    if (field == null) {
      return const FlowUsTypeChangeImpact(safe: false, lostValues: [], note: '找不到这一列');
    }
    final oldType = field.type;
    if (oldType == newType) return FlowUsTypeChangeImpact.safeChange;

    // 文本类之间互转：值都是字符串，无损
    bool textLike(FlowUsFieldType t) =>
        t == FlowUsFieldType.text || t == FlowUsFieldType.title || t == FlowUsFieldType.url;
    if (textLike(oldType) && textLike(newType)) return FlowUsTypeChangeImpact.safeChange;

    // 单选/多选 → 文本：只是把选项结构拍平成字符串，**信息还在**（可逆）
    if ((oldType == FlowUsFieldType.select || oldType == FlowUsFieldType.multiSelect) &&
        textLike(newType)) {
      return const FlowUsTypeChangeImpact(
        safe: true,
        lostValues: [],
        note: '选项会变成纯文本（仍可读回）',
      );
    }

    // 勾选框 → 文本：true/false 变字符串，无损
    if (oldType == FlowUsFieldType.checkbox && textLike(newType)) {
      return const FlowUsTypeChangeImpact(safe: true, lostValues: [], note: '');
    }

    // 文本 → 单选/多选：文本不再是合法选项 → **丢值**
    if (textLike(oldType) &&
        (newType == FlowUsFieldType.select || newType == FlowUsFieldType.multiSelect)) {
      final lost = <String>[];
      for (final r in c.records) {
        final v = r.cells[fieldId];
        if (v is String && v.trim().isNotEmpty) lost.add(v);
        if (v is List) {
          for (final e in v) {
            if (e is String && e.trim().isNotEmpty) lost.add(e);
          }
        }
      }
      return FlowUsTypeChangeImpact(
        safe: false,
        lostValues: lost,
        note: '改成${newType.label}后，这些文本不再是合法选项：${lost.join('、')}'
            '${lost.length > 8 ? ' 等 ${lost.length} 项' : ''}',
      );
    }

    // 单选/多选 → 数字/日期等：**丢选项值**（需求文档 M0-T26 明确警告过）
    if (oldType == FlowUsFieldType.select || oldType == FlowUsFieldType.multiSelect) {
      final lost = <String>[];
      for (final r in c.records) {
        final v = r.cells[fieldId];
        if (v is String && v.trim().isNotEmpty) lost.add(v);
        if (v is List) {
          for (final e in v) {
            if (e is String && e.trim().isNotEmpty) lost.add(e);
          }
        }
      }
      return FlowUsTypeChangeImpact(
        safe: false,
        lostValues: lost,
        note: '改成${newType.label}会丢掉选项值（不可逆）：${lost.join('、')}'
            '${lost.length > 8 ? ' 等 ${lost.length} 项' : ''}',
      );
    }

    // 数字 → 文本：变成字符串，无损
    if (oldType == FlowUsFieldType.number && textLike(newType)) {
      return const FlowUsTypeChangeImpact(safe: true, lostValues: [], note: '');
    }

    // 兜底：有值就提示可能有损
    final hasValues = c.records.any((r) => r.cells.containsKey(fieldId) && r.cells[fieldId] != null);
    return FlowUsTypeChangeImpact(
      safe: !hasValues,
      lostValues: const [],
      note: hasValues ? '这一列已有值，改类型可能无法转换' : '',
    );
  }

  // ---------------------------------------------------------------- 行操作

  /// 加一行
  static FlowUsCollection addRow(FlowUsCollection c, {String? recordId}) {
    return FlowUsCollection(
      id: c.id,
      fields: c.fields,
      records: [
        ...c.records,
        FlowUsRecord(uuid: recordId ?? _newRecordId(c), parentId: c.id),
      ],
      views: c.views,
    );
  }

  /// 删一行
  static FlowUsCollection deleteRow(FlowUsCollection c, String recordId) {
    return FlowUsCollection(
      id: c.id,
      fields: c.fields,
      records: [for (final r in c.records) if (r.uuid != recordId) r],
      views: c.views,
    );
  }

  /// 写一个单元格的值
  static FlowUsCollection setCell(
    FlowUsCollection c,
    String recordId,
    String fieldId,
    Object? value,
  ) {
    return FlowUsCollection(
      id: c.id,
      fields: c.fields,
      records: [
        for (final r in c.records)
          if (r.uuid == recordId)
            FlowUsRecord(
              uuid: r.uuid,
              parentId: r.parentId,
              cells: {...r.cells, fieldId: value},
              subNodes: r.subNodes,
            )
          else
            r,
      ],
      views: c.views,
    );
  }

  // ---------------------------------------------------------------- 筛选排序

  /// 按筛选组过滤记录（组内 AND，组间 OR）
  static List<FlowUsRecord> applyFilters(
    FlowUsCollection c,
    List<FlowUsFilterGroup> groups,
  ) {
    if (groups.isEmpty) return c.records;
    final active = groups.where((g) => !g.isEmpty).toList();
    if (active.isEmpty) return c.records;
    return [
      for (final r in c.records)
        if (active.any((g) => _matchGroup(c, r, g))) r,
    ];
  }

  static bool _matchGroup(
    FlowUsCollection c,
    FlowUsRecord r,
    FlowUsFilterGroup group,
  ) {
    for (final cond in group.conditions) {
      if (!_matchOne(c, r, cond)) return false;
    }
    return true;
  }

  static bool _matchOne(
    FlowUsCollection c,
    FlowUsRecord r,
    FlowUsFilterCondition cond,
  ) {
    final field = c.fieldById(cond.fieldId);
    if (field == null) return true; // 字段被删了 → 条件失效，不筛掉行
    final raw = r.cells[cond.fieldId];

    switch (cond.operator) {
      case FlowUsFilterOperator.isEmpty:
        return raw == null || raw == '' || (raw is List && raw.isEmpty);
      case FlowUsFilterOperator.isNotEmpty:
        return !(raw == null || raw == '' || (raw is List && raw.isEmpty));
      case FlowUsFilterOperator.equals:
        return _equals(raw, cond.value);
      case FlowUsFilterOperator.notEquals:
        return !_equals(raw, cond.value);
      case FlowUsFilterOperator.contains:
        return _contains(raw, cond.value);
      case FlowUsFilterOperator.notContains:
        return !_contains(raw, cond.value);
      case FlowUsFilterOperator.greaterThan:
        return _compare(raw, cond.value) > 0;
      case FlowUsFilterOperator.lessThan:
        return _compare(raw, cond.value) < 0;
    }
  }

  static bool _equals(Object? raw, Object? value) {
    if (raw == null) return value == null;
    if (raw is bool) return raw == value;
    if (raw is num && value is num) return raw == value;
    if (raw is List) {
      return raw.any((e) => _scalarEquals(e, value));
    }
    return _scalarEquals(raw, value);
  }

  static bool _scalarEquals(Object? a, Object? b) {
    if (a == null || b == null) return a == b;
    if (a is num && b is num) return a == b;
    if (a is num && b is String) return a.toString() == b;
    return '$a' == '$b';
  }

  static bool _contains(Object? raw, Object? value) {
    if (raw == null) return false;
    if (raw is List) return raw.any((e) => _scalarEquals(e, value));
    return '$raw'.toLowerCase().contains('$value'.toLowerCase());
  }

  /// 比较：数字按数值比，日期按时间戳比，其它按**本地化**顺序比
  static int _compare(Object? a, Object? b) {
    if (a is num && b is num) return a.compareTo(b);
    final da = _asDate(a);
    final db = _asDate(b);
    if (da != null && db != null) return da.compareTo(db);
    // ⚠️ 中文按 Unicode 码位排对用户没意义（"磷"会排在"正"前面）→ 用本地化排序
    //    （Windows 走 StrCmpLogicalW：中文按拼音、数字按数值）
    return compareLocalized('$a', '$b');
  }

  static DateTime? _asDate(Object? v) {
    if (v is num) return DateTime.fromMillisecondsSinceEpoch(v.toInt());
    if (v is String) {
      final n = int.tryParse(v);
      if (n != null) return DateTime.fromMillisecondsSinceEpoch(n);
      return DateTime.tryParse(v);
    }
    return null;
  }

  /// 按排序规则排序（稳定）
  static List<FlowUsRecord> applySorters(
    FlowUsCollection c,
    List<FlowUsSorter> sorters,
  ) {
    if (sorters.isEmpty) return c.records;
    final out = [...c.records];
    out.sort((a, b) {
      for (final s in sorters) {
        final cmp = _compare(a.cells[s.fieldId], b.cells[s.fieldId]);
        if (cmp != 0) return s.descending ? -cmp : cmp;
      }
      return 0;
    });
    return out;
  }

  // ---------------------------------------------------------------- 视图配置

  /// 把筛选/排序写进视图的 `format`（真 FlowUs 的键名：`filter` / `sorters`）
  static FlowUsCollection writeViewConfig(
    FlowUsCollection c,
    String viewUuid, {
    List<FlowUsFilterGroup>? filters,
    List<FlowUsSorter>? sorters,
  }) {
    return FlowUsCollection(
      id: c.id,
      fields: c.fields,
      records: c.records,
      views: [
        for (final v in c.views)
          if (v.uuid == viewUuid)
            FlowUsView(
              uuid: v.uuid,
              rawType: v.rawType,
              title: v.title,
              format: {
                ...v.format,
                if (filters != null)
                  'filter': {
                    'groups': [for (final g in filters) g.toJson()],
                  },
                if (sorters != null) 'sorters': [for (final s in sorters) s.toJson()],
              },
              extra: v.extra,
              pageSort: v.pageSort,
            )
          else
            v,
      ],
    );
  }

  /// 从视图里读回筛选/排序
  static List<FlowUsFilterGroup> readFilters(FlowUsView view) {
    final f = view.filter;
    if (f is! Map) return const [];
    final groups = f['groups'];
    if (groups is! List) return const [];
    return [
      for (final g in groups)
        if (g is Map) FlowUsFilterGroup.fromJson(g.cast<String, Object?>()),
    ];
  }

  static List<FlowUsSorter> readSorters(FlowUsView view) {
    final s = view.sorters;
    if (s is! List) return const [];
    return [
      for (final e in s)
        if (e is Map) FlowUsSorter.fromJson(e.cast<String, Object?>()),
    ];
  }

  // ---------------------------------------------------------------- id

  static String _newFieldId(FlowUsCollection c) {
    var i = 1;
    final used = {for (final f in c.fields) f.id};
    while (used.contains('fld$i')) {
      i++;
    }
    return 'fld$i';
  }

  static String _newRecordId(FlowUsCollection c) {
    var i = 1;
    final used = {for (final r in c.records) r.uuid};
    while (used.contains('rec$i')) {
      i++;
    }
    return 'rec$i';
  }
}
