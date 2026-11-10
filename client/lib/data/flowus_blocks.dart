// FlowUs 真实块模型的 Dart 侧镜像（M2-T01）
//
// 数值与键名**全部来自实测**，不是设计：
//   · 块类型是**数字**，字段类型/视图类型才是字符串 —— `docs/基准/基准-文档模型.md` §3/§6
//   · 块表是「以 uuid 为键的对象」，父子关系靠 `parentId` + `subNodes`（不是嵌套数组）
//   · 正文是 `data.segments` 数组，元素 `{text, type, enhancer}`，行内样式在 `enhancer`
//   · 真实顶层键集（M0-T08 `doc-api-schema.json` 实测）：
//     backgroundColor / createdAt / createdBy / data / discussions / isTemplate / moved /
//     parentId / permissions / spaceId / status / subNodes / templatePages / textColor / title / type / updatedAt
//   · 页面块 `data` 实测键：description / format / pageFixedWidth / segments（+ icon / cover / coverPos）
//   · `enhancer` 实测键：bold / code / italic / lineThrough / underline
//   · `format` 实测键：commentAlignment / fontFormat / pageLayout
//
// 设计取舍：**未知键一律原样保留**（`extra` / `data` 直接持有原始 map）。
// 理由：M6 要搬用户的历史数据，模型少认一个键就会丢一种样式；留着比补回来便宜。

import 'dart:convert';

/// 已确认的块类型（数字码 → 中文名），出处 `docs/基准/基准-块类型总表.md` §1。
///
/// 只收**实测确认**的 15 个码。其余数字（如 MindMap、按钮、同步块）造不出来也采不到，
/// 一律落到 [unknown]，但 [FlowUsBlock.rawType] 会保留原始数字，导入时不丢信息。
enum FlowUsBlockType {
  unknown(-1, '未知'),
  page(0, '页面'),
  paragraph(1, '段落'),
  todo(3, '待办列表'),
  bulletedList(4, '项目符号列表'),
  numberedList(5, '编号列表'),
  toggleList(6, '折叠列表'),
  heading(7, '标题'),
  divider(9, '分割线'),
  quote(12, '引述文字'),
  folder(15, '文件夹'),
  collection(18, '多维表'),
  collectionView(19, '多维表视图／记录页'),
  codeBlock(25, '代码块'),
  simpleTable(27, '简单表格'),
  tableCell(28, '表格单元格'),
  toggleHeading(38, '折叠标题');

  const FlowUsBlockType(this.code, this.label);

  /// 真实接口里的 `type` 数字（-1 表示我们还不认识）
  final int code;

  /// 中文名（用于调试与界面文案，不作为存储值）
  final String label;

  static FlowUsBlockType fromCode(int code) {
    for (final t in values) {
      if (t.code == code) return t;
    }
    return unknown;
  }
}

/// 行内文本段：`{text, type, enhancer}`
class FlowUsSegment {
  FlowUsSegment({required this.text, this.type = 0, Map<String, Object?>? enhancer})
      : enhancer = enhancer ?? <String, Object?>{};

  final String text;

  /// 段类型（数字）。各值含义**尚未实测定名**（M0-T08 §4 列为待采），先原样保存。
  final int type;

  /// 行内样式：实测出现 bold / code / italic / lineThrough / underline；其余键原样保留。
  final Map<String, Object?> enhancer;

  bool get isEmpty => text.isEmpty;

  bool get hasStyle => enhancer.values.any((v) => v == true);

  Map<String, Object?> toJson() => {
        'text': text,
        'type': type,
        'enhancer': enhancer,
      };

  static FlowUsSegment fromJson(Map<String, Object?> json) => FlowUsSegment(
        text: (json['text'] as String?) ?? '',
        type: (json['type'] as num?)?.toInt() ?? 0,
        enhancer: (json['enhancer'] as Map?)?.cast<String, Object?>(),
      );

  /// 纯文本段（我们新建的块用）
  static FlowUsSegment plain(String text) => FlowUsSegment(text: text);
}

/// 一个块。字段与真实接口一一对应，未知顶层键进 [extra]。
class FlowUsBlock {
  FlowUsBlock({
    required this.uuid,
    required this.rawType,
    this.parentId,
    List<String>? subNodes,
    this.title = '',
    Map<String, Object?>? data,
    Map<String, Object?>? extra,
  })  : subNodes = subNodes ?? <String>[],
        data = data ?? <String, Object?>{},
        extra = extra ?? <String, Object?>{};

  /// 块 id（也是 `blocks` 对象的键）
  final String uuid;

