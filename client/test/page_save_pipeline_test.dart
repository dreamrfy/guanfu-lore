// M2-T14 保存链与崩溃恢复验收（内存 SQLite 实跑）
//
// 跑法：cd client && flutter test test/page_save_pipeline_test.dart

import 'dart:ffi';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/open.dart';

import 'package:bijiapp/data/database.dart';
import 'package:bijiapp/data/save_state.dart';
import 'package:bijiapp/page/page_save_pipeline.dart';

/// Windows 测试宿主机没有随包的 sqlite3.dll，用系统自带的 winsqlite3.dll。
void _setupSqlite() {
  if (Platform.isWindows) {
    open.overrideFor(OperatingSystem.windows, () => DynamicLibrary.open('winsqlite3.dll'));
  }
}

void main() {
  _setupSqlite();

  late AppDatabase db;
  late PageSavePipeline pipe;
  late String pageId; // createPage 会生成 ULID，必须用它返回的 id（写死 'p1' 会读不到页）

  setUp(() async {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    final page = await db.createPage(title: '原题', content: 'v1');
    pageId = page.id;
    pipe = PageSavePipeline(db: db, pageId: pageId, debounce: const Duration(milliseconds: 120));
  });

  tearDown(() async {
    pipe.dispose();
    await db.close();
  });

  test('打开页面：读出标题与正文，无草稿时不提示恢复', () async {
    final open = await pipe.open();
    expect(open.title, '原题');
    expect(open.content, 'v1');
    expect(open.hasRecoverableDraft, isFalse);
  });

  test('正文防抖：窗口内不落库，窗口后落一次且 rev 自增', () async {
    await pipe.open();
    final before = (await db.pageById(pageId))!.rev;

    pipe.editContent('v2');
    await Future<void>.delayed(const Duration(milliseconds: 40));
    expect((await db.pageById(pageId))!.content, 'v1', reason: '防抖窗口内不该落库');

    await Future<void>.delayed(const Duration(milliseconds: 200));
    final after = (await db.pageById(pageId))!;
    expect(after.content, 'v2');
    expect(after.rev, before + 1);
  });

  test('键击即时写草稿；落库成功后草稿被清掉', () async {
    await pipe.open();
    pipe.editContent('v2-草稿');
    await Future<void>.delayed(const Duration(milliseconds: 30));
    expect((await db.draftFor(pageId))?.content, 'v2-草稿', reason: '草稿必须比防抖更早落');

    await Future<void>.delayed(const Duration(milliseconds: 250));
    expect(await db.draftFor(pageId), isNull, reason: '主库落盘成功后草稿应清空');
  });

  test('崩溃恢复：草稿与主库不同 → 打开时提示，可采纳', () async {
    await pipe.open();
    // 模拟"没保存就崩了"：直接写一条与主库不同的草稿
    await db.saveDraft(pageId, 'v2-未保存');

    final reopened = await pipe.open();
    expect(reopened.content, 'v1');
    expect(reopened.hasRecoverableDraft, isTrue);

    final recovered = await pipe.acceptDraft();
    expect(recovered, 'v2-未保存');
    expect((await db.pageById(pageId))!.content, 'v2-未保存');
    expect(await db.draftFor(pageId), isNull);
  });

  test('草稿与主库相同 → 不算可恢复，并且顺手清掉（不留噪声）', () async {
    await db.saveDraft(pageId, 'v1'); // 与主库一致
    final open = await pipe.open();
    expect(open.hasRecoverableDraft, isFalse);
    expect(await db.draftFor(pageId), isNull);
  });

  test('放弃草稿：只清草稿，不动主库', () async {
    await db.saveDraft(pageId, 'v2-未保存');
    await pipe.open();
    await pipe.discardDraft();
    expect(await db.draftFor(pageId), isNull);
    expect((await db.pageById(pageId))!.content, 'v1');
  });

  test('标题也防抖，且 flush 会立刻写标题与正文', () async {
    await pipe.open();
    pipe.editTitle('新题');
    pipe.editContent('v3');
    await Future<void>.delayed(const Duration(milliseconds: 40));
    expect((await db.pageById(pageId))!.title, '原题', reason: '标题也在防抖窗口内');

    await pipe.flush();
    final p = (await db.pageById(pageId))!;
    expect(p.title, '新题');
    expect(p.content, 'v3');
  });

  test('状态灯：编辑中 → 落盘后转 pendingSync（等云端同步，本地已保存）', () async {
    await pipe.open();
    expect(pipe.status, SaveStatus.pendingSync);
    pipe.editContent('v4');
    expect(pipe.status, SaveStatus.editing);
    await Future<void>.delayed(const Duration(milliseconds: 250));
    expect(pipe.status, SaveStatus.pendingSync);
  });
}