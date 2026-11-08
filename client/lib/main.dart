import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart' hide Page;

import 'controllers/save_controller.dart';
import 'data/asset_store.dart';
import 'data/database.dart';
import 'data/diagnostics.dart';
import 'data/migration_demo.dart';
import 'data/pages_table.dart';
import 'data/save_state.dart';
import 'data/storage_stats.dart';
import 'editor/block_model.dart';
import 'editor/blocks_editor.dart';
import 'table/table_model.dart';
import 'table/table_view.dart';

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
  Future<List<Page>>? _all;
  final Set<String> _collapsed = {}; // 页面树折叠状态（默认全展开）
  static const double _wideBreakpoint = 900; // ≥ 此宽度用左右分栏
  String? _selectedId; // 分栏模式下当前选中的页面
  bool _detailFullPage = false; // 整页切换（隐藏左侧树）

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    // 块体而非箭头：箭头会把赋值表达式的 Future 当返回值，debug 下触发 setState 红屏
    setState(() {
      _all = _db.listAllActive();
    });
  }

  Future<void> _newPageDialog() async {
    final result = await _showCreateDialog(dialogTitle: '新建内容');
    if (result == null) return;
    final page = await _db.createPage(
        title: result.title.trim().isEmpty ? '未命名' : result.title.trim(),
        type: result.type);
    DiagnosticsLog.I.add('page.created', id: page.id);
    _reload();
    if (mounted) _openDetail(page);
  }

  /// 新建内容对话框（V2.1 ①）：标题 + 类型选择（普通页面 / 多维表）。
  Future<({String title, String type})?> _showCreateDialog(
      {required String dialogTitle}) async {
    final ctl = TextEditingController();
    String type = PageTypes.page;
    if (!mounted) return null;
    return showDialog<({String title, String type})>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(dialogTitle),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: ctl,
                autofocus: true,
                decoration: const InputDecoration(
                    labelText: '标题', border: OutlineInputBorder(), hintText: '写点什么，比如「周会记录」'),
                onSubmitted: (v) => Navigator.pop(ctx, (title: v, type: type)),
              ),
              const SizedBox(height: 14),
              Text('类型', style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
              const SizedBox(height: 6),
              Row(children: [
                Expanded(
                  child: _TypeCard(
                    selected: type == PageTypes.page,
                    icon: Icons.description_outlined,
                    name: '页面',
                    desc: '写笔记、文档',
                    onTap: () => setDialogState(() => type = PageTypes.page),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _TypeCard(
                    selected: type == PageTypes.table,
                    icon: Icons.grid_on,
                    name: '多维表',
                    desc: '像表格一样管理记录',
                    onTap: () => setDialogState(() => type = PageTypes.table),
                  ),
                ),
              ]),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, (title: ctl.text, type: type)),
              child: const Text('创建'),
            ),
          ],
        ),
      ),
    );
  }

  void _openDetail(Page page) {
    final wide = MediaQuery.of(context).size.width >= _wideBreakpoint;
    if (wide) {
      // 分栏：右侧面板内嵌打开（树保持挂载，展开与滚动位置天然保留）
      setState(() {
        _selectedId = page.id;
        _detailFullPage = false;
      });
    } else {
      Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) => NoteDetailPage(db: _db, store: _store, pageId: page.id)),
      ).then((_) => _reload());
    }
  }

  Future<void> _migrationDemo() async {
    final messenger = ScaffoldMessenger.of(context);
    final report = await runMigrationDemo();
    messenger.showSnackBar(
      SnackBar(content: Text(report), duration: const Duration(seconds: 8)),
    );
  }

  /// 递归生成树节点列表。
  List<Widget> _buildNodes(Map<String?, List<Page>> byParent, String? parent, int depth) {
    final out = <Widget>[];
    for (final pg in byParent[parent] ?? const <Page>[]) {
      final hasChildren = (byParent[pg.id] ?? []).isNotEmpty;
      out.add(_nodeTile(context, pg, depth, hasChildren, byParent));
      if (hasChildren && !_collapsed.contains(pg.id)) {
        out.addAll(_buildNodes(byParent, pg.id, depth + 1));
      }
    }
    return out;
  }

  /// 单个树节点：展开/折叠 + 菜单（子页面/移动到/上移/下移）+ 长按拖拽换父。
  Widget _nodeTile(BuildContext context, Page pg, int depth, bool hasChildren,
      Map<String?, List<Page>> byParent) {
    final collapsed = _collapsed.contains(pg.id);
    final isTable = pg.type == PageTypes.table;
    final tile = ListTile(
      contentPadding: EdgeInsets.only(left: 8 + depth * 22.0, right: 4),
      leading: GestureDetector(
        onTap: hasChildren
            ? () => setState(() {
                  collapsed ? _collapsed.remove(pg.id) : _collapsed.add(pg.id);
                })
            : null,
        child: Icon(
          hasChildren
              ? (collapsed ? Icons.expand_more : Icons.expand_less)
              : (isTable ? Icons.grid_on : Icons.description_outlined),
          color: hasChildren ? null : (isTable ? Colors.blue.shade700 : Colors.grey),
        ),
      ),
      title: Row(children: [
        if (hasChildren && isTable)
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: Icon(Icons.grid_on, size: 15, color: Colors.blue.shade700),
          ),
        Expanded(child: Text(pg.title.isEmpty ? '（无标题）' : pg.title)),
      ]),
      subtitle: Text('建于 ${pg.createdAt.toLocal()}'.substring(0, 24)),
      onTap: () => _openDetail(pg),
      trailing: PopupMenuButton<String>(
        onSelected: (v) => _onNodeMenu(pg, v),
        itemBuilder: (_) => const [
          PopupMenuItem(value: 'child', child: Text('添加子页面')),
          PopupMenuItem(value: 'move', child: Text('移动到…')),
          PopupMenuItem(value: 'up', child: Text('上移')),
          PopupMenuItem(value: 'down', child: Text('下移')),
        ],
      ),
    );

    final draggable = LongPressDraggable<Page>(
      data: pg,
      dragAnchorStrategy: pointerDragAnchorStrategy,
      feedback: Material(
        elevation: 4,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Text(pg.title.isEmpty ? '（无标题）' : pg.title,
              style: const TextStyle(fontSize: 13)),
        ),
      ),
      childWhenDragging: Opacity(opacity: 0.35, child: tile),
      child: tile,
    );

    return DragTarget<Page>(
      onWillAcceptWithDetails: (d) => d.data.id != pg.id,
      onAcceptWithDetails: (d) => _movePageTo(d.data, pg.id),
      builder: (context, candidate, _) => Container(
        decoration: candidate.isNotEmpty
            ? BoxDecoration(color: Colors.blue.shade50, border: Border.all(color: Colors.blue.shade300))
            : null,
        child: draggable,
      ),
    );
  }

  Future<void> _onNodeMenu(Page pg, String action) async {
    final messenger = ScaffoldMessenger.of(context);
    switch (action) {
      case 'child':
        final result = await _showCreateDialog(
            dialogTitle: '在「${pg.title.isEmpty ? '无标题' : pg.title}」下新建');
        if (result == null) return;
        final created = await _db.createPage(
            title: result.title.trim().isEmpty ? '未命名' : result.title.trim(),
            parentId: pg.id,
            type: result.type);
        DiagnosticsLog.I.add('page.created', id: created.id);
        _reload();
        break;
      case 'move':
        await _showMoveDialog(pg);
        _reload();
        break;
      case 'up':
        await _db.reorderSibling(pg.id, up: true);
        _reload();
        break;
      case 'down':
        await _db.reorderSibling(pg.id, up: false);
        _reload();
        break;
    }
    messenger; // keep analyzer quiet about unused capture
  }

  Future<void> _movePageTo(Page page, String? newParentId) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await _db.movePage(page.id, newParentId);
      DiagnosticsLog.I.add('page.moved', id: page.id);
      _reload();
      messenger.showSnackBar(const SnackBar(content: Text('已移动')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(
        content: Text('已阻止：${e.toString().replaceAll('ArgumentError: ', '')}'),
        backgroundColor: Colors.red.shade700,
      ));
    }
  }

  /// 「移动到…」对话框：树形列出候选目标（排除自身与子孙）+ 顶层选项。
  Future<void> _showMoveDialog(Page page) async {
    final all = await _db.listAllActive();
    final excluded = await _db.descendantIdsOf(page.id); // 含自身
    final byParent = <String?, List<Page>>{};
    for (final pg in all) {
      if (excluded.contains(pg.id)) continue;
      if (pg.type == PageTypes.record) continue; // 记录页不可作为移动目标
      byParent.putIfAbsent(pg.parentId, () => []).add(pg);
    }
    for (final list in byParent.values) {
      list.sort((a, b) => a.sortKey.compareTo(b.sortKey));
    }

    if (!mounted) return;
    final target = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('移动到…'),
        content: SizedBox(
          width: 320,
          height: 360,
          child: ListView(children: [
            ListTile(
              leading: const Icon(Icons.vertical_align_top),
              title: const Text('顶层（无父级）'),
              onTap: () => Navigator.pop(ctx, ''),
            ),
            for (final pg in _flatten(byParent, null, 0))
              ListTile(
                contentPadding: EdgeInsets.only(left: 8 + pg.$2 * 22.0, right: 8),
                leading: const Icon(Icons.subdirectory_arrow_right, size: 18),
                title: Text(pg.$1.title.isEmpty ? '（无标题）' : pg.$1.title,
                    style: const TextStyle(fontSize: 13)),
                onTap: () => Navigator.pop(ctx, pg.$1.id),
              ),
          ]),
        ),
      ),
    );
    if (target == null) return;
    await _movePageTo(page, target.isEmpty ? null : target);
  }

  List<(Page, int)> _flatten(Map<String?, List<Page>> byParent, String? parent, int depth) {
    final out = <(Page, int)>[];
    for (final pg in byParent[parent] ?? const <Page>[]) {
      out.add((pg, depth));
      out.addAll(_flatten(byParent, pg.id, depth + 1));
    }
    return out;
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
        future: _all,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(child: Text('数据库读取失败：${snap.error}'));
          }
          final pages = snap.data ?? const <Page>[];
          final wide = MediaQuery.of(context).size.width >= _wideBreakpoint;

          // 内存建树：parentId 分组、同辈按 sortKey/创建时间排序
          final byParent = <String?, List<Page>>{};
          for (final pg in pages) {
            if (pg.type == PageTypes.record) continue; // 记录页不入树（表格视图是唯一入口）
            byParent.putIfAbsent(pg.parentId, () => []).add(pg);
          }
          for (final list in byParent.values) {
            list.sort((a, b) {
              final c = a.sortKey.compareTo(b.sortKey);
              return c != 0 ? c : a.createdAt.compareTo(b.createdAt);
            });
          }

          Widget treeList() {
            return ListView(
              key: const PageStorageKey('tree-scroll'), // 保留滚动位置
              children: [
                ..._buildNodes(byParent, null, 0),
                const SizedBox(height: 80),
                const Center(
                  child: Text('提示：长按页面拖到另一页上＝变成它的子页面；\n也可用每行右侧菜单「移动到…」。父页面拖进子孙会被阻止。',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey, fontSize: 12)),
                ),
              ],
            );
          }

          if (pages.isEmpty) {
            return const Center(
              child: Text('还没有内容，点右下角 + 新建一条\n（重启应用后它应该还在）',
                  textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
            );
          }

          // 窄屏（手机）：整页树（详情走路由跳转）
          if (!wide) return treeList();

          // 宽屏：左右分栏；整页切换时只显示详情
          if (wide && _selectedId != null && _detailFullPage) {
            return NoteDetailPage(
              key: ValueKey(_selectedId),
              db: _db,
              store: _store,
              pageId: _selectedId!,
              embedded: true,
              fullPage: true,
              onClosed: () => setState(() {
                _selectedId = null;
                _detailFullPage = false;
                _reload(); // 关闭/删除后刷新树（含回收站变动）
              }),
              onToggleFullPage: () => setState(() => _detailFullPage = false),
            );
          }
          return Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(width: 340, child: treeList()),
              const VerticalDivider(width: 1),
              Expanded(
                child: _selectedId == null
                    ? Center(
                        child: Text('在左侧选择一个页面\n或点右下角 + 新建',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.grey)),
                      )
                    : NoteDetailPage(
                        key: ValueKey(_selectedId),
                        db: _db,
                        store: _store,
                        pageId: _selectedId!,
                        embedded: true,
                        fullPage: false,
                        onClosed: () => setState(() {
                          _selectedId = null;
                          _detailFullPage = false;
                          _reload(); // 关闭/删除后刷新树
                        }),
                        onToggleFullPage: () =>
                            setState(() => _detailFullPage = true),
                      ),
              ),
            ],
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
/// V2.1 ①：按页面类型分支——普通页面进块编辑器（空页面出类型选择器），多维表进表格视图。
/// [embedded]=true 时作为分栏面板内嵌（右上角多「整页切换」与「关闭」），false 时整页路由。
class NoteDetailPage extends StatefulWidget {
  const NoteDetailPage({
    super.key,
    required this.db,
    required this.store,
    required this._pageId,
    this.embedded = false,
    this.onClosed,
    this.onToggleFullPage,
    this.fullPage = false,
    this.onTypeChanged,
  });