  /// 原始数字类型（保留未知值，导入不丢）
  final int rawType;

  String? parentId;

  /// 子块 id 列表，**顺序即渲染顺序**
  final List<String> subNodes;

  final String title;

  /// 块内容（segments / format / level / schema / icon / cover …）原样持有
  final Map<String, Object?> data;

  /// 我们不认识的顶层键，原样保留
  final Map<String, Object?> extra;

  FlowUsBlockType get type => FlowUsBlockType.fromCode(rawType);

  /// 标题级别（type=7/38 才有，实测 `data.level` 1–4）
  int? get headingLevel => (data['level'] as num?)?.toInt();

  List<FlowUsSegment> get segments {
    final raw = data['segments'];
    if (raw is! List) return const [];
    return [
      for (final e in raw)
        if (e is Map) FlowUsSegment.fromJson(e.cast<String, Object?>()),
    ];
  }

  /// 块的纯文本（调试 / 占位判断用）
  String get plainText => segments.map((s) => s.text).join();

  bool get isEmptyText => plainText.trim().isEmpty;

  Map<String, Object?> toJson() => {
        ...extra,
        'uuid': uuid,
        'type': rawType,
        'parentId': parentId,
        'subNodes': subNodes,
        'title': title,
        'data': data,
      };

  static FlowUsBlock fromJson(Map<String, Object?> json) {
    const known = {'uuid', 'parentId', 'subNodes', 'title', 'data'};
    final extra = <String, Object?>{};
    json.forEach((k, v) {
      if (!known.contains(k) && k != 'type') extra[k] = v;
    });
    return FlowUsBlock(
      uuid: (json['uuid'] as String?) ?? '',
      rawType: (json['type'] as num?)?.toInt() ?? FlowUsBlockType.unknown.code,
      parentId: json['parentId'] as String?,
      subNodes: [
        for (final s in (json['subNodes'] as List?) ?? const [])
          if (s is String) s,
      ],
      title: (json['title'] as String?) ?? '',
      data: (json['data'] as Map?)?.cast<String, Object?>(),
      extra: extra,
    );
  }
}

/// 一篇文档：以 uuid 为键的块表 + 根块 id。
class FlowUsDocument {
  FlowUsDocument({required this.rootId, Map<String, FlowUsBlock>? blocks})
      : blocks = blocks ?? <String, FlowUsBlock>{};

  /// 根块（type=0 页面块）
  String rootId;
  final Map<String, FlowUsBlock> blocks;

  FlowUsBlock? get root => blocks[rootId];

  /// 存储格式版本：我们落库的 content 列用 2（1 = 旧的 `{v:1,b:[…]}`）
  static const int storedVersion = 2;

  /// 真实接口响应 `{code, data:{blocks:{…}}}` → 文档
  static FlowUsDocument fromApiResponse(Map<String, Object?> json) {
    final data = json['data'];
    if (data is! Map) return FlowUsDocument(rootId: '');
    final rawBlocks = data['blocks'];
    if (rawBlocks is! Map) return FlowUsDocument(rootId: '');
    final doc = FlowUsDocument(rootId: '');
    rawBlocks.forEach((k, v) {
      if (v is Map) {
        final b = FlowUsBlock.fromJson(v.cast<String, Object?>());
        doc.blocks[(b.uuid.isEmpty ? '$k' : b.uuid)] = b;
      }
    });
    // 根块 = parentId 为空（或指向不存在的块）的那个页面块
    for (final b in doc.blocks.values) {
      if (b.type == FlowUsBlockType.page && (b.parentId == null || !doc.blocks.containsKey(b.parentId))) {
        doc.rootId = b.uuid;
        break;
      }
    }
    return doc;
  }

  /// 我们的 content 列里 `v` 的值（不是 JSON 对象 / 解析失败 → 0）
  static int storedVersionOf(String content) {
    try {
      final map = jsonDecode(content);
      if (map is Map) return (map['v'] as num?)?.toInt() ?? 0;
    } catch (_) {
      // 纯文本 / 半截 JSON：当旧格式处理
    }
    return 0;
  }

  /// 我们落库的 content → 文档（v2 专用；旧 v1 请用 [fromLegacyContent]）
  static FlowUsDocument fromStoredJson(String content) {
    if (content.isEmpty) return FlowUsDocument(rootId: '');
    final map = jsonDecode(content);
    if (map is! Map) return FlowUsDocument(rootId: '');
    final json = map.cast<String, Object?>();
    final blocksRaw = json['blocks'];
    final doc = FlowUsDocument(rootId: (json['root'] as String?) ?? '');
    if (blocksRaw is Map) {
      blocksRaw.forEach((k, v) {
        if (v is Map) doc.blocks['$k'] = FlowUsBlock.fromJson(v.cast<String, Object?>());
      });
    }
    return doc;
  }

