// FlowUs 多维表的真实结构镜像（M4-T01）
//
// 全部按实测写，依据：
//   · `docs/基准/基准-多维表模型.md`（M0-T09）：库块 → `data.schema`；记录 = **页面块 type=0**，parentId 指向库块；
//     视图在 `data.collectionViews`，**配置全放 `format`**
//   · `docs/基准/基准-字段类型对照.md`（M0-T26）：字段 `type` 是**字符串**，18 种已实测（`person` / `updated_at` /
//     `updated_by` 与 Notion 的习惯**不一样**，靠猜必错）
//
// 三条不许混的界限（M0-T08 §6 反复强调）：
//   块 type = **数字**（库块 18/19、记录 0）；字段 type = **字符串**；视图 type = **字符串**。
//
// 设计取舍：
//   · 未知字段类型/未知视图类型一律保留原始字符串（`rawType`），不丢信息 —— M6 要搬历史数据
//   · 单元格值（`collectionProperties`）的内部结构 M0 还没采齐（M0-T18 摊到后续），所以**原样持有 map**，
//     不自造一套"值类型"，等采到真结构再收紧

import 'dart:convert';

/// 字段类型：接口字符串 ↔ 中文名（18 种实测 + 未实测的 `relation`）
enum FlowUsFieldType {
  unknown('unknown', '未知'),
  title('title', '标题'),
  text('text', '文本'),
  number('number', '数字'),
  checkbox('checkbox', '勾选框'),
  select('select', '单选'),
  multiSelect('multi_select', '多选'),
  date('date', '日期'),
  person('person', '人员'),
  file('file', '文件媒体'),
  url('url', '网址链接'),
  email('email', '邮箱'),
  phone('phone', '电话'),
  formula('formula', '公式'),
  relation('relation', '关联'),
  rollup('rollup', '汇总'),
  createdTime('created_at', '创建时间'),
  createdBy('created_by', '创建人'),
  updatedTime('updated_at', '编辑时间'),
  updatedBy('updated_by', '编辑人'),
  idNumber('id_number', '自动编号');

  const FlowUsFieldType(this.apiName, this.label);

  /// 接口里的字符串（存储也用这个）
  final String apiName;
  final String label;

  static FlowUsFieldType fromApi(String? apiName) {
    if (apiName == null) return unknown;
    for (final t in values) {
      if (t.apiName == apiName) return t;
    }
    return unknown;
  }

  /// 系统自动维护的字段（用户不能填）
  bool get isSystemField =>
      this == createdTime ||
      this == createdBy ||
      this == updatedTime ||
      this == updatedBy ||
      this == idNumber;
}

/// 视图类型：接口字符串 ↔ 中文名（空页类型选择器露出的 7 种）
enum FlowUsViewType {
  unknown('unknown', '未知'),
  table('table', '表格'),
  board('board', '看板'),
  gallery('gallery', '画廊'),
  list('list', '目录'),
  timeline('timeline', '时间轴'),
  calendar('calendar', '日历'),
  form('form', '收集表');

  const FlowUsViewType(this.apiName, this.label);

  final String apiName;
  final String label;

  static FlowUsViewType fromApi(String? apiName) {
    if (apiName == null) return unknown;
    for (final t in values) {
      if (t.apiName == apiName) return t;
    }
    return unknown;
  }
}

/// 一列的定义。实测形状：`{name, type, options?}`——**只有这三个键**（`options` 是数组）
class FlowUsFieldDefinition {
  FlowUsFieldDefinition({
    required this.id,
    required this.name,
    required this.rawType,
    this.options,
    Map<String, Object?>? extra,
  }) : extra = extra ?? <String, Object?>{};

  /// 字段 id（= `schema` 对象的键）
  final String id;
  String name;

  /// 原始字符串（`unknown` 时也不丢）
  final String rawType;

  /// 选项列表（`select` / `multi_select` 的可选项都在这里）
  final List<Object?>? options;

  /// 我们不认识的键，原样保留
  final Map<String, Object?> extra;

  FlowUsFieldType get type => FlowUsFieldType.fromApi(rawType);

  bool get isTitle => type == FlowUsFieldType.title;

  FlowUsFieldDefinition rename(String newName) => FlowUsFieldDefinition(
        id: id,
        name: newName,
        rawType: rawType,
        options: options,
        extra: extra,
      );

  Map<String, Object?> toJson() => {
        ...extra,
        'name': name,
        'type': rawType,
        if (options != null) 'options': options,
      };

