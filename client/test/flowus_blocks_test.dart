// M2-T01 文档数据模型的验收：块类型码 / 段与块的往返 / 旧格式升级 / 数据库迁移
//
// 跑法：cd client && flutter test test/flowus_blocks_test.dart
// 依据：docs/基准/基准-文档模型.md（§3 块字段、§4 segments）、基准-块类型总表.md（§1 数字码）

import 'dart:ffi';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/open.dart';

import 'package:bijiapp/data/database.dart';
import 'package:bijiapp/data/flowus_blocks.dart';
import 'package:bijiapp/editor/block_model.dart';

/// Windows 测试宿主机没有随包的 sqlite3.dll，用系统自带的 winsqlite3.dll。
void _setupSqliteForHostTests() {
  if (Platform.isWindows) {
    open.overrideFor(OperatingSystem.windows, () => DynamicLibrary.open('winsqlite3.dll'));
  }
}

/// 一份「真实形状」的块 JSON：键集取自 M0-T08 实测的 doc-api-schema.json
Map<String, Object?> realBlockJson({
  required String uuid,
  required int type,
  String? parentId,
  List<String> subNodes = const [],
  Map<String, Object?>? data,
}) =>
    {
      'uuid': uuid,
      'type': type,
      'parentId': parentId,
      'subNodes': subNodes,
      'title': '',
      'backgroundColor': 'default',
      'textColor': 'default',
      'status': 1,
      'version': 3,
      'createdAt': 1700000000000,
      'updatedAt': 1700000000001,
      'spaceId': 'space-1',
      'permissions': <String, Object?>{},
      'isTemplate': false,
      'templatePages': <Object?>[],
      'moved': <String, Object?>{},
      'discussions': <String, Object?>{},
      'data': data ??
          {
            'segments': [
              {'text': '这是一段', 'type': 0, 'enhancer': <String, Object?>{}}
            ],
            'format': {'pageLayout': 'page', 'fontFormat': 'default', 'commentAlignment': 'left'},
            'pageFixedWidth': false,
          },
    };

