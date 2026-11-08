import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart' hide Page;

import 'controllers/save_controller.dart';
import 'data/asset_store.dart';
import 'data/database.dart';
import 'data/diagnostics.dart';
import 'data/migration_demo.dart';
import 'data/save_state.dart';
import 'data/storage_stats.dart';

void main() {
  runApp(const BijiApp());
}

/// P1 阶段客户端。P1-T04：保存状态机（编辑中/已保存在本机/等待同步/保存失败/冲突预留）。
class BijiApp extends StatelessWidget {
  const BijiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '个人知识库',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF1d4ed8), useMaterial3: true),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final AppDatabase _db = AppDatabase();
  late final AssetStore _store = PlatformAssetStore(db: _db);
  Future<List<Page>>? _pages;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() => _pages = _db.listActivePages());
  }

  Future<void> _newPageDialog() async {
    final ctl = TextEditingController();
    final title = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('新建内容'),
        content: TextField(
          controller: ctl,
          autofocus: true,
          decoration: const InputDecoration(
              labelText: '标题', border: OutlineInputBorder(), hintText: '写点什么，比如「周会记录」'),
          onSubmitted: (v) => Navigator.pop(ctx, v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctl.text), child: const Text('保存')),
        ],
      ),
    );
    if (title == null) return;
    final page = await _db.createPage(title: title.trim().isEmpty ? '未命名' : title.trim());
    DiagnosticsLog.I.add('page.created', id: page.id);
    _reload();
    if (mounted) _openDetail(page);
  }

  void _openDetail(Page page) async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => NoteDetailPage(db: _db, store: _store, pageId: page.id)),
    );
    _reload();
  }

  Future<void> _migrationDemo() async {
    final messenger = ScaffoldMessenger.of(context);
    final report = await runMigrationDemo();
    messenger.showSnackBar(
      SnackBar(content: Text(report), duration: const Duration(seconds: 8)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('个人知识库'),
        // 迁移/回滚演示：依赖本地文件操作，网页端隐藏
        actions: [
          if (!kIsWeb)
            IconButton(
              tooltip: '迁移与回滚演示（独立演示库，不碰你的数据）',
              onPressed: _migrationDemo,
              icon: const Icon(Icons.science_outlined),
            ),
          IconButton(
            tooltip: '回收站',
            onPressed: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => TrashPage(db: _db)),
              );
              _reload();
            },
            icon: const Icon(Icons.delete),
          ),
          IconButton(
            tooltip: '设置',
            onPressed: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => SettingsPage(db: _db)),
              );
            },
            icon: const Icon(Icons.settings_outlined),
          ),
        ],
      ),
      body: FutureBuilder<List<Page>>(
        future: _pages,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(child: Text('数据库读取失败：${snap.error}'));
          }
          final pages = snap.data ?? const <Page>[];
          if (pages.isEmpty) {
            return const Center(
              child: Text('还没有内容，点右下角 + 新建一条\n（重启应用后它应该还在）',
                  textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
            );
          }
          return ListView.separated(
            itemCount: pages.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final pg = pages[i];
              return ListTile(
                leading: const Icon(Icons.description_outlined),
                title: Text(pg.title.isEmpty ? '（无标题）' : pg.title),
                subtitle: Text('建于 ${pg.createdAt.toLocal()}'.substring(0, 24)),
                onTap: () => _openDetail(pg),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _newPageDialog,
        tooltip: '新建内容',
        child: const Icon(Icons.add),
      ),
    );
  }
}

/// 笔记详情：正文编辑 + 保存状态灯（P1-T04）+ 图片挂载（P1-T03）。
class NoteDetailPage extends StatefulWidget {
  const NoteDetailPage({
    super.key,
    required this.db,
    required this.store,
    required this._pageId,
  });

  final AppDatabase db;
  final AssetStore store;
  final String _pageId;

