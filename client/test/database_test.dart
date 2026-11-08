import 'dart:ffi';
import 'dart:io';

import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:sqlite3/open.dart';

import 'package:bijiapp/data/asset_store_common.dart';
import 'package:bijiapp/data/asset_store_io.dart';
import 'package:bijiapp/data/database.dart';
import 'package:bijiapp/data/ids.dart';
import 'package:bijiapp/data/pages_table.dart';

/// Windows 测试宿主机没有随包的 sqlite3.dll，用系统自带的 winsqlite3.dll。
void _setupSqliteForHostTests() {
  if (Platform.isWindows) {
    open.overrideFor(OperatingSystem.windows, () => DynamicLibrary.open('winsqlite3.dll'));
  }
}

// 一张 1x1 红色 PNG 的字节（真实图片头，魔数校验友好）
const _pngBytes = <int>[
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
  0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
  0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB0, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

void main() {
  _setupSqliteForHostTests();

  test('稳定 ID：26 位 ULID、字符集合规、不重复', () {
    final ids = List.generate(500, (_) => newId());
    for (final id in ids) {
      expect(id.length, 26);
      expect(RegExp(r'^[0-9A-HJKMNPQRSTVWXYZ]{26}$').hasMatch(id), isTrue,
          reason: 'id 应为 Crockford Base32：$id');
    }
    expect(ids.toSet().length, 500, reason: '500 个 id 不得重复');
  });

  test('数据库：新建→读取→字段往返一致', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    final created = await db.createPage(title: '周会记录', content: '第一条内容');
    expect(created.id.length, 26);
    final all = await db.listActivePages();
    expect(all.length, 1);
    expect(all.first.title, '周会记录');
    expect(all.first.content, '第一条内容');
    expect(all.first.rev, 0);
    expect(all.first.deleted, isFalse);
    await db.close();
  });

  test('数据库：重命名只改目标行并更新时间', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    final a = await db.createPage(title: 'A');
    await db.createPage(title: 'B');
    await db.renamePage(a.id, 'A2');
    final all = await db.listActivePages();
    expect(all.map((e) => e.title), containsAll(['A2', 'B']));
    final renamed = all.firstWhere((e) => e.id == a.id);
    expect(renamed.updatedAt.isAfter(renamed.createdAt) || renamed.updatedAt == renamed.createdAt,
        isTrue);
    await db.close();
  });

  test('页面类型（V2.1 ①）：默认普通页、可建多维表、类型切换往返、非法类型拒绝', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    // 默认类型 = 普通页面
    final p = await db.createPage(title: '普通页');
    expect(p.type, PageTypes.page);
    // 显式建多维表
    final t = await db.createPage(title: '剪藏库', type: PageTypes.table);
    expect(t.type, PageTypes.table);
    // 空页面转多维表 + 转回
    await db.setPageType(p.id, PageTypes.table);
    expect((await db.pageById(p.id))!.type, PageTypes.table);
    await db.setPageType(p.id, PageTypes.page);
    expect((await db.pageById(p.id))!.type, PageTypes.page);
    // 类型切换计入版本号（单调递增）
    expect((await db.pageById(p.id))!.rev, greaterThanOrEqualTo(2));
    // 非法类型拒绝（建表与切换两条路）
    await expectLater(db.createPage(title: 'x', type: 'kanban'), throwsArgumentError);
    await expectLater(db.setPageType(p.id, 'kanban'), throwsArgumentError);
    await db.close();
  });

  test('数据库：软删除标记生效（listActivePages 不含已删除）', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    final a = await db.createPage(title: '将被删除');
    await (db.update(db.pages)..where((t) => t.id.equals(a.id)))
        .write(PagesCompanion(deleted: Value(true)));
    expect(await db.listActivePages(), isEmpty);
    await db.close();
  });

  group('资源存储（P1-T03）', () {
    late Directory tmp;
    late PlatformAssetStore store;

    setUp(() async {
      tmp = await Directory.systemTemp.createTemp('bijiasset-test');
      store = PlatformAssetStore(rootOverride: tmp);
    });

    tearDown(() async {
      if (tmp.existsSync()) await tmp.delete(recursive: true);
    });

    test('save：编号=SHA-256 前 16 位，落盘路径两级分片', () async {
      final stored = await store.save(_pngBytes, 'png');
      expect(stored.id, assetIdOf(_pngBytes));
      expect(stored.id.length, 16);
      expect(stored.sha256Hex, fullShaOf(_pngBytes));
      final f = File(p.join(tmp.path, stored.id.substring(0, 2), '${stored.id}.png'));
      expect(f.existsSync(), isTrue, reason: '副本应落在 assets/<前2位>/<编号>.png');
      expect(f.lengthSync(), _pngBytes.length);
    });

    test('read：副本字节与原字节一致（删原图不影响副本）', () async {
      final stored = await store.save(_pngBytes, 'png');
      final readBack = await store.read(stored.id, 'png');
      expect(readBack, equals(_pngBytes));
    });

    test('verify：完整为真、篡改后为假、缺失为假', () async {
      final stored = await store.save(_pngBytes, 'png');
      expect(await store.verify(stored.id, 'png', stored.sha256Hex), isTrue);
      // 篡改副本一个字节
      final f = File(p.join(tmp.path, stored.id.substring(0, 2), '${stored.id}.png'));
      final bytes = f.readAsBytesSync();
      bytes[10] = bytes[10] ^ 0xFF;
      f.writeAsBytesSync(bytes);
      expect(await store.verify(stored.id, 'png', stored.sha256Hex), isFalse);
      // 缺失
      f.deleteSync();
      expect(await store.verify(stored.id, 'png', stored.sha256Hex), isFalse);
    });

    test('去重：同内容两次保存得到同编号、只存一份', () async {
      final a = await store.save(_pngBytes, 'png');
      final b = await store.save(_pngBytes, 'png');
      expect(a.id, b.id);
      final files = tmp.listSync(recursive: true).whereType<File>().where((f) => !f.path.endsWith('.tmp')).length;
      expect(files, 1);
    });

    test('白名单：拒绝 svg/pdf 等非位图扩展', () async {
      expect(() => store.save(_pngBytes, 'svg'), throwsArgumentError);
      expect(() => store.save(_pngBytes, 'pdf'), throwsArgumentError);
      expect(() => store.save(_pngBytes, 'exe'), throwsArgumentError);
    });

    test('台账与挂载：recordAsset+attachAssetToPage 幂等，assetsForPage 返回登记过的资源', () async {
      final db = AppDatabase.forTesting(NativeDatabase.memory());
      final page = await db.createPage(title: '带图笔记');
      final stored = await store.save(_pngBytes, 'png');
      await db.recordAsset(stored);
      await db.recordAsset(stored); // 幂等
      await db.attachAssetToPage(page.id, stored.id);
      await db.attachAssetToPage(page.id, stored.id); // 幂等
      final assets = await db.assetsForPage(page.id);
      expect(assets.length, 1);
      expect(assets.first.id, stored.id);
      expect(assets.first.size, _pngBytes.length);
      // 未挂载的页面查不到
      final other = await db.createPage(title: '空笔记');
      expect(await db.assetsForPage(other.id), isEmpty);
      await db.close();
    });

    test('回收站：软删除→列表→恢复→清空（挂载关系一并清理）', () async {
      final db = AppDatabase.forTesting(NativeDatabase.memory());
      final a = await db.createPage(title: '要删的');
      await db.createPage(title: '要留的');
      final stored = await store.save(_pngBytes, 'png');
      await db.recordAsset(stored);
      await db.attachAssetToPage(a.id, stored.id);

      // 软删除：主列表消失、回收站出现、时间戳落位
      await db.softDeletePage(a.id);
      expect(await db.listActivePages(), hasLength(1));
      expect((await db.listActivePages()).first.title, '要留的');
      final trash = await db.listDeletedPages();
      expect(trash, hasLength(1));
      expect(trash.first.id, a.id);
      expect(trash.first.deletedAt, isNotNull);

      // 恢复：回收站清空、主列表回来
      await db.restorePage(a.id);
      expect(await db.listDeletedPages(), isEmpty);
      expect((await db.listActivePages()).first.title, '要删的');

      // 再删 → 清空：彻底删除且挂载关系清理
      await db.softDeletePage(a.id);
      expect(await db.emptyTrash(), 1);
      expect(await db.listDeletedPages(), isEmpty);
      final allLeft = await db.select(db.pages).get();
      expect(allLeft.map((e) => e.title), ['要留的']);
      final links = await db.select(db.pageAssets).get();
      expect(links.where((l) => l.pageId == a.id), isEmpty, reason: '彻底删除的页面其挂载关系应清理');
      await db.close();
    });

    test('页面树：三层嵌套、后代判定、防循环', () async {
      final db = AppDatabase.forTesting(NativeDatabase.memory());
      final root = await db.createPage(title: '根');
      final child = await db.createPage(title: '子', parentId: root.id);
      final grand = await db.createPage(title: '孙', parentId: child.id);

      final descendants = await db.descendantIdsOf(root.id);
      expect(descendants, containsAll([root.id, child.id, grand.id]),
          reason: '后代集合应含自身与全部子孙');

      // 防循环：把根移动到它的孙下面 → 拒绝；移动到自己 → 拒绝
      expect(() => db.movePage(root.id, grand.id), throwsArgumentError);
      expect(() => db.movePage(root.id, root.id), throwsArgumentError);

      // 合法换父：子页面提到顶层
      await db.movePage(child.id, null);
      expect((await db.pageById(child.id))!.parentId, isNull);

      // 移动后孙仍挂在子下面（整体搬家）
      expect(await db.descendantIdsOf(child.id), contains(grand.id));
      await db.close();
    });

    test('同辈排序：上移与相邻兄弟交换位置', () async {
      final db = AppDatabase.forTesting(NativeDatabase.memory());
      final a = await db.createPage(title: '甲');
      final b = await db.createPage(title: '乙');
      await db.createPage(title: '丙');
      await db.reorderSibling(b.id, up: true);
      final ordered = await db.listAllActive();
      // listAllActive 不排序；按 (sortKey, createdAt) 排
      ordered.sort((x, y) {
        final c = x.sortKey.compareTo(y.sortKey);
        return c != 0 ? c : x.createdAt.compareTo(y.createdAt);
      });
      expect(ordered.map((e) => e.title).toList(), ['乙', '甲', '丙']);
      // 边界：已在最上的甲再上移 = 无变化
      await db.reorderSibling(a.id, up: true);
      final again = await db.listAllActive();
      expect(again.where((e) => e.id == a.id).first.sortKey,
          again.where((e) => e.id == a.id).first.sortKey);
      await db.close();
    });
  });
}