  final AppDatabase db;
  final AssetStore store;
  final String _pageId;
  final bool embedded;
  final VoidCallback? onClosed;
  final VoidCallback? onToggleFullPage;
  final bool fullPage;

  /// 页面类型变化（空页面转多维表）后通知外层刷新树图标。
  final VoidCallback? onTypeChanged;

  @override
  State<NoteDetailPage> createState() => _NoteDetailPageState();
}

class _NoteDetailPageState extends State<NoteDetailPage> {
  late final SaveController _save;
  String? _editorContent; // 传给块编辑器的内容（页面载入/草稿恢复时更新）
  Page? _page;
  Draft? _draft; // 崩溃恢复草稿（非空时顶部出恢复条）
  bool _faultOn = false;
  bool _busyImages = false;
  bool _typePickerDismissed = false; // 空页面类型选择器被「写笔记」手动收起
  Future<List<Asset>>? _assets;

  @override
  void initState() {
    super.initState();
    _save = SaveController(
      write: _writeContent,
      draftWrite: (c) => widget.db.saveDraft(widget._pageId, c), // 键击即时进草稿
      draftClear: () => widget.db.clearDraft(widget._pageId), // 主库落盘成功即清
    );
    _loadPage();
  }

  Future<void> _loadPage() async {
    final page = await widget.db.pageById(widget._pageId);
    final draft = await widget.db.draftFor(widget._pageId);
    if (!mounted) return;
    setState(() {
      _page = page;
      _editorContent = page?.content ?? '';
      _assets = widget.db.assetsForPage(widget._pageId);
      // 崩溃恢复：草稿存在且与正文不同 → 显示恢复条
      _draft = (draft != null &&
              draft.content.isNotEmpty &&
              draft.content != (page?.content ?? ''))
          ? draft
          : null;
    });
    // 基准对齐用序列化后的形态（编辑器 onChanged 回传的即此形态），防幽灵保存
    _save.markSaved(_normalizedBaseline(page));
  }