void main() {
  _setupSqliteForHostTests();

  group('块类型码（基准-块类型总表 §1）', () {
    test('实测确认的 16 个数字码都映射到中文名（18/19 在同一行，共 16 个码）', () {
      const expected = {
        0: '页面',
        1: '段落',
        3: '待办列表',
        4: '项目符号列表',
        5: '编号列表',
        6: '折叠列表',
        7: '标题',
        9: '分割线',
        12: '引述文字',
        15: '文件夹',
        18: '多维表',
        19: '多维表视图／记录页',
        25: '代码块',
        27: '简单表格',
        28: '表格单元格',
        38: '折叠标题',
      };
      expected.forEach((code, label) {
        final t = FlowUsBlockType.fromCode(code);
        expect(t.label, label, reason: 'type=$code 应该是 $label');
        expect(t.code, code);
      });
      expect(expected.length, 16);
    });

    test('不认识的数字码 → unknown，但 rawType 保留（导入不丢）', () {
      final b = FlowUsBlock.fromJson(realBlockJson(uuid: 'u1', type: 99));
      expect(b.type, FlowUsBlockType.unknown);
      expect(b.rawType, 99);
      expect(b.toJson()['type'], 99);
    });

    test('标题级别从 data.level 读（1–4）', () {
      final b = FlowUsBlock.fromJson(realBlockJson(
        uuid: 'h',
        type: 7,
        data: {
          'level': 2,
          'segments': [
            {'text': '二级标题', 'type': 0, 'enhancer': <String, Object?>{}}
          ],
        },
      ));
      expect(b.headingLevel, 2);
    });
  });

  group('段与块的往返（导入不能丢字段）', () {
    test('segment 的 enhancer 未知键原样保留', () {
      final seg = FlowUsSegment.fromJson({
        'text': '加粗带链接',
        'type': 0,
        'enhancer': {'bold': true, 'code': false, 'someFutureKey': 42},
      });
      final back = seg.toJson();
      expect((back['enhancer'] as Map)['bold'], true);
      expect((back['enhancer'] as Map)['someFutureKey'], 42);
      expect(seg.hasStyle, true);
    });

    test('块的真实顶层键集往返不丢', () {
      final json = realBlockJson(uuid: 'u1', type: 1);
      final b = FlowUsBlock.fromJson(json);
      final out = b.toJson();
      for (final k in [
        'backgroundColor',
        'textColor',
        'status',
        'version',
        'createdAt',
        'updatedAt',
        'spaceId',
        'permissions',
        'isTemplate',
        'templatePages',
        'moved',
        'discussions',
      ]) {
        expect(out.containsKey(k), true, reason: '往返后丢了顶层键 $k');
        expect(out[k], json[k], reason: '顶层键 $k 的值变了');
      }
      expect(out['data'], json['data']); // data 整个原样持有
      expect(b.plainText, '这是一段');
    });
  });

  group('文档：从真实接口响应还原', () {
    FlowUsDocument sampleDoc() {
      // root 的 subNodes 故意写成 b、a（与对象键顺序相反），用来验证"顺序看 subNodes"
      final json = {
        'code': 0,
        'data': {
          'blocks': {
            'root': realBlockJson(uuid: 'root', type: 0, subNodes: ['b', 'a'], data: {
              'segments': <Object?>[],
              'pageFixedWidth': false,
            }),
            'a': realBlockJson(uuid: 'a', type: 1, parentId: 'root'),
            'b': realBlockJson(uuid: 'b', type: 7, parentId: 'root',
                data: {'level': 1, 'segments': <Object?>[]}),
          },
        },
      };
      return FlowUsDocument.fromApiResponse(json as Map<String, Object?>);
    }

    test('根块是 parentId 为空的那个页面块', () {
      final doc = sampleDoc();
      expect(doc.rootId, 'root');
      expect(doc.root?.rawType, 0);
    });

    test('子块顺序看 parent.subNodes，而不是 blocks 对象的键顺序', () {
      final doc = sampleDoc();
      expect(doc.childrenOf('root').map((b) => b.uuid).toList(), ['b', 'a']);
      expect(doc.flatten().map((e) => e.block.uuid).toList(), ['root', 'b', 'a']);
      expect(doc.flatten().map((e) => e.depth).toList(), [0, 1, 1]);
    });
  });

  group('旧格式升级（v1 → FlowUs 块结构）', () {
    const legacy =
        '{"v":1,"b":[{"t":"p","x":"段落","i":"b1"},{"t":"h1","x":"标题","i":"b2"},'
        '{"t":"quote","x":"引述","i":"b3"},{"t":"todo","x":"待办","d":true,"i":"b4"},'
        '{"t":"bullet","x":"项目","i":"b5"},{"t":"divider","i":"b6"}]}';

    test('六种旧块映射到正确数字码，且根块是 type=0', () {
      final doc = FlowUsDocument.fromLegacyContent(legacy, pageId: 'page-1');
      expect(doc.rootId, 'page-1');
      expect(doc.root?.rawType, FlowUsBlockType.page.code);
      final codes = doc.childrenOf('page-1').map((b) => b.rawType).toList();
      expect(codes, [1, 7, 12, 3, 4, 9]);
    });

    test('分割线没有 segments；待办保留勾选；标题带 level', () {
      final doc = FlowUsDocument.fromLegacyContent(legacy, pageId: 'page-1');
      final byId = {for (final b in doc.childrenOf('page-1')) b.uuid: b};
      expect(byId['b6']?.data.containsKey('segments'), false);
      expect(byId['b4']?.data['checked'], true);
      expect(byId['b2']?.headingLevel, 1);
      expect(byId['b1']?.plainText, '段落');
    });

    test('更早的纯文本：非空行转段落', () {
      final doc = FlowUsDocument.fromLegacyContent('甲\n\n乙', pageId: 'p');
      expect(doc.childrenOf('p').map((b) => b.plainText).toList(), ['甲', '乙']);
    });

    test('空正文只有一个根块（不塞空段落）', () {
      final doc = FlowUsDocument.fromLegacyContent('', pageId: 'p');
      expect(doc.blocks.length, 1);
      expect(doc.childrenOf('p'), isEmpty);
    });

    test('storedVersionOf 能区分 v2 / v1 / 纯文本 / 坏 JSON', () {
      expect(FlowUsDocument.storedVersionOf('{"v":2,"root":"r","blocks":{}}'), 2);
      expect(FlowUsDocument.storedVersionOf(legacy), 1);
      expect(FlowUsDocument.storedVersionOf('就是一段纯文本'), 0);
      expect(FlowUsDocument.storedVersionOf('{"v":2,"root":'), 0);
    });
  });

  group('编辑器序列化（encode/decode）', () {
    test('六类块往返：文字/类型/顺序/勾选/级别都不变', () {
      final src = [
        BlockData(id: 'b1', type: BlockType.h1, text: '大标题'),
        BlockData(id: 'b2', type: BlockType.p, text: '正文'),
        BlockData(id: 'b3', type: BlockType.bullet, text: '一条'),
        BlockData(id: 'b4', type: BlockType.todo, text: '待办', checked: true),
        BlockData(id: 'b5', type: BlockType.quote, text: '引用'),
        BlockData(id: 'b6', type: BlockType.divider, text: ''),
      ];
      final encoded = encodeBlocks(src);
      expect(FlowUsDocument.storedVersionOf(encoded), 2);
      final back = decodeBlocks(encoded);
      expect(back.map((b) => b.id).toList(), ['b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
      expect(back.map((b) => b.type).toList(), [
        BlockType.h1,
        BlockType.p,
        BlockType.bullet,
        BlockType.todo,
        BlockType.quote,
        BlockType.divider,
      ]);
      expect(back.map((b) => b.text).toList(), ['大标题', '正文', '一条', '待办', '引用', '']);
      expect(back[3].checked, true);
      expect(back[0].level, 1);
    });

    test('旧 v1 内容仍能读出来（向后兼容）', () {
      final blocks = decodeBlocks(
          '{"v":1,"b":[{"t":"p","x":"老内容","i":"x1"},{"t":"h1","x":"老标题","i":"x2"}]}');
      expect(blocks.map((b) => b.text).toList(), ['老内容', '老标题']);
      expect(blocks.map((b) => b.type).toList(), [BlockType.p, BlockType.h1]);
    });

    test('空正文 → 一个空段落块（不留空白页）', () {
      expect(decodeBlocks('').single.type, BlockType.p);
      expect(decodeBlocks('').single.text, '');
    });

    test('坏 JSON 不崩，文字原样保留', () {
      final blocks = decodeBlocks('{"v":2,"root":');
      expect(blocks.single.text, '{"v":2,"root":');
    });
  });

  group('数据库迁移 v7→v8（只改数据、不改表）', () {
    late AppDatabase db;

    setUp(() {
      db = AppDatabase.forTesting(NativeDatabase.memory());
    });

    tearDown(() async {
      await db.close();
    });

    test('schemaVersion 已升到 9（M2-T23 又加了 coverKey 列）', () {
      expect(db.schemaVersion, 9);
    });

    test('迁移把 v1 正文就地改成 v2，且内容不丢', () async {
      final page = await db.createPage(
        title: '老页面',
        content: '{"v":1,"b":[{"t":"p","x":"第一段","i":"a1"},{"t":"todo","x":"要做","d":true,"i":"a2"}]}',
      );
      await db.migrateContentToFlowUsBlocks();

      final row = (await db.select(db.pages).get()).firstWhere((p) => p.id == page.id);
      expect(FlowUsDocument.storedVersionOf(row.content), 2);
      final blocks = decodeBlocks(row.content);
      expect(blocks.map((b) => b.text).toList(), ['第一段', '要做']);
      expect(blocks[1].type, BlockType.todo);
      expect(blocks[1].checked, true);
    });

    test('迁移幂等：跑第二遍不再改动', () async {
      final page = await db.createPage(title: 'p', content: '{"v":1,"b":[{"t":"p","x":"x","i":"a1"}]}');
      await db.migrateContentToFlowUsBlocks();
      final once = (await db.select(db.pages).get()).firstWhere((p) => p.id == page.id).content;
      await db.migrateContentToFlowUsBlocks();
      final twice = (await db.select(db.pages).get()).firstWhere((p) => p.id == page.id).content;
      expect(twice, once);
    });

    test('空正文的页面迁移后仍是空串（不凭空造内容）', () async {
      final page = await db.createPage(title: '空页');
      await db.migrateContentToFlowUsBlocks();
      final row = (await db.select(db.pages).get()).firstWhere((p) => p.id == page.id);
      expect(row.content, '');
    });
  });
}