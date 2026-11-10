// M4-T01 多维表数据模型的验收：字段类型字符串 / 视图类型 / 库块与记录还原 / 序列化往返
//
// 跑法：cd client && flutter test test/flowus_table_test.dart
// 依据：docs/基准/基准-多维表模型.md（M0-T09）、基准-字段类型对照.md（M0-T26）

import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/table/flowus_table.dart';

/// 一列：`{name, type, options?}` —— 实测只有这三个键，这里再塞一个未知键验"保留"
Map<String, Object?> fieldJson(String name, String type, {Map<String, Object?>? extra}) => {
      'name': name,
      'type': type,
      if (type == 'select' || type == 'multi_select')
        'options': [
          {'id': 'o1', 'name': '甲', 'color': 'red'},
          {'id': 'o2', 'name': '乙'},
        ],
      ...?extra,
    };

/// 一个库块（type=18，`data.schema` 在 data 里）
Map<String, Object?> collectionBlockJson({required Map<String, Object?> schema}) => {
      'uuid': 'col-1',
      'type': 18,
      'parentId': 'page-root',
      'subNodes': ['rec-1', 'rec-2'],
      'title': '磷化工资料',
      'data': {
        'schema': schema,
        'collectionPageProperties': <String, Object?>{},
        'segments': <Object?>[],
      },
      'views': <String, Object?>{},
    };

Map<String, Object?> recordBlockJson({
  required String uuid,
  Map<String, Object?>? cells,
  List<String> subNodes = const [],
}) =>
    {
      'uuid': uuid,
      'type': 0,
      'parentId': 'col-1',
      'subNodes': subNodes,
      'title': '',
      'data': {
        'segments': <Object?>[],
        'collectionProperties': cells ?? <String, Object?>{},
      },
    };

