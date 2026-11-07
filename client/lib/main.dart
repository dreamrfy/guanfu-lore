import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart' hide Page;

import 'data/asset_store.dart';
import 'data/database.dart';
import 'data/migration_demo.dart';

void main() {
  runApp(const BijiApp());
}

/// P1 阶段客户端。P1-T03：本机数据库 + 资源存储（图片按内容指纹编号落地）。
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
    _reload();
    if (mounted) _openDetail(page);
  }

  void _openDetail(Page page) async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => NoteDetailPage(db: _db, store: _store, page: page)),
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

/// 笔记详情：P1-T03 验收场景——挂图片（按内容指纹编号存本地副本），重启后仍可看。
class NoteDetailPage extends StatefulWidget {
  const NoteDetailPage({super.key, required this.db, required this.store, required this.page});

  final AppDatabase db;
  final AssetStore store;
  final Page page;

  @override
  State<NoteDetailPage> createState() => _NoteDetailPageState();
}

class _NoteDetailPageState extends State<NoteDetailPage> {
  Future<List<Asset>>? _assets;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() => _assets = widget.db.assetsForPage(widget.page.id));
  }

  Future<void> _pickAndSaveImage() async {
    if (_busy) return;
    setState(() => _busy = true);
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
      await widget.db.attachAssetToPage(widget.page.id, stored.id);
      _reload();
      messenger.showSnackBar(SnackBar(content: Text('已存为本机副本：编号 ${stored.id}（${stored.size} 字节）')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('保存失败：$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.page.title.isEmpty ? '（无标题）' : widget.page.title)),
      body: FutureBuilder<List<Asset>>(
        future: _assets,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final assets = snap.data ?? const <Asset>[];
          return ListView(
            padding: const EdgeInsets.all(12),
            children: [
              Row(children: [
                FilledButton.tonalIcon(
                  onPressed: _busy ? null : _pickAndSaveImage,
                  icon: const Icon(Icons.add_photo_alternate_outlined),
                  label: const Text('添加图片'),
                ),
                const SizedBox(width: 12),
                if (_busy) const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
              ]),
              const SizedBox(height: 12),
              if (assets.isEmpty)
                const Text('还没有图片。点上面「添加图片」选一张——\n它会被复制成本机副本（按内容指纹编号），删掉原图也不影响。',
                    style: TextStyle(color: Colors.grey)),
              for (final a in assets) ...[
                _AssetView(store: widget.store, asset: a),
                const SizedBox(height: 12),
              ],
            ],
          );
        },
      ),
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