  String toStoredJson() => jsonEncode({
        'v': storedVersion,
        'root': rootId,
        'blocks': {for (final e in blocks.entries) e.key: e.value.toJson()},
      });

  /// 某父块下的子块（按 `subNodes` 顺序）
  List<FlowUsBlock> childrenOf(String parentUuid) {
    final parent = blocks[parentUuid];
    if (parent == null) return const [];
    return [
      for (final id in parent.subNodes)
        if (blocks[id] != null) blocks[id]!,
    ];
  }

  /// 根开始的深度优先顺序（含层级）
  List<({FlowUsBlock block, int depth})> flatten() {
    final out = <({FlowUsBlock block, int depth})>[];
    void walk(String id, int depth) {
      final b = blocks[id];
      if (b == null) return;
      out.add((block: b, depth: depth));
      for (final child in b.subNodes) {
        walk(child, depth + 1);
      }
    }

    if (rootId.isNotEmpty) walk(rootId, 0);
    return out;
  }

  /// 追加一个块到父块末尾（并写回 parentId）
  void appendChild(String parentUuid, FlowUsBlock block) {
    block.parentId = parentUuid;
    blocks[block.uuid] = block;
    blocks[parentUuid]?.subNodes.add(block.uuid);
  }

  // ---------------------------------------------------------------------------
  // 旧格式（我们自己 V2.1 的 content 列）：`{"v":1,"b":[{"t":"p","x":"…","i":"id"}]}`
  // ---------------------------------------------------------------------------

  /// 旧格式的字符串类型 → FlowUs 数字码（只涉及旧格式出现过的那 6 种）
  static const Map<String, int> legacyTypeCodes = {
    'p': 1, // 段落
    'h1': 7, // 标题（level 1）
    'quote': 12, // 引述文字
    'todo': 3, // 待办
    'bullet': 4, // 项目符号
    'divider': 9, // 分割线
  };

  static bool looksLikeLegacyV1(String content) {
    final t = content.trimLeft();
    return t.startsWith('{"v":1') || t.startsWith('{\n "v": 1') || (t.startsWith('{') && t.contains('"b":'));
  }

  /// 旧格式 → 本文档模型。`pageId` 用作根块 uuid（= 页面 id，和 FlowUs 一致）。
  ///
  /// ⚠️ 待办勾选状态：真实 FlowUs 把它存在哪个键**尚未实测**（M0 没采到），
  /// 这里先写 `data.checked`，等 M4/M6 采到真键名再迁移；不会静默丢——它就在 data 里。
  static FlowUsDocument fromLegacyContent(String content, {required String pageId}) {
    final doc = FlowUsDocument(rootId: pageId);
    doc.blocks[pageId] = FlowUsBlock(
      uuid: pageId,
      rawType: FlowUsBlockType.page.code,
      parentId: null,
      data: {
        'segments': <Object?>[],
        'pageFixedWidth': false,
      },
    );
    if (content.isEmpty) return doc;

    List<Map<String, Object?>> legacy;
    try {
      if (looksLikeLegacyV1(content)) {
        final json = jsonDecode(content) as Map<String, Object?>;
        legacy = [
          for (final e in (json['b'] as List?) ?? const [])
            if (e is Map) e.cast<String, Object?>(),
        ];
      } else {
        // 更早的纯文本：非空行 → 段落
        legacy = [
          for (final line in content.split('\n'))
            if (line.trim().isNotEmpty) {'t': 'p', 'x': line},
        ];
      }
    } catch (_) {
      legacy = [
        {'t': 'p', 'x': content},
      ];
    }

    for (final e in legacy) {
      final code = legacyTypeCodes[e['t']] ?? FlowUsBlockType.paragraph.code;
      final text = (e['x'] as String?) ?? '';
      final uuid = (e['i'] as String?) ?? 'b${doc.blocks.length}';
      final data = <String, Object?>{
        if (code != FlowUsBlockType.divider.code)
          'segments': [FlowUsSegment.plain(text).toJson()],
        if (code == FlowUsBlockType.heading.code) 'level': 1,
        if (code == FlowUsBlockType.todo.code) 'checked': e['d'] == true,
      };
      doc.appendChild(
        pageId,
        FlowUsBlock(uuid: uuid, rawType: code, data: data),
      );
    }
    return doc;
  }
}