import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart' hide Page;

import 'data/database.dart';
import 'data/migration_demo.dart';

void main() {
  runApp(const BijiApp());
}

/// P1 阶段客户端。P1-T02：本机数据库（drift + SQLite，三端同一套代码）。
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
    await _db.createPage(title: title.trim().isEmpty ? '未命名' : title.trim());
    _reload();
  }

  Future<void> _renameDialog(Page page) async {
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
    await _db.renamePage(page.id, title.trim());
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
              child: Text('还没有内容，点右下角 + 新建一条\n（重启应用后它应该还在——这就是 P1-T02）',
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
                onTap: () => _renameDialog(pg),
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