  /// 保存基准按页面类型取对应序列化形态（普通页=块 JSON；多维表=表 JSON）。
  String _normalizedBaseline(Page? page) {
    if (page == null) return '';
    if (page.type == PageTypes.table) {
      return encodeTable(decodeTable(page.content));
    }
    return encodeBlocks(decodeBlocks(page.content));
  }

  Future<void> _restoreDraft() async {
    final d = _draft;
    if (d == null) return;
    setState(() => _editorContent = d.content);
    DiagnosticsLog.I.add('draft.restored', id: widget._pageId);
    _save.editText(d.content); // 走正常保存链（成功后草稿由钩子清除）
  }

  Future<void> _discardDraft() async {
    await widget.db.clearDraft(widget._pageId);
    if (!mounted) return;
    setState(() => _draft = null);
  }

  /// 空页面类型选择器的显示条件（V2.1 ①）：普通页面 + 无草稿 + 正文只有空段落。
  bool _showTypePicker(Page page) {
    if (_typePickerDismissed || _draft != null) return false;
    if (page.type != PageTypes.page) return false;
    return decodeBlocks(page.content).every((b) => b.type == BlockType.p && b.text.trim().isEmpty);
  }

  /// 空普通页面 → 多维表（内容本来就空，无损失）。
  Future<void> _convertToTable() async {
    await widget.db.setPageType(widget._pageId, PageTypes.table);
    DiagnosticsLog.I.add('page.typeChanged', id: widget._pageId);
    if (!mounted) return;
    setState(() => _page = null);
    await _loadPage();
    widget.onTypeChanged?.call();
  }