  @override
  State<NoteDetailPage> createState() => _NoteDetailPageState();
}

class _NoteDetailPageState extends State<NoteDetailPage> {
  late final SaveController _save;
  late final TextEditingController _contentCtl;
  Page? _page;
  Draft? _draft; // 崩溃恢复草稿（非空时顶部出恢复条）
  bool _faultOn = false;
  bool _busyImages = false;
  bool _loadingContent = true;
  Future<List<Asset>>? _assets;

  @override
  void initState() {
    super.initState();
    _contentCtl = TextEditingController();
    _save = SaveController(
      write: _writeContent,
      draftWrite: (c) => widget.db.saveDraft(widget._pageId, c), // 键击即时进草稿
      draftClear: () => widget.db.clearDraft(widget._pageId), // 主库落盘成功即清
    );
    _contentCtl.addListener(_onEdited);
    _loadPage();
  }

  Future<void> _loadPage() async {
    final page = await widget.db.pageById(widget._pageId);
    final draft = await widget.db.draftFor(widget._pageId);
    if (!mounted) return;
    setState(() {
      _page = page;
      _loadingContent = true;
      _contentCtl.text = page?.content ?? ''; // 程序化赋值：守卫避免误标脏
      _assets = widget.db.assetsForPage(widget._pageId);
      // 崩溃恢复：草稿存在且与正文不同 → 显示恢复条
      _draft = (draft != null &&
              draft.content.isNotEmpty &&
              draft.content != (page?.content ?? ''))
          ? draft
          : null;
    });
    _loadingContent = false;
    _save.markSaved(page?.content ?? ''); // 基准对齐：防止幽灵保存空跳 rev
  }

  Future<void> _restoreDraft() async {
    final d = _draft;
    if (d == null) return;
    setState(() {
      _loadingContent = true;
      _contentCtl.text = d.content;
      _draft = null;
    });
    _loadingContent = false;
    DiagnosticsLog.I.add('draft.restored', id: widget._pageId);
    _save.editText(d.content); // 走正常保存链（成功后草稿由钩子清除）
  }

  Future<void> _discardDraft() async {
    await widget.db.clearDraft(widget._pageId);
    if (!mounted) return;
    setState(() => _draft = null);
  }

  Future<void> _writeContent(String content) async {
    if (_faultOn) {
      DiagnosticsLog.I.add('content.saveFailed', id: widget._pageId, error: '故障注入：模拟写盘失败');
      throw Exception('故障注入：模拟写盘失败');
    }
    await widget.db.updatePageContent(widget._pageId, content);
    // 脱敏口径：只记字数，不记正文
    DiagnosticsLog.I.add('content.saved', id: widget._pageId, count: content.length);
  }

  void _onEdited() {
    if (_loadingContent) return; // 程序化赋值不算编辑
    _save.editText(_contentCtl.text);
  }

  void _reloadImages() {
    setState(() => _assets = widget.db.assetsForPage(widget._pageId));
  }

  Future<void> _pickAndSaveImage() async {
    if (_busyImages) return;
    setState(() => _busyImages = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final files = await FilePicker.pickFiles(type: FileType.image);
      if (files.isEmpty) return;
      final file = files.single;
      final ext = (file.extension ?? '').toLowerCase();
      if (!assetExtWhitelist.contains(ext)) {
        messenger.showSnackBar(SnackBar(content: Text('不支持的图片类型: .$ext（只收 ${assetExtWhitelist.join('/')}）')));
        return;
      }
      // 三端统一拿字节：内容定编号，与来源路径无关
      final bytes = await file.readAsBytes();
      final stored = await widget.store.save(bytes, ext);
      await widget.db.recordAsset(stored);
      await widget.db.attachAssetToPage(widget._pageId, stored.id);
      DiagnosticsLog.I.add('asset.saved', id: stored.id, count: bytes.length);
      _reloadImages();
      messenger.showSnackBar(SnackBar(content: Text('已存为本机副本：编号 ${stored.id}（${stored.size} 字节）')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('保存失败：$e')));
    } finally {
      if (mounted) setState(() => _busyImages = false);
    }
  }

