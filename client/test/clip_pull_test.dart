import 'dart:ffi';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/open.dart';

import 'package:bijiapp/clip/clip_pull.dart';
import 'package:bijiapp/data/asset_store_io.dart';
import 'package:bijiapp/data/database.dart';
import 'package:bijiapp/data/pages_table.dart';
import 'package:bijiapp/editor/block_model.dart';
import 'package:bijiapp/table/table_model.dart';

/// Windows 测试宿主机没有随包的 sqlite3.dll，用系统自带的 winsqlite3.dll。
void _setupSqliteForHostTests() {
  if (Platform.isWindows) {
    open.overrideFor(OperatingSystem.windows, () => DynamicLibrary.open('winsqlite3.dll'));
  }
}

/// 一张 1x1 红色 PNG（图片入库用真实字节）
const _pngBytes = <int>[
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
  0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
  0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB0, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

Map<String, Object?> clipJson(String id, {String text = '第一段\n\n第二段', int nAssets = 0}) {
  return {
    'id': id,
    'source': 'wechat_mp',
    'sourceUrl': 'https://mp.weixin.qq.com/s/abc',
    'canonicalUrl': 'https://mp.weixin.qq.com/s/abc',
    'title': '文章-$id',
    'author': '',
    'account': '某公众号',
    'publishedAt': null,
    'savedAt': '2026-11-08T03:00:00.000Z',
    'text': text,
    'assets': [
      for (var i = 0; i < nAssets; i++)
        {'assetId': 'aabcdef012345678$i', 'provider': 'r2', 'ext': 'png'},
    ],
    'status': 'complete',
    'failReason': null,
  };
}

void main() {
  _setupSqliteForHostTests();

  test('parseClipIndex：坏项剔除、非列表兜底空', () {
    final items = parseClipIndex([
      {'id': 'a', 'title': '甲', 'source': 'wechat_mp', 'savedAt': '2026-11-08T01:00:00Z', 'status': 'complete'},
      {'no_id': true},
      'junk',
    ]);
    expect(items, hasLength(1));
    expect(items.first.id, 'a');
    expect(parseClipIndex('not-a-list'), isEmpty);
    expect(parseClipIndex(null), isEmpty);
  });

  test('parseServerClip：字段与资产子集解析，缺 id 拒绝', () {
    final c = parseServerClip(clipJson('wx_01', nAssets: 2))!;
    expect(c.title, '文章-wx_01');
    expect(c.account, '某公众号');
    expect(c.status, 'complete');
    expect(c.assets, hasLength(2));
    expect(c.assets.first.assetId, 'aabcdef0123456780');
    expect(c.sourceLabel, '某公众号');
    expect(parseServerClip({'title': 'x'}), isNull);
    final noAccount = parseServerClip(clipJson('x')..['account'] = 42)!;
    expect(noAccount.sourceLabel, 'wechat_mp', reason: '公众号名缺失时回退平台名');
  });

  test('clipUrl：拼路径、去尾斜杠、令牌查询跟随', () {
    expect(clipUrl('https://pub-x.r2.dev', 'clips/index.json'), 'https://pub-x.r2.dev/clips/index.json');
    expect(clipUrl('https://pub-x.r2.dev/', 'clips/a.json'), 'https://pub-x.r2.dev/clips/a.json');
    expect(clipUrl('http://h:8080?t=TOKEN', 'clips/a.json'), 'http://h:8080/clips/a.json?t=TOKEN');
  });

  test('clipContentBlocks：来源行 + 正文段落，空正文给占位', () {
    final c = parseServerClip(clipJson('x', text: '第一段\n\n第二段'))!;
    final blocks = decodeBlocks(clipContentBlocks(c));
    expect(blocks.first.text, contains('某公众号'));
    expect(blocks.any((b) => b.text == '第一段'), isTrue);
    expect(blocks.any((b) => b.text == '第二段'), isTrue);
    expect(blocks.any((b) => b.text.startsWith('原文链接：')), isTrue);
    final empty = parseServerClip(clipJson('y', text: ''))!;
    expect(decodeBlocks(clipContentBlocks(empty)).any((b) => b.text.contains('未抓到正文')), isTrue);
  });

  group('pullClips 全流程（假 HTTP，真库）', () {
    late Directory tmp;
    late AppDatabase db;
    late PlatformAssetStore store;
    late Page table;

    setUp(() async {
      tmp = await Directory.systemTemp.createTemp('bjiclip-test');
      store = PlatformAssetStore(rootOverride: tmp);
      db = AppDatabase.forTesting(NativeDatabase.memory());
      table = await db.createPage(title: '剪藏库', type: PageTypes.table);
    });

    tearDown(() async {
      await db.close();
      if (tmp.existsSync()) await tmp.delete(recursive: true);
    });

    ClipPullDeps fakeDeps({required List<Map<String, Object?>> clips, bool assets = true}) {
      final index = [
        for (final c in clips)
          {'id': c['id'], 'title': c['title'], 'source': c['source'], 'savedAt': c['savedAt'], 'status': c['status']},
      ];
      return ClipPullDeps(
        fetchIndex: (_) async => index,
        fetchClip: (url) async {
          final id = url.split('/').last.replaceAll('.json', '');
          for (final c in clips) {
            if (c['id'] == id) return c;
          }
          throw Exception('404');
        },
        fetchAsset: assets ? (_) async => _pngBytes : null,
      );
    }

    test('清单两条：1 条含图入库、1 条损坏记失败；列自动补齐、行带锚点', () async {
      final deps = ClipPullDeps(
        fetchIndex: (_) async => [
          {'id': 'wx_01', 'title': '文章-wx_01', 'source': 'wechat_mp', 'savedAt': '2026-11-08T03:00:00.000Z', 'status': 'complete'},
          {'id': 'bad_02', 'title': 'x', 'source': 'wechat_mp', 'savedAt': '2026-11-07T03:00:00.000Z', 'status': 'failed'},
        ],
        fetchClip: (url) async =>
            url.endsWith('wx_01.json') ? clipJson('wx_01', nAssets: 2) : '不是json',
        fetchAsset: (_) async => _pngBytes,
      );
      final report = await pullClips(
        db: db, store: store, baseUrl: 'http://mock', tablePageId: table.id, deps: deps,
      );
      expect(report.total, 2);
      expect(report.imported, 1);
      expect(report.skipped, 0);
      expect(report.failed, hasLength(1));
      expect(report.assetsOk, 2);
      expect(report.assetsFailed, 0);

      // 表：列补齐 + 行入库
      final after = decodeTable((await db.pageById(table.id))!.content);
      expect(after.cols.map((c) => c.name), containsAll(['标题', '来源', '时间', '状态']));
      expect(after.rows, hasLength(1));
      expect(after.rows.first.clip, 'wx_01');
      final titleCol = after.cols.first.id;
      expect(after.rows.first.cells[titleCol], '文章-wx_01');

      // 记录页：type=record、挂在表下、正文含来源与段落
      final rec = await db.pageById(after.rows.first.pid!);
      expect(rec, isNotNull);
      expect(rec!.type, PageTypes.record);
      expect(rec.parentId, table.id);
      final blocks = decodeBlocks(rec.content);
      expect(blocks.first.text, contains('某公众号'));
      expect(blocks.any((b) => b.text == '第一段'), isTrue);
      // 图片挂到记录页（两张图同内容 → 内容编号去重后共享一份副本，G1 语义）
      final pageAssets = await db.assetsForPage(rec.id);
      expect(pageAssets, hasLength(1), reason: '同内容图片按编号去重');
      expect(pageAssets.first.id, '3220fc7838ccdab0', reason: '编号=SHA-256 前 16 位');
    });

    test('重复拉取幂等：已在库全部跳过，表 JSON 不膨胀', () async {
      final deps = fakeDeps(clips: [clipJson('wx_01'), clipJson('url_02')]);
      await pullClips(db: db, store: store, baseUrl: 'http://mock', tablePageId: table.id, deps: deps);
      final first = decodeTable((await db.pageById(table.id))!.content);
      final report = await pullClips(db: db, store: store, baseUrl: 'http://mock', tablePageId: table.id, deps: deps);
      expect(report.skipped, 2);
      expect(report.imported, 0);
      final second = decodeTable((await db.pageById(table.id))!.content);
      expect(second.rows.length, first.rows.length, reason: '重复拉取不得新增行');
    });

    test('目标页不是多维表 → 拒绝', () async {
      final note = await db.createPage(title: '普通页');
      await expectLater(
        pullClips(db: db, store: store, baseUrl: 'http://mock', tablePageId: note.id,
            deps: fakeDeps(clips: const [])),
        throwsArgumentError,
      );
    });
  });
}