  /// 打开记录详情页（③）：未物化的行先建记录页并回写 pid（走表格自己的保存链）。
  Future<void> _openRecord(Page tablePage, TableRowData row) async {
    final t = decodeTable(_editorContent ?? '');
    var pid = row.pid ?? '';
    if (pid.isEmpty) {
      final primary = row.cells[t.cols.first.id] ?? '';
      final rec = await widget.db.createPage(
        title: primary.trim().isEmpty ? '未命名记录' : primary.trim(),
        parentId: tablePage.id,
        type: PageTypes.record,
      );
      final json = encodeTable(setRowPid(t, row.id, rec.id));
      if (!mounted) return;
      setState(() => _editorContent = json);
      _save.editText(json); // pid 持久化（走表格保存链）
      pid = rec.id;
      DiagnosticsLog.I.add('record.materialized', id: rec.id);
    }
    if (!mounted) return;
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => RecordDetailPage(db: widget.db, pageId: pid)),
    );
    // 返回后行数据可能有批注引起的变化；表格 JSON 不变，无需重载
  }

  /// 崩溃恢复草稿条（普通页/多维表共用：表 JSON 草稿同样可恢复）。
  Widget _draftBanner() {
    final d = _draft!;
    return _DraftBanner(
      draft: d,
      onRestore: _restoreDraft,
      onDiscard: _discardDraft,
    );
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

  void _reloadImages() {
    setState(() {
      _assets = widget.db.assetsForPage(widget._pageId);
    });
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
        leading: widget.embedded
            ? IconButton(
                tooltip: '关闭（树上的位置与展开状态保留）',
                onPressed: widget.onClosed,
                icon: const Icon(Icons.close),
              )
            : null,
        title: GestureDetector(
          onTap: _renameDialog,
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (page.type == PageTypes.table)
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: Icon(Icons.grid_on, size: 18, color: Colors.blue.shade700),
              ),
            Flexible(child: Text(page.title.isEmpty ? '（无标题）' : page.title)),
          ]),
        ),
        actions: [
          AnimatedBuilder(
            animation: _save,
            builder: (context, _) => _StatusChip(status: _save.status),
          ),
          if (widget.embedded)
            IconButton(
              tooltip: widget.fullPage ? '退出整页，回到左右分栏' : '整页切换（隐藏左侧树）',
              onPressed: widget.onToggleFullPage,
              icon: Icon(widget.fullPage ? Icons.fullscreen_exit : Icons.fullscreen),
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
              if (widget.embedded) {
                widget.onClosed?.call();
              } else if (nav.canPop()) {
                nav.pop();
              }
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
      body: page.type == PageTypes.table
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_draft != null) _draftBanner(),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: TablePageView(
                      initialContent: _editorContent ?? '',
                      onChanged: (serialized) => _save.editText(serialized),
                      onOpenRecord: (row) => _openRecord(page, row),
                    ),
                  ),
                ),
              ],
            )
          : ListView(
        padding: const EdgeInsets.all(12),
        children: [
          if (_draft != null) _draftBanner(),
          if (_showTypePicker(page))
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _EmptyPageTypePicker(
                onPickNote: () => setState(() => _typePickerDismissed = true),
                onPickTable: _convertToTable,
              ),
            ),
          BlocksEditor(
            initialContent: _editorContent ?? '',
            onChanged: (serialized) => _save.editText(serialized),
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

/// 新建对话框里的类型卡片（V2.1 ①）：普通页面 / 多维表 二选一。
class _TypeCard extends StatelessWidget {
  const _TypeCard({
    required this.selected,
    required this.icon,
    required this.name,
    required this.desc,
    required this.onTap,
  });

  final bool selected;
  final IconData icon;
  final String name;
  final String desc;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final border = selected ? Colors.blue.shade600 : Colors.grey.shade300;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          border: Border.all(color: border, width: selected ? 2 : 1),
          borderRadius: BorderRadius.circular(8),
          color: selected ? Colors.blue.shade50 : null,
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 22, color: selected ? Colors.blue.shade700 : Colors.grey.shade700),
          const SizedBox(height: 6),
          Text(name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          Text(desc, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
        ]),
      ),
    );
  }
}