  static FlowUsFieldDefinition fromJson(String id, Map<String, Object?> json) {
    const known = {'name', 'type', 'options'};
    final extra = <String, Object?>{};
    json.forEach((k, v) {
      if (!known.contains(k)) extra[k] = v;
    });
    return FlowUsFieldDefinition(
      id: id,
      name: (json['name'] as String?) ?? '',
      rawType: (json['type'] as String?) ?? FlowUsFieldType.unknown.apiName,
      options: (json['options'] as List?)?.toList(),
      extra: extra,
    );
  }
}

/// 一个视图。实测字段：uuid / type / title / format / collectionId / parentId / shareId / pageSort / …
/// **配置全在 `format`**（表格 `tableWrap`/`tableProperties`、看板 `boardGroups`…、通用 `filter`/`sorters`/`openPageWay`）
class FlowUsView {
  FlowUsView({
    required this.uuid,
    required this.rawType,
    this.title = '',
    Map<String, Object?>? format,
    Map<String, Object?>? extra,
    this.pageSort,
  })  : format = format ?? <String, Object?>{},
        extra = extra ?? <String, Object?>{};

  final String uuid;
  final String rawType;
  String title;
  final Map<String, Object?> format;
  final Map<String, Object?> extra;

  /// 记录排序规则（实测字段名 `pageSort`）
  List<Object?>? pageSort;

  FlowUsViewType get type => FlowUsViewType.fromApi(rawType);

  /// 通用筛选配置（实测键名 `filter`）
  Object? get filter => format['filter'];

  /// 通用排序配置（实测键名 `sorters`）
  Object? get sorters => format['sorters'];

  /// 打开记录的方式（实测键名 `openPageWay`）
  Object? get openPageWay => format['openPageWay'];

  Map<String, Object?> toJson() => {
        ...extra,
        'uuid': uuid,
        'type': rawType,
        'title': title,
        'format': format,
        if (pageSort != null) 'pageSort': pageSort,
      };

  static FlowUsView fromJson(Map<String, Object?> json) {
    const known = {'uuid', 'type', 'title', 'format', 'pageSort'};
    final extra = <String, Object?>{};
    json.forEach((k, v) {
      if (!known.contains(k)) extra[k] = v;
    });
    return FlowUsView(
      uuid: (json['uuid'] as String?) ?? '',
      rawType: (json['type'] as String?) ?? FlowUsViewType.unknown.apiName,
      title: (json['title'] as String?) ?? '',
      format: (json['format'] as Map?)?.cast<String, Object?>(),
      extra: extra,
      pageSort: (json['pageSort'] as List?)?.toList(),
    );
  }
}

/// 一条记录。**它就是页面块（type=0）**——不另造"行"实体，否则记录页/属性/正文都要重做。
class FlowUsRecord {
  FlowUsRecord({
    required this.uuid,
    this.parentId,
    Map<String, Object?>? cells,
    List<String>? subNodes,
  })  : cells = cells ?? <String, Object?>{},
        subNodes = subNodes ?? <String>[];

  /// 记录 = 页面块的 uuid
  final String uuid;

  /// 指向数据库块
  String? parentId;

  /// 该行各字段的值（实测键 `collectionProperties`）。内部结构未采齐 → 原样持有
  final Map<String, Object?> cells;

  /// 记录自己也是页面，可以带子页面（树上不显示，数据里有）
  final List<String> subNodes;

  /// 记录页正文/图标等由页面表负责，这里只管表格侧
  Map<String, Object?> toJson() => {
        'id': uuid,
        'parentId': parentId,
        'cells': cells,
        if (subNodes.isNotEmpty) 'subNodes': subNodes,
      };

  static FlowUsRecord fromJson(Map<String, Object?> json) => FlowUsRecord(
        uuid: (json['id'] as String?) ?? (json['uuid'] as String?) ?? '',
        parentId: json['parentId'] as String?,
        cells: (json['cells'] as Map?)?.cast<String, Object?>() ??
            (json['collectionProperties'] as Map?)?.cast<String, Object?>(),
        subNodes: [
          for (final s in (json['subNodes'] as List?) ?? const [])
            if (s is String) s,
        ],
      );
}

/// 一张多维表：字段（列）定义 + 记录 + 视图
class FlowUsCollection {
  FlowUsCollection({
    required this.id,
    List<FlowUsFieldDefinition>? fields,
    List<FlowUsRecord>? records,
    List<FlowUsView>? views,
  })  : fields = fields ?? <FlowUsFieldDefinition>[],
        records = records ?? <FlowUsRecord>[],
        views = views ?? <FlowUsView>[];

