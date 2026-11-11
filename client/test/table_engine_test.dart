// M4 引擎层验收（M4-T04~T11 的逻辑部分）
//
// 这层是纯函数，重点测**数据真的变了**，不测像素。
// 铁律（M2R 段）：每条能力都要能证明「操作 → 数据变化」。
//
// 跑法：cd client && flutter test test/table_engine_test.dart

import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/table/flowus_table.dart';
import 'package:bijiapp/table/table_engine.dart';

/// 造一张表：标题列 + 两个文本列 + 三行记录
FlowUsCollection _table() {
  return FlowUsCollection(
    id: 'col1',
    fields: [
      FlowUsFieldDefinition(id: 'title', name: '标题', rawType: 'title'),
      FlowUsFieldDefinition(id: 'f2', name: '公众号', rawType: 'text'),
      FlowUsFieldDefinition(
        id: 'f3',
        name: '标签',
        rawType: 'select',
        options: [
          {'name': '锂电', 'color': 'green'},
          {'name': '环保', 'color': 'gray'},
        ],
      ),
    ],
    records: [
      FlowUsRecord(uuid: 'r1', parentId: 'col1', cells: {
        'title': '磷酸铁锂成本分析',
        'f2': 'XX科技',
        'f3': '锂电',
      }),
      FlowUsRecord(uuid: 'r2', parentId: 'col1', cells: {
        'title': '磷石膏处理工艺',
        'f2': 'YY研究院',
        'f3': '环保',
      }),
      FlowUsRecord(uuid: 'r3', parentId: 'col1', cells: {
        'title': '正极材料对比',
        'f2': 'XX科技',
        'f3': '锂电',
      }),
    ],
    views: [
      FlowUsView(uuid: 'v1', rawType: 'table', title: '表格视图'),
    ],
  );
}