/// 空页面的内嵌类型选择器（V2.1 ①，仿 FlowUs 截图一）：写笔记 / 变多维表。
class _EmptyPageTypePicker extends StatelessWidget {
  const _EmptyPageTypePicker({required this.onPickNote, required this.onPickTable});

  final VoidCallback onPickNote;
  final VoidCallback onPickTable;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('这是一张空页面，你想用它做什么？',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade800)),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: _PickerOption(
              icon: Icons.description_outlined,
              name: '写笔记',
              desc: '就在下面开始输入',
              onTap: onPickNote,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _PickerOption(
              icon: Icons.grid_on,
              name: '变多维表',
              desc: '把这张页面变成表格',
              onTap: onPickTable,
            ),
          ),
        ]),
      ]),
    );
  }
}

class _PickerOption extends StatelessWidget {
  const _PickerOption({
    required this.icon,
    required this.name,
    required this.desc,
    required this.onTap,
  });

  final IconData icon;
  final String name;
  final String desc;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(8),
          color: Colors.white,
        ),
        child: Row(children: [
          Icon(icon, size: 20, color: Colors.blue.shade700),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              Text(desc, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// 崩溃恢复草稿条（普通页/多维表/记录页三处共用）。
class _DraftBanner extends StatelessWidget {
  const _DraftBanner({
    required this.draft,
    required this.onRestore,
    required this.onDiscard,
  });

  final Draft draft;
  final VoidCallback onRestore;
  final VoidCallback onDiscard;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.orange.shade50,
        border: Border.all(color: Colors.orange.shade300),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(
          '检测到上次未保存的草稿（${draft.updatedAt.toLocal()}）——可能是异常退出所致',
          style: TextStyle(fontSize: 13, color: Colors.orange.shade900),
        ),
        const SizedBox(height: 4),
        Text(
          draft.content.length > 60 ? '${draft.content.substring(0, 60)}…' : draft.content,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
        ),
        const SizedBox(height: 8),
        Row(children: [
          FilledButton(onPressed: onRestore, child: const Text('恢复草稿')),
          const SizedBox(width: 8),
          TextButton(onPressed: onDiscard, child: const Text('丢弃')),
        ]),
      ]),
    );
  }
}