void main() {
  group('字段类型字符串（基准-字段类型对照 §1：18 种）', () {
    test('18 种接口字符串都映射到中文名（含与 Notion 不同的 person / updated_at / updated_by）', () {
      const expected = {
        'title': '标题',
        'text': '文本',
        'number': '数字',
        'checkbox': '勾选框',
        'select': '单选',
        'multi_select': '多选',
        'date': '日期',
        'person': '人员',
        'file': '文件媒体',
        'url': '网址链接',
        'email': '邮箱',
        'phone': '电话',
        'formula': '公式',
        'rollup': '汇总',
        'created_at': '创建时间',
        'created_by': '创建人',
        'updated_at': '编辑时间',
        'updated_by': '编辑人',
        'id_number': '自动编号',
      };
      expected.forEach((api, label) {
        expect(FlowUsFieldType.fromApi(api).label, label, reason: '$api 应该是 $label');
        expect(FlowUsFieldType.fromApi(api).apiName, api);
      });
      expect(expected.length, 19); // 18 种换类型实测 + id_number（数据里见过）
    });

    test('未知字段类型 → unknown，但 rawType 原样保留（导入不丢）', () {
      final f = FlowUsFieldDefinition.fromJson('f9', {'name': '某列', 'type': 'date_range'});
      expect(f.type, FlowUsFieldType.unknown);
      expect(f.rawType, 'date_range');
      expect(f.toJson()['type'], 'date_range');
    });

    test('系统字段判定（用户不能填的那种）', () {
      for (final api in ['created_at', 'created_by', 'updated_at', 'updated_by', 'id_number']) {
        expect(FlowUsFieldType.fromApi(api).isSystemField, true, reason: '$api 应是系统字段');
      }
      expect(FlowUsFieldType.fromApi('text').isSystemField, false);
      expect(FlowUsFieldType.fromApi('title').isSystemField, false);
    });
  });

  group('视图类型（7 种）与视图配置（全在 format）', () {
    test('7 种视图 type 字符串映射正确', () {
      const expected = {
        'table': '表格',
        'board': '看板',
        'gallery': '画廊',
        'list': '目录',
        'timeline': '时间轴',
        'calendar': '日历',
        'form': '收集表',
      };
      expected.forEach((api, label) {
        expect(FlowUsViewType.fromApi(api).label, label, reason: '$api 应该是 $label');
      });
    });

    test('视图往返保留 format 里的未知配置项，并暴露 filter/sorters/openPageWay', () {
      final v = FlowUsView.fromJson({
        'uuid': 'v1',
        'type': 'table',
        'title': '全部',
        'format': {
          'tableWrap': true,
          'tableProperties': ['f1', 'f2'],
          'filter': {'and': []},
          'sorters': [{'field': 'f2', 'desc': true}],
          'openPageWay': 'side_peek',
          'someFutureKey': 42,
        },
        'collectionId': 'col-1',
        'pageSort': [{'id': 'rec-1'}],
      });
      expect(v.type, FlowUsViewType.table);
      expect(v.filter, {'and': []});
      expect(v.sorters, isNotNull);
      expect(v.openPageWay, 'side_peek');
      expect(v.pageSort?.length, 1);
      final back = v.toJson();
      expect(back['format'], containsPair('someFutureKey', 42));
      expect(back['collectionId'], 'col-1'); // 未知顶层键也保留
    });
  });

  group('库块 → 字段 + 记录还原（记录 = 页面块）', () {
    FlowUsCollection build() => FlowUsCollection.fromBlocks(
          collectionBlockJson(schema: {
            'f-title': fieldJson('名称', 'title'),
            'f-text': fieldJson('备注', 'text', extra: {'someUnknown': 'keep'}),
            'f-sel': fieldJson('类别', 'select'),
          }),
          [
            recordBlockJson(uuid: 'rec-1', cells: {
              'f-title': '磷石膏',
              'f-sel': ['o1'],
            }),
            recordBlockJson(uuid: 'rec-2', subNodes: ['rec-2-child']),
          ],
          viewJsons: [
            {'uuid': 'v-board', 'type': 'board', 'title': '看板'},
            {'uuid': 'v-table', 'type': 'table', 'title': '表格', 'format': <String, Object?>{}},
          ],
        );

    test('字段顺序 = schema 键顺序（列顺序就是展示顺序）', () {
      expect(build().fields.map((f) => f.id).toList(), ['f-title', 'f-text', 'f-sel']);
      expect(build().fields.map((f) => f.name).toList(), ['名称', '备注', '类别']);
    });

    test('记录 parentId 指向库块，单元格值原样持有', () {
      final c = build();
      expect(c.records.length, 2);
      expect(c.records.first.parentId, 'col-1');
      expect(c.records.first.cells['f-title'], '磷石膏');
      expect(c.records.first.cells['f-sel'], ['o1']);
      expect(c.records[1].cells, isEmpty);
    });

    test('记录自己也是页面：subNodes 保留', () {
      expect(build().records[1].subNodes, ['rec-2-child']);
    });

    test('标题列 = type=title 的那一列；没有则返回 null（不硬凑）', () {
      expect(build().titleField?.id, 'f-title');
      final noTitle = FlowUsCollection.fromBlocks(
        collectionBlockJson(schema: {'f1': fieldJson('甲', 'text')}),
        const [],
      );
      expect(noTitle.titleField, isNull);
    });

    test('默认视图优先取表格视图（不是数组里的第一个）', () {
      expect(build().defaultView?.type, FlowUsViewType.table);
      expect(build().defaultView?.uuid, 'v-table');
    });

    test('字段定义里的未知键往返不丢', () {
      final f = build().fieldById('f-text')!;
      expect(f.toJson()['someUnknown'], 'keep');
    });
  });

  group('序列化往返（我们落库的格式）', () {
    FlowUsCollection build() => FlowUsCollection.fromBlocks(
          collectionBlockJson(schema: {
            'f-title': fieldJson('名称', 'title'),
            'f-sel': fieldJson('类别', 'select'),
            'f-num': fieldJson('数量', 'number'),
          }),
          [recordBlockJson(uuid: 'rec-1', cells: {'f-title': '磷矿', 'f-num': 12})],
          viewJsons: [
            {'uuid': 'v1', 'type': 'table', 'title': '全部', 'format': <String, Object?>{'filter': null}},
          ],
        );

    test('往返后字段/记录/视图都不变', () {
      final src = build();
      final back = FlowUsCollection.fromStoredJson(src.toStoredJson());
      expect(back.id, 'col-1');
      expect(back.fields.map((f) => f.id).toList(), ['f-title', 'f-sel', 'f-num']);
      expect(back.records.single.cells['f-num'], 12);
      expect(back.views.single.type, FlowUsViewType.table);
      expect(back.titleField?.name, '名称');
    });

    test('二次序列化与一次完全相同（幂等，不会越存越胖）', () {
      final once = build().toStoredJson();
      final twice = FlowUsCollection.fromStoredJson(once).toStoredJson();
      expect(twice, once);
    });

    test('单选字段的 options（数组）往返保留', () {
      final src = build();
      final back = FlowUsCollection.fromStoredJson(src.toStoredJson());
      final opts = back.fieldById('f-sel')!.options!;
      expect(opts.length, 2);
      expect((opts.first as Map)['name'], '甲');
    });

    test('空正文 → 空表（不抛）', () {
      expect(FlowUsCollection.fromStoredJson('').fields, isEmpty);
    });

    test('坏 JSON 不崩，返回空表', () {
      expect(FlowUsCollection.fromStoredJson('{"v":1,"id":"x",').fields, isEmpty);
    });
  });
}