  /// 库块 uuid（= 承载它的页面块）
  final String id;

  /// 列定义，**顺序即展示顺序**（`schema` 是对象，键顺序就是列顺序）
  final List<FlowUsFieldDefinition> fields;
  final List<FlowUsRecord> records;
  final List<FlowUsView> views;

  /// 我们落库的版本号
  static const int storedVersion = 1;

  FlowUsFieldDefinition? fieldById(String fieldId) {
    for (final f in fields) {
      if (f.id == fieldId) return f;
    }
    return null;
  }

  FlowUsRecord? recordById(String recordId) {
    for (final r in records) {
      if (r.uuid == recordId) return r;
    }
    return null;
  }

  /// 标题列：有且只该有一列 `type=title`（每表必有）；没有就返回 null，不硬凑
  FlowUsFieldDefinition? get titleField {
    for (final f in fields) {
      if (f.isTitle) return f;
    }
    return null;
  }

  /// 默认视图：第一个表格视图；没有就第一个视图；都没有就 null
  FlowUsView? get defaultView {
    for (final v in views) {
      if (v.type == FlowUsViewType.table) return v;
    }
    return views.isEmpty ? null : views.first;
  }

  /// 从库块（type=18/19）+ 它下面的记录块还原。`recordBlocks` 是 parentId 指向该库的页面块。
  static FlowUsCollection fromBlocks(
    Map<String, Object?> collectionBlock,
    List<Map<String, Object?>> recordBlocks, {
    List<Map<String, Object?>> viewJsons = const [],
  }) {
    final id = (collectionBlock['uuid'] as String?) ?? '';
    final data = (collectionBlock['data'] as Map?)?.cast<String, Object?>();
    final schema = (data?['schema'] as Map?)?.cast<String, Object?>();

    final fields = <FlowUsFieldDefinition>[
      if (schema != null)
        for (final e in schema.entries)
          if (e.value is Map)
            FlowUsFieldDefinition.fromJson(e.key, (e.value as Map).cast<String, Object?>()),
    ];

    return FlowUsCollection(
      id: id,
      fields: fields,
      records: [
        for (final rb in recordBlocks)
          FlowUsRecord(
            uuid: (rb['uuid'] as String?) ?? '',
            parentId: (rb['parentId'] as String?) ?? id,
            cells: (() {
              final d = (rb['data'] as Map?)?.cast<String, Object?>();
              return (d?['collectionProperties'] as Map?)?.cast<String, Object?>();
            })(),
            subNodes: [
              for (final s in (rb['subNodes'] as List?) ?? const [])
                if (s is String) s,
            ],
          ),
      ],
      views: [for (final v in viewJsons) FlowUsView.fromJson(v)],
    );
  }

  String toStoredJson() => _encode({
        'v': storedVersion,
        'id': id,
        'schema': {
          for (final f in fields)
            f.id: {
              ...f.toJson(),
            },
        },
        'records': [for (final r in records) r.toJson()],
        'views': [for (final v in views) v.toJson()],
      });

  /// 我们落库的 content → 表（容错：坏数据不抛，返回空表并把原文放 [loadError]）
  static FlowUsCollection fromStoredJson(String content) {
    if (content.trim().isEmpty) return FlowUsCollection(id: '');
    try {
      final json = _decode(content);
      final schema = (json['schema'] as Map?)?.cast<String, Object?>();
      return FlowUsCollection(
        id: (json['id'] as String?) ?? '',
        fields: [
          if (schema != null)
            for (final e in schema.entries)
              if (e.value is Map)
                FlowUsFieldDefinition.fromJson(e.key, (e.value as Map).cast<String, Object?>()),
        ],
        records: [
          for (final r in (json['records'] as List?) ?? const [])
            if (r is Map) FlowUsRecord.fromJson(r.cast<String, Object?>()),
        ],
        views: [
          for (final v in (json['views'] as List?) ?? const [])
            if (v is Map) FlowUsView.fromJson(v.cast<String, Object?>()),
        ],
      );
    } catch (_) {
      return FlowUsCollection(id: '');
    }
  }

  static bool looksLikeTable(String content) {
    final t = content.trimLeft();
    return t.startsWith('{"v":1,"id"') || t.contains('"schema"');
  }
}

String _encode(Map<String, Object?> m) => jsonEncode(m);

Map<String, Object?> _decode(String s) {
  final v = jsonDecode(s);
  return v is Map ? v.cast<String, Object?>() : <String, Object?>{};
}