/// 记录详情页（V2.1 ③）：原文快照区 + 批注区（块编辑器）。
/// 记录页是隐藏型页面（type=record，挂在表下、树上不可见），表格视图是唯一入口，
/// 返回即回到表格（记录↔页面双向定位）。批注走与普通页一致的保存链（状态灯/草稿/恢复）。
class RecordDetailPage extends StatefulWidget {
  const RecordDetailPage({super.key, required this.db, required this.pageId});

  final AppDatabase db;
  final String pageId;

  @override
  State<RecordDetailPage> createState() => _RecordDetailPageState();
}

class _RecordDetailPageState extends State<RecordDetailPage> {
  late final SaveController _save;
  String? _editorContent;
  Page? _page;
  Draft? _draft;

  @override
  void initState() {
    super.initState();
    _save = SaveController(
      write: _writeContent,
      draftWrite: (c) => widget.db.saveDraft(widget.pageId, c),
      draftClear: () => widget.db.clearDraft(widget.pageId),
    );
    _loadPage();
  }

  Future<void> _loadPage() async {
    final page = await widget.db.pageById(widget.pageId);
    final draft = await widget.db.draftFor(widget.pageId);
    if (!mounted) return;
    setState(() {
      _page = page;
      _editorContent = page?.content ?? '';
      // 崩溃恢复：草稿存在且与正文不同 → 顶部出恢复条
      _draft = (draft != null &&
              draft.content.isNotEmpty &&
              draft.content != (page?.content ?? ''))
          ? draft
          : null;
    });
    _save.markSaved(encodeBlocks(decodeBlocks(page?.content ?? '')));
  }