  Future<void> _renameDialog() async {
    final page = _page;
    if (page == null) return;
    final ctl = TextEditingController(text: page.title);
    final title = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('重命名'),
        content: TextField(
          controller: ctl,
          autofocus: true,
          decoration: const InputDecoration(border: OutlineInputBorder(), labelText: '标题'),
          onSubmitted: (v) => Navigator.pop(ctx, v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctl.text), child: const Text('确定')),
        ],
      ),
    );
    if (title == null || title.trim().isEmpty) return;
    await widget.db.renamePage(widget._pageId, title.trim());
    if (!mounted) return;
    setState(() => _page = null); // 触发重载
    await _loadPage();
  }

  @override
  void dispose() {
    // 退出页面前把未落盘的编辑冲掉（fire-and-forget，数据库是全局单例不会丢）
    _save.flush();
    _save.disposeTimer();
    _save.dispose();
    _contentCtl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final page = _page;
    if (page == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      appBar: AppBar(
        title: GestureDetector(onTap: _renameDialog, child: Text(page.title.isEmpty ? '（无标题）' : page.title)),
        actions: [
          AnimatedBuilder(
            animation: _save,
            builder: (context, _) => _StatusChip(status: _save.status),
          ),
          IconButton(
            tooltip: '移入回收站（可恢复）',
            onPressed: () async {
              final messenger = ScaffoldMessenger.of(context);
              final nav = Navigator.of(context);
              await widget.db.softDeletePage(widget._pageId);
              await widget.db.clearDraft(widget._pageId);
              DiagnosticsLog.I.add('page.trashed', id: widget._pageId);
              if (!mounted) return;
              messenger.showSnackBar(const SnackBar(content: Text('已移入回收站')));
              if (nav.canPop()) nav.pop();
            },
            icon: const Icon(Icons.delete),
          ),
          IconButton(
            tooltip: _faultOn ? '故障注入已开：下一次保存将失败（再点关闭）' : '故障注入：模拟写盘失败（演示"不假报已保存"）',
            onPressed: () => setState(() => _faultOn = !_faultOn),
            icon: Icon(_faultOn ? Icons.bug_report : Icons.bug_report_outlined,
                color: _faultOn ? Colors.red : null),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          if (_draft != null)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                border: Border.all(color: Colors.orange.shade300),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(
                  '检测到上次未保存的草稿（${_draft!.updatedAt.toLocal()}）——可能是异常退出所致',
                  style: TextStyle(fontSize: 13, color: Colors.orange.shade900),
                ),
                const SizedBox(height: 4),
                Text(
                  _draft!.content.length > 60 ? '${_draft!.content.substring(0, 60)}…' : _draft!.content,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                ),
                const SizedBox(height: 8),
                Row(children: [
                  FilledButton(
                    onPressed: _restoreDraft,
                    child: const Text('恢复草稿'),
                  ),
                  const SizedBox(width: 8),
                  TextButton(
                    onPressed: _discardDraft,
                    child: const Text('丢弃'),
                  ),
                ]),
              ]),
            ),
          TextField(
            controller: _contentCtl,
            maxLines: null,
            minLines: 6,
            keyboardType: TextInputType.multiline,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              hintText: '写点什么…（停顿约一秒自动保存到本机）',
            ),
          ),
          const SizedBox(height: 12),
          Row(children: [
            FilledButton.tonalIcon(
              onPressed: _busyImages ? null : _pickAndSaveImage,
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: const Text('添加图片'),
            ),
            const SizedBox(width: 12),
            if (_busyImages)
              const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
          ]),
          const SizedBox(height: 12),
          FutureBuilder<List<Asset>>(
            future: _assets,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator());
              }
              final assets = snap.data ?? const <Asset>[];
              if (assets.isEmpty) {
                return const Text('还没有图片。点上面「添加图片」选一张——\n它会被复制成本机副本（按内容指纹编号），删掉原图也不影响。',
                    style: TextStyle(color: Colors.grey));
              }
              return Column(
                children: [
                  for (final a in assets) ...[
                    _AssetView(store: widget.store, asset: a),
                    const SizedBox(height: 12),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

/// 回收站（P1-T06）：软删除列表、单条恢复、清空（强确认）。
class TrashPage extends StatefulWidget {
  const TrashPage({super.key, required this.db});

  final AppDatabase db;

  @override
  State<TrashPage> createState() => _TrashPageState();
}

class _TrashPageState extends State<TrashPage> {
  Future<List<Page>>? _deleted;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() => _deleted = widget.db.listDeletedPages());
  }

  Future<void> _restore(Page page) async {
    await widget.db.restorePage(page.id);
    DiagnosticsLog.I.add('page.restored', id: page.id);
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text('「${page.title.isEmpty ? '无标题' : page.title}」已恢复')));
    _reload();
  }

  Future<void> _emptyConfirm(int count) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('清空回收站？'),
        content: Text('将彻底删除 $count 条内容，此操作不可恢复。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('彻底删除'),
          ),
        ],
      ),
    );
    if (yes != true) return;
    final n = await widget.db.emptyTrash();
    DiagnosticsLog.I.add('trash.emptied', count: n);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('已彻底删除 $n 条')));
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('回收站'),
        actions: [
          FutureBuilder<List<Page>>(
            future: _deleted,
            builder: (context, snap) {
              final n = snap.data?.length ?? 0;
              return TextButton(
                onPressed: n == 0 ? null : () => _emptyConfirm(n),
                child: Text('清空 ($n)'),
              );
            },
          ),
        ],
      ),
      body: FutureBuilder<List<Page>>(
        future: _deleted,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final pages = snap.data ?? const <Page>[];
          if (pages.isEmpty) {
            return const Center(
              child: Text('回收站是空的。\n删除的内容会先到这里，可随时恢复。',
                  textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
            );
          }
          return ListView.separated(
            itemCount: pages.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final pg = pages[i];
              return ListTile(
                leading: const Icon(Icons.delete_outline),
                title: Text(pg.title.isEmpty ? '（无标题）' : pg.title),
                subtitle: Text(
                    '删除于 ${pg.deletedAt == null ? '未知时间' : pg.deletedAt!.toLocal().toString().substring(0, 16)}'),
                trailing: TextButton.icon(
                  onPressed: () => _restore(pg),
                  icon: const Icon(Icons.restore, size: 18),
                  label: const Text('恢复'),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

/// 设置页（P1-T07）：存储占用 + 诊断日志（出厂脱敏，不含正文与密钥）。
class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key, required this.db});

  final AppDatabase db;

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  int _rev = 0; // 清空日志后强制刷新

  @override
  Widget build(BuildContext context) {
    final diag = DiagnosticsLog.I;
    return Scaffold(
      appBar: AppBar(title: const Text('设置')),
      body: ListView(padding: const EdgeInsets.all(12), children: [
        Text('存储占用', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        FutureBuilder<StorageStats>(
          future: collectStorageStats(widget.db),
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const LinearProgressIndicator();
            }
            if (snap.hasError) return Text('读取失败：${snap.error}');
            final s = snap.data!;
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(children: [
                  _kv('数据库', s.dbLabel),
                  _kv('图片副本', s.assetsLabel),
                  _kv('页面数', '${s.pagesCount}'),
                  _kv('资源数', '${s.assetsCount}'),
                  _kv('待恢复草稿', '${s.draftsCount}'),
                ]),
              ),
            );
          },
        ),
        const Divider(height: 24),
        Row(children: [
          Expanded(
            child: Text('诊断日志（已脱敏：不含正文与密钥，仅编号/计数）',
                style: Theme.of(context).textTheme.titleSmall),
          ),
          TextButton(
            onPressed: () {
              diag.clear();
              setState(() => _rev++);
            },
            child: const Text('清空日志'),
          ),
        ]),
        Card(
          key: ValueKey(_rev),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Builder(builder: (_) {
              final lines = diag.latest();
              if (lines.isEmpty) {
                return const Text('暂无日志。正常使用会记录：保存成功/失败、图片入库、删除恢复等事件（只含编号与计数）。',
                    style: TextStyle(color: Colors.grey, fontSize: 12));
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final line in lines)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Text(line,
                          style: const TextStyle(fontSize: 11, fontFamily: 'monospace')),
                    ),
                  if (diag.droppedCount > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('（已滚动丢弃 ${diag.droppedCount} 条更早日志）',
                          style: const TextStyle(fontSize: 11, color: Colors.grey)),
                    ),
                ],
              );
            }),
          ),
        ),
      ]),
    );
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(k, style: const TextStyle(fontSize: 13)),
        Text(v, style: const TextStyle(fontSize: 13, color: Colors.grey)),
      ]),
    );
  }
}