void main() {
  group('列操作（M4-T05）', () {
    test('加列：列数 +1，新列在末尾，类型默认文本', () {
      final c = _table();
      final next = FlowUsTableEngine.addColumn(c, name: '收藏时间');
      expect(next.fields.length, c.fields.length + 1);
      expect(next.fields.last.name, '收藏时间');
      expect(next.fields.last.type, FlowUsFieldType.text);
      expect(next.fields.last.id, isNot('title'));
    });

    test('改列名：只改那一列', () {
      final c = _table();
      final next = FlowUsTableEngine.renameColumn(c, 'f2', '来源公众号');
      expect(next.fieldById('f2')!.name, '来源公众号');
      expect(next.fieldById('f3')!.name, '标签', reason: '别的列不能动');
      expect(c.fieldById('f2')!.name, '公众号', reason: '原对象不能被就地改');
    });

    test('删列：列没了，**该列的值也一起没了**', () {
      final c = _table();
      final next = FlowUsTableEngine.deleteColumn(c, 'f2');
      expect(next.fields.length, 2);
      expect(next.fieldById('f2'), isNull);
      expect(next.recordById('r1')!.cells.containsKey('f2'), isFalse);
      expect(next.recordById('r1')!.cells['title'], '磷酸铁锂成本分析', reason: '别的值要留着');
    });

    test('拖列序：列位置真的换了', () {
      final c = _table();
      final next = FlowUsTableEngine.reorderColumn(c, 'f3', 0);
      expect(next.fields.map((f) => f.id).toList(), ['f3', 'title', 'f2']);
      expect(c.fields.map((f) => f.id).toList(), ['title', 'f2', 'f3'], reason: '原对象不能被就地改');
    });
  });

  group('改字段类型的数据安全（M4-T11）', () {
    test('文本→文本：无损', () {
      final c = _table();
      final impact = FlowUsTableEngine.assessTypeChange(c, 'f2', FlowUsFieldType.title);
      expect(impact.safe, isTrue);
    });

    test('文本→单选：**有损**，要报出会丢什么', () {
      final c = _table();
      final impact = FlowUsTableEngine.assessTypeChange(c, 'f2', FlowUsFieldType.select);
      expect(impact.safe, isFalse, reason: '文本不再是合法选项 → 必须提示');
      expect(impact.lostValues, contains('XX科技'));
      expect(impact.note, contains('XX科技'));
    });

    test('单选→数字：**有损**（需求文档 M0-T26 的警告场景）', () {
      final c = _table();
      final impact = FlowUsTableEngine.assessTypeChange(c, 'f3', FlowUsFieldType.number);
      expect(impact.safe, isFalse);
      expect(impact.lostValues, contains('锂电'));
      expect(impact.note, contains('不可逆'));
    });

    test('单选→文本：无损（只是拍平成字符串）', () {
      final c = _table();
      final impact = FlowUsTableEngine.assessTypeChange(c, 'f3', FlowUsFieldType.text);
      expect(impact.safe, isTrue);
    });

    test('空列改任意类型都安全', () {
      final c = FlowUsTableEngine.addColumn(_table(), name: '新列');
      final impact = FlowUsTableEngine.assessTypeChange(c, c.fields.last.id, FlowUsFieldType.number);
      expect(impact.safe, isTrue);
    });
  });

  group('行操作（M4-T06）', () {
    test('加行：行数 +1，新行 id 不重复', () {
      final c = _table();
      final next = FlowUsTableEngine.addRow(c);
      expect(next.records.length, 4);
      final ids = next.records.map((r) => r.uuid).toSet();
      expect(ids.length, 4, reason: 'id 不能重复');
    });

    test('删行：只删指定那行', () {
      final c = _table();
      final next = FlowUsTableEngine.deleteRow(c, 'r2');
      expect(next.records.length, 2);
      expect(next.recordById('r2'), isNull);
      expect(next.recordById('r1'), isNotNull);
    });

    test('写单元格：值真的变了，其它格不动', () {
      final c = _table();
      final next = FlowUsTableEngine.setCell(c, 'r1', 'f2', 'ZZ日报');
      expect(next.recordById('r1')!.cells['f2'], 'ZZ日报');
      expect(next.recordById('r1')!.cells['title'], '磷酸铁锂成本分析');
      expect(next.recordById('r2')!.cells['f2'], 'YY研究院');
    });

    test('写空值：清掉这个格子', () {
      final c = _table();
      final next = FlowUsTableEngine.setCell(c, 'r1', 'f2', null);
      expect(next.recordById('r1')!.cells['f2'], isNull);
    });
  });

  group('组合筛选（M4-T09）', () {
    test('无筛选 → 全返回', () {
      final c = _table();
      expect(FlowUsTableEngine.applyFilters(c, const []).length, 3);
    });

    test('单条件：筛出该公众号的两篇（用户场景之一）', () {
      final c = _table();
      final g = FlowUsFilterGroup([
        FlowUsFilterCondition(fieldId: 'f2', operator: FlowUsFilterOperator.equals, value: 'XX科技'),
      ]);
      final out = FlowUsTableEngine.applyFilters(c, [g]);
      expect(out.length, 2);
      expect(out.map((r) => r.uuid).toSet(), {'r1', 'r3'});
    });

    test('**多条件 AND**：公众号 + 标签（用户场景之二）', () {
      final c = _table();
      final g = FlowUsFilterGroup([
        FlowUsFilterCondition(fieldId: 'f2', operator: FlowUsFilterOperator.equals, value: 'XX科技'),
        FlowUsFilterCondition(fieldId: 'f3', operator: FlowUsFilterOperator.equals, value: '锂电'),
      ]);
      final out = FlowUsTableEngine.applyFilters(c, [g]);
      expect(out.length, 2);
      expect(out.every((r) => r.cells['f2'] == 'XX科技' && r.cells['f3'] == '锂电'), isTrue);
    });

    test('多条件 AND 无交集 → 空', () {
      final c = _table();
      final g = FlowUsFilterGroup([
        FlowUsFilterCondition(fieldId: 'f2', operator: FlowUsFilterOperator.equals, value: 'XX科技'),
        FlowUsFilterCondition(fieldId: 'f3', operator: FlowUsFilterOperator.equals, value: '环保'),
      ]);
      expect(FlowUsTableEngine.applyFilters(c, [g]).isEmpty, isTrue);
    });

    test('**多组 OR**：满足任一组即可（未读 或 某公众号）', () {
      final c = _table();
      final g1 = FlowUsFilterGroup([
        FlowUsFilterCondition(fieldId: 'f2', operator: FlowUsFilterOperator.equals, value: 'XX科技'),
      ]);
      final g2 = FlowUsFilterGroup([
        FlowUsFilterCondition(fieldId: 'f3', operator: FlowUsFilterOperator.equals, value: '环保'),
      ]);
      final out = FlowUsTableEngine.applyFilters(c, [g1, g2]);
      expect(out.length, 3, reason: 'XX科技两篇 + 环保一篇');
    });

    test('文本包含', () {
      final c = _table();
      final g = FlowUsFilterGroup([
        FlowUsFilterCondition(fieldId: 'title', operator: FlowUsFilterOperator.contains, value: '磷'),
      ]);
      final out = FlowUsTableEngine.applyFilters(c, [g]);
      expect(out.length, 2, reason: '「磷酸铁锂成本分析」「磷石膏处理工艺」');
    });

    test('不为空 / 为空', () {
      final c = FlowUsTableEngine.setCell(_table(), 'r3', 'f2', null);
      final notEmpty = FlowUsFilterGroup([
        FlowUsFilterCondition(fieldId: 'f2', operator: FlowUsFilterOperator.isNotEmpty),
      ]);
      expect(FlowUsTableEngine.applyFilters(c, [notEmpty]).length, 2);
      final empty = FlowUsFilterGroup([
        FlowUsFilterCondition(fieldId: 'f2', operator: FlowUsFilterOperator.isEmpty),
      ]);
      final out = FlowUsTableEngine.applyFilters(c, [empty]);
      expect(out.length, 1);
      expect(out.first.uuid, 'r3');
    });

    test('字段被删了 → 条件失效，不误伤行', () {
      final c = _table();
      final g = FlowUsFilterGroup([
        FlowUsFilterCondition(fieldId: '不存在的字段', operator: FlowUsFilterOperator.equals, value: 'x'),
      ]);
      expect(FlowUsTableEngine.applyFilters(c, [g]).length, 3);
    });
  });

  group('排序（M4-T10）', () {
    test('按字段升序', () {
      final c = _table();
      final out = FlowUsTableEngine.applySorters(c, [const FlowUsSorter(fieldId: 'f2')]);
      expect(out.map((r) => r.cells['f2']).toList(), ['XX科技', 'XX科技', 'YY研究院']);
    });

    test('按字段降序', () {
      final c = _table();
      final out =
          FlowUsTableEngine.applySorters(c, [const FlowUsSorter(fieldId: 'f2', descending: true)]);
      expect(out.first.cells['f2'], 'YY研究院');
    });

    test('多列排序：先按第一列，第二列做次级排序', () {
      final c = _table();
      final out = FlowUsTableEngine.applySorters(c, const [
        FlowUsSorter(fieldId: 'f2'),
        FlowUsSorter(fieldId: 'title', descending: true),
      ]);
      // 第一级 f2 升序：XX科技(r1,r3) 在前，YY研究院(r2) 在后
      // 第二级 title 降序（拼音序，正 > 磷 → 正极材料对比 应在 磷酸铁锂 之前）
      expect(out.map((r) => r.uuid).toList(), ['r3', 'r1', 'r2']);
    });

    test('中文排序按**拼音**（不是 Unicode 码位）', () {
      // 码位序的话"磷"(U+78F3) 会排在"正"(U+6B63) 前面 —— 对用户是没意义的乱序
      final c = _table();
      final out = FlowUsTableEngine.applySorters(c, [const FlowUsSorter(fieldId: 'title')]);
      final titles = out.map((r) => r.cells['title']).toList();
      expect(titles.indexOf('磷酸铁锂成本分析'), lessThan(titles.indexOf('正极材料对比')),
          reason: '拼音 li < zheng，磷应该在正前面');
    });

    test('数字按**数值**排（"文章10" > "文章9"）', () {
      var c = FlowUsTableEngine.setCell(_table(), 'r1', 'title', '文章10');
      c = FlowUsTableEngine.setCell(c, 'r2', 'title', '文章9');
      final out = FlowUsTableEngine.applySorters(c, [const FlowUsSorter(fieldId: 'title')]);
      final titles = out.map((r) => r.cells['title']).toList();
      expect(titles.indexOf('文章9'), lessThan(titles.indexOf('文章10')));
    });

    test('无排序 → 原顺序不变', () {
      final c = _table();
      final out = FlowUsTableEngine.applySorters(c, const []);
      expect(out.map((r) => r.uuid).toList(), ['r1', 'r2', 'r3']);
    });
  });

  group('视图配置落库（M4-T09/T10）', () {
    test('筛选 + 排序写进视图的 format，**重开还在**', () {
      final c = _table();
      final filters = [
        FlowUsFilterGroup([
          FlowUsFilterCondition(fieldId: 'f2', operator: FlowUsFilterOperator.equals, value: 'XX科技'),
        ]),
      ];
      final sorters = [const FlowUsSorter(fieldId: 'f2', descending: true)];

      final next = FlowUsTableEngine.writeViewConfig(c, 'v1', filters: filters, sorters: sorters);
      final v = next.views.first;
      expect(v.filter, isNotNull);
      expect(v.sorters, isNotNull);

      // 序列化 → 反序列化（模拟落库再读回来）
      final stored = next.toStoredJson();
      final back = FlowUsCollection.fromStoredJson(stored);
      final readFilters = FlowUsTableEngine.readFilters(back.views.first);
      final readSorters = FlowUsTableEngine.readSorters(back.views.first);

      expect(readFilters.length, 1);
      expect(readFilters.first.conditions.first.fieldId, 'f2');
      expect(readFilters.first.conditions.first.value, 'XX科技');
      expect(readSorters.length, 1);
      expect(readSorters.first.fieldId, 'f2');
      expect(readSorters.first.descending, isTrue);
    });

    test('整表序列化幂等：改来改去不会漂', () {
      var c = _table();
      c = FlowUsTableEngine.addColumn(c, name: '新列');
      c = FlowUsTableEngine.setCell(c, 'r1', 'title', '改了标题');
      final a = c.toStoredJson();
      final b = FlowUsCollection.fromStoredJson(a).toStoredJson();
      expect(b, a);
    });
  });
}