  Future<void> _writeContent(String content) async {
    await widget.db.updatePageContent(widget.pageId, content);
    // 脱敏口径：只记字数，不记正文
    DiagnosticsLog.I.add('content.saved', id: widget.pageId, count: content.length);
  }

  Future<void> _restoreDraft() async {
    final d = _draft;
    if (d == null) return;
    setState(() {
      _editorContent = d.content;
    });
    DiagnosticsLog.I.add('draft.restored', id: widget.pageId);
    _save.editText(d.content);
  }

  Future<void> _discardDraft() async {
    await widget.db.clearDraft(widget.pageId);
    if (!mounted) return;
    setState(() {
      _draft = null;
    });
  }

  @override
  void dispose() {
    _save.flush();
    _save.disposeTimer();
    _save.dispose();
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
        title: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.article_outlined, size: 18, color: Colors.blue.shade700),
          const SizedBox(width: 6),
          Flexible(child: Text(page.title.isEmpty ? '（未命名记录）' : page.title)),
        ]),
        actions: [
          AnimatedBuilder(
            animation: _save,
            builder: (context, _) => _StatusChip(status: _save.status),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          if (_draft != null)
            _DraftBanner(draft: _draft!, onRestore: _restoreDraft, onDiscard: _discardDraft),
          _snapshotSection(),
          const SizedBox(height: 12),
          Text('我的批注', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          BlocksEditor(
            initialContent: _editorContent ?? '',
            onChanged: (serialized) => _save.editText(serialized),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  /// 原文快照区（③ 最小版）：剪藏文章入库后（④）自动填充真实快照；
  /// 手工建的记录显示空态说明。
  Widget _snapshotSection() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(children: [
        Icon(Icons.article_outlined, size: 20, color: Colors.grey.shade600),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            '原文快照：暂无。剪藏文章入库后，这里自动展示原文。',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
          ),
        ),
      ]),
    );
  }
}