/// 保存状态灯：五态文案 + 颜色（红=绝不假报已保存）。
class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final SaveStatus status;

  @override
  Widget build(BuildContext context) {
    final (color, icon) = switch (status) {
      SaveStatus.editing => (Colors.grey.shade600, Icons.edit_outlined),
      SaveStatus.savedLocal => (Colors.green.shade700, Icons.check_circle),
      SaveStatus.pendingSync => (Colors.green.shade700, Icons.check_circle_outline),
      SaveStatus.saveFailed => (Colors.red.shade700, Icons.error_outline),
      SaveStatus.conflict => (Colors.orange.shade800, Icons.warning_amber),
    };
    return Padding(
      padding: const EdgeInsets.only(right: 4),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 4),
        Text(
          saveStatusLabel(status),
          style: TextStyle(fontSize: 12, color: color),
          overflow: TextOverflow.ellipsis,
        ),
      ]),
    );
  }
}

/// 单张资源：从本机副本读取展示；顺带做完整性校验（与台账哈希不符给出警示）。
class _AssetView extends StatefulWidget {
  const _AssetView({required this.store, required this.asset});

  final AssetStore store;
  final Asset asset;

  @override
  State<_AssetView> createState() => _AssetViewState();
}

class _AssetViewState extends State<_AssetView> {
  List<int>? _bytes;
  String? _error;
  bool _intact = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final bytes = await widget.store.read(widget.asset.id, widget.asset.ext);
    final intact = bytes != null && await widget.store.verify(widget.asset.id, widget.asset.ext, widget.asset.sha256);
    if (!intact) DiagnosticsLog.I.add('asset.integrityFail', id: widget.asset.id);
    if (!mounted) return;
    setState(() {
      _bytes = bytes;
      _intact = intact;
      if (bytes == null) _error = '本机副本缺失';
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(border: Border.all(color: Colors.red.shade300), borderRadius: BorderRadius.circular(8)),
        child: Text('⚠ $_error（编号 ${widget.asset.id}）', style: const TextStyle(color: Colors.red)),
      );
    }
    if (_bytes == null) return const Center(child: CircularProgressIndicator());
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 320),
          child: Image.memory(Uint8List.fromList(_bytes!), fit: BoxFit.contain),
        ),
      ),
      const SizedBox(height: 4),
      Text(
        _intact ? '编号 ${widget.asset.id} · 完整性校验通过' : '⚠ 编号 ${widget.asset.id} · 副本与台账哈希不符，可能被篡改',
        style: TextStyle(fontSize: 12, color: _intact ? Colors.grey : Colors.red),
      ),
    ]);
  }
}
