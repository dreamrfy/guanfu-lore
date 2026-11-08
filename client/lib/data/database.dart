import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'asset_store_common.dart' show StoredAsset;
import 'ids.dart';
import 'assets_table.dart';
import 'pages_table.dart';

part 'database.g.dart';

@DriftDatabase(tables: [Pages, Assets, PageAssets, WebAssetBlobs, Drafts])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_open());

  /// 测试/演示用：显式注入执行器（内存库或指定文件）。
  AppDatabase.forTesting(super.e);

  @override
  int get schemaVersion => 4;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        onUpgrade: (m, from, to) async {
          // v1→v2（P1-T03）：新增资源三表；既有数据不动
          if (from < 2) {
            await m.createTable(assets);
            await m.createTable(pageAssets);
            await m.createTable(webAssetBlobs);
          }
          // v2→v3（P1-T05）：新增草稿表
          if (from < 3) {
            await m.createTable(drafts);
          }
          // v3→v4（P1-T06）：pages 加 deletedAt 列
          if (from < 4) {
            await m.addColumn(pages, pages.deletedAt);
          }
        },
        beforeOpen: (details) async {
          // 断电/杀进程可靠性的底线：WAL + 参数绑定外键
          await customStatement('PRAGMA journal_mode = WAL');
          await customStatement('PRAGMA synchronous = NORMAL');
          await customStatement('PRAGMA foreign_keys = ON');
        },
      );

  static QueryExecutor _open() => driftDatabase(
        name: 'bijiapp',
        // 网页端：wasm 引擎与 worker 均为本地文件（web/ 目录，构建自动携带）
        web: DriftWebOptions(
          sqlite3Wasm: Uri.parse('sqlite3.wasm'),
          driftWorker: Uri.parse('drift_worker.js'),
        ),
      );

  /// 主库里当前未删除的页面（按更新时间倒序）。
  Future<List<Page>> listActivePages() {
    return (select(pages)..where((t) => t.deleted.equals(false)) ..orderBy([
          (t) => OrderingTerm.desc(t.updatedAt),
        ]))
        .get();
  }

  /// 新建一条页面并返回（稳定 ID 在应用层生成；parentId 供页面树挂载）。
  Future<Page> createPage({String title = '', String content = '', String? parentId}) async {
    final now = DateTime.now();
    final row = PagesCompanion.insert(
      id: newId(),
      parentId: Value(parentId),
      title: Value(title),
      content: Value(content),
      createdAt: now,
      updatedAt: now,
    );
    await into(pages).insert(row);
    final created = await (select(pages)..where((t) => t.id.equals(row.id.value))).getSingle();
    return created;
  }

  Future<void> renamePage(String id, String title) {
    return (update(pages)..where((t) => t.id.equals(id)))
        .write(PagesCompanion(title: Value(title), updatedAt: Value(DateTime.now())));
  }

  /// 保存正文：本地版本号 rev 自增（T07 语义：云端未确认前 baseRev 不动）。
  Future<void> updatePageContent(String id, String content) async {
    await transaction(() async {
      final row =
          await (select(pages)..where((t) => t.id.equals(id))).getSingle();
      await (update(pages)..where((t) => t.id.equals(id))).write(PagesCompanion(
        content: Value(content),
        updatedAt: Value(DateTime.now()),
        rev: Value(row.rev + 1),
      ));
    });
  }

  /// 读取单条页面（不存在返回 null）。
  Future<Page?> pageById(String id) {
    return (select(pages)..where((t) => t.id.equals(id))).getSingleOrNull();
  }

  /// 资源台账登记（幂等：同编号已存在则跳过）。
  Future<void> recordAsset(StoredAsset asset) async {
    await into(assets).insertOnConflictUpdate(AssetsCompanion.insert(
          id: asset.id,
          sha256: asset.sha256Hex,
          size: asset.size,
          ext: asset.ext,
          createdAt: DateTime.now(),
        ));
  }

  /// 页面挂载资源（幂等）。
  Future<void> attachAssetToPage(String pageId, String assetId) async {
    await into(pageAssets).insertOnConflictUpdate(PageAssetsCompanion.insert(
          pageId: pageId,
          assetId: assetId,
          createdAt: DateTime.now(),
        ));
  }

  /// 页面挂载的资源（按挂载顺序）。
  Future<List<Asset>> assetsForPage(String pageId) async {
    final query = select(assets).join([
      innerJoin(pageAssets, pageAssets.assetId.equalsExp(assets.id)),
    ])
      ..where(pageAssets.pageId.equals(pageId))
      ..orderBy([OrderingTerm.asc(pageAssets.sortKey)]);
    final rows = await query.get();
    return rows.map((r) => r.readTable(assets)).toList();
  }

  /// 草稿：每个键击即时写（崩溃恢复用），保存成功或正常退出后清除。
  Future<void> saveDraft(String pageId, String content) {
    return into(drafts).insertOnConflictUpdate(DraftsCompanion.insert(
          pageId: pageId,
          content: Value(content),
          updatedAt: DateTime.now(),
        ));
  }

  Future<Draft?> draftFor(String pageId) {
    return (select(drafts)..where((t) => t.pageId.equals(pageId))).getSingleOrNull();
  }

  Future<void> clearDraft(String pageId) {
    return (delete(drafts)..where((t) => t.pageId.equals(pageId))).go();
  }

  /// 取全部未删除页面（内存建树用；量级设计 ≤ 数千行）。
  Future<List<Page>> listAllActive() {
    return (select(pages)..where((t) => t.deleted.equals(false))).get();
  }

  /// 后代集合（含自身）——防循环校验用。
  Future<Set<String>> descendantIdsOf(String id) async {
    final all = await listAllActive();
    final childrenOf = <String, List<String>>{};
    for (final pg in all) {
      final pid = pg.parentId;
      if (pid != null) childrenOf.putIfAbsent(pid, () => []).add(pg.id);
    }
    final out = <String>{};
    final queue = <String>[id];
    while (queue.isNotEmpty) {
      final cur = queue.removeLast();
      if (out.contains(cur)) continue;
      out.add(cur);
      queue.addAll(childrenOf[cur] ?? const []);
    }
    return out;
  }

  /// 换父级（null=顶层）。防循环：目标不能是自身或自身子孙。
  Future<void> movePage(String id, String? newParentId) async {
    if (newParentId == id) {
      throw ArgumentError('不能把页面移动到它自己下面');
    }
    if (newParentId != null) {
      final descendants = await descendantIdsOf(id);
      if (descendants.contains(newParentId)) {
        throw ArgumentError('循环嵌套：目标页面是当前页面的子孙，已阻止');
      }
      final target =
          await (select(pages)..where((t) => t.id.equals(newParentId) & t.deleted.equals(false)))
              .getSingleOrNull();
      if (target == null) throw ArgumentError('目标页面不存在或已删除');
    }
    final nextSort = await _nextSiblingSortKey(newParentId);
    await (update(pages)..where((t) => t.id.equals(id))).write(PagesCompanion(
      parentId: Value(newParentId),
      sortKey: Value(nextSort),
      updatedAt: Value(DateTime.now()),
      rev: Value(1), // 结构变更也计入版本号（T07 同步语义）
    ));
  }

  Future<int> _nextSiblingSortKey(String? parentId) async {
    final rows = await (select(pages)
          ..where((t) => t.deleted.equals(false) & (parentId == null
              ? t.parentId.isNull()
              : t.parentId.equals(parentId))))
        .get();
    var max = 0;
    for (final r in rows) {
      if (r.sortKey > max) max = r.sortKey;
    }
    return max + 1;
  }

  /// 同辈排序：与相邻兄弟交换 sortKey（先规范化为 0..n-1 再交换）。
  Future<void> reorderSibling(String id, {required bool up}) async {
    final page = await (select(pages)..where((t) => t.id.equals(id))).getSingle();
    final pid = page.parentId;
    final siblings = await (select(pages)
          ..where((t) => t.deleted.equals(false) & (pid == null
              ? t.parentId.isNull()
              : t.parentId.equals(pid)))
          ..orderBy([
            (t) => OrderingTerm.asc(t.sortKey),
            (t) => OrderingTerm.asc(t.createdAt),
          ]))
        .get();
    final idx = siblings.indexWhere((s) => s.id == id);
    final neighborIdx = up ? (idx > 0 ? idx - 1 : -1) : (idx < siblings.length - 1 ? idx + 1 : -1);
    if (neighborIdx < 0) return; // 已在边界
    final neighbor = siblings[neighborIdx];
    await transaction(() async {
      // 先规范化 sortKey 为 0..n-1（新建页全是 0，直接交换会失效）
      for (var i = 0; i < siblings.length; i++) {
        if (siblings[i].sortKey != i) {
          await (update(pages)..where((t) => t.id.equals(siblings[i].id)))
              .write(PagesCompanion(sortKey: Value(i)));
        }
      }
      await (update(pages)..where((t) => t.id.equals(id))).write(PagesCompanion(
        sortKey: Value(neighborIdx),
        updatedAt: Value(DateTime.now()),
      ));
      await (update(pages)..where((t) => t.id.equals(neighbor.id))).write(PagesCompanion(
        sortKey: Value(idx),
        updatedAt: Value(DateTime.now()),
      ));
    });
  }

  /// 移入回收站（软删除）。
  Future<void> softDeletePage(String id) async {
    final now = DateTime.now();
    await (update(pages)..where((t) => t.id.equals(id))).write(PagesCompanion(
      deleted: Value(true),
      deletedAt: Value(now),
      updatedAt: Value(now),
    ));
  }

  /// 从回收站恢复。
  Future<void> restorePage(String id) async {
    await (update(pages)..where((t) => t.id.equals(id))).write(PagesCompanion(
      deleted: Value(false),
      deletedAt: const Value(null),
      updatedAt: Value(DateTime.now()),
    ));
  }

  /// 回收站列表（按删除时间倒序）。
  Future<List<Page>> listDeletedPages() {
    return (select(pages)
          ..where((t) => t.deleted.equals(true))
          ..orderBy([(t) => OrderingTerm.desc(t.deletedAt)]))
        .get();
  }

  /// 清空回收站（彻底删除软删除项及其挂载关系；资源本体因内容去重可能被其他页面共享，不删）。
  Future<int> emptyTrash() async {
    final dead = await (select(pages)..where((t) => t.deleted.equals(true))).get();
    if (dead.isEmpty) return 0;
    final ids = dead.map((d) => d.id).toList();
    var n = 0;
    await transaction(() async {
      for (final id in ids) {
        await (delete(pageAssets)..where((t) => t.pageId.equals(id))).go();
      }
      n = await (delete(pages)..where((t) => t.deleted.equals(true))).go();
    });
    return n;
  }
}

/// 数据库文件位置（与 drift_flutter 的 driftDatabase(name:) 默认目录一致）。
Future<File> appDbFile(String name) async {
  final dir = await getApplicationSupportDirectory();
  return File(p.join(dir.path, '$name.sqlite'));
}

/// 迁移/升级前的安全备份：复制 db 与 -wal/-shm 到同目录 backups/ 子目录。
/// P1-T08 的整库备份会在此基础扩展；这里保证「升级失败可回滚」。
Future<File?> backupDbFile(File dbFile) async {
  if (!dbFile.existsSync()) return null;
  final backupDir = Directory(p.join(dbFile.parent.path, 'backups'));
  if (!backupDir.existsSync()) backupDir.createSync(recursive: true);
  final stamp = DateTime.now().millisecondsSinceEpoch;
  final target = File(p.join(backupDir.path, '${p.basename(dbFile.path)}.$stamp.bak'));
  await dbFile.copy(target.path);
  for (final side in ['-wal', '-shm']) {
    final f = File(dbFile.path + side);
    if (f.existsSync()) await f.copy(File(target.path + side).path);
  }
  return target;
}
