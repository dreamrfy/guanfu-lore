// 新外壳的独立入口（M1-T02 建；M1-T04 接交互演示）
//
// 为什么单独一个 main：**测试与对照截图要能跑新外壳，而不能动旧 app**（main.dart 那套 UI 已判定弃用，
// 但里面还有旧功能的入口，等 M1 收口时整体替换）。
//
// 跑法：flutter run -t lib/main_shell.dart -d windows
//       flutter build windows --release -t lib/main_shell.dart --no-tree-shake-icons

import 'dart:io';

import 'package:flutter/material.dart' hide Page;

import 'package:flutter/services.dart';

import 'design/tokens.dart';

import 'data/database.dart';
import 'data/pages_table.dart' show PageTypes;
import 'page/page_menu.dart';
import 'page/page_save_pipeline.dart';
import 'shell/flowus_shell.dart';
import 'table/flowus_table.dart';
import 'table/table_engine.dart';
import 'shell/flowus_tabbar.dart';
import 'shell/flowus_trash_panel.dart';

/// 演示页标题：只认这一篇，避免动到用户自己的页面
const String kDemoPageTitle = '学习进度';

/// 演示页在侧栏里的 id（与真 FlowUs 截图状态一致：默认选中「学习进度」）
const String kDemoPageId = 'study';

/// **剪藏库**多维表页的标题（M4：剪藏内容落进这张表）
const String kClipLibraryTitle = '剪藏库';

/// 剪藏库在侧栏里的 id
const String kClipLibraryId = 'clip-lib';

/// 记录页「我的想法」在单元格里的存储键（约定键，不是用户可见的列）
const String kRecordNotesKey = '__notes';

/// 记录页「作者原文」在单元格里的存储键
const String kRecordAuthorKey = '__author';

void main() => runApp(const ShellApp());

class ShellApp extends StatefulWidget {
  const ShellApp({super.key, this.database});

  /// 测试注入内存库；为 null 时用真实本地库
  final AppDatabase? database;

  @override
  State<ShellApp> createState() => _ShellAppState();
}

class _ShellAppState extends State<ShellApp> {
  String? _selectedId = kDemoPageId; // 默认选中「学习进度」，与真 FlowUs 截图状态一致
  var _seq = 0;

  // M1-T13 交付演示：把 M1 做出来的东西都摆出来（标签条 / 浮动钮 / 回收站浮层）
  List<FlowUsTab> _tabs = const [
    FlowUsTab(id: 't1', title: '学习进度'),
    FlowUsTab(id: 't2', title: '磷化工知识库'),
  ];
  String? _activeTab = 't1';
  bool _trashOpen = false;

  /// 页面右上「⋯」长面板（M2-T13）
  bool _pageMenuOpen = false;

  // ---- M2-T15 装配：真实本地库 + 保存链 + 崩溃恢复 ----
  AppDatabase? _db;
  PageSavePipeline? _pipe;
  bool _hasRecoverableDraft = false;

  // ---- M4：多维表（剪藏库）----
  /// 当前打开的多维表内容（从库里读，改了要落回去）
  FlowUsCollection? _table;

  /// 多维表页 id（演示壳的「剪藏库」）
  String? _tablePageId;

  /// 打开多维表页：从库里读 content 并解析成表
  Future<void> _openTable(AppDatabase db, String pageId) async {
    final page = await db.pageById(pageId);
    if (page == null) return;
    final collection = FlowUsCollection.fromStoredJson(page.content);
    if (!mounted) return;
    setState(() {
      _tablePageId = pageId;
      _table = collection;
      _currentTitle = page.title;
    });
  }

  /// 多维表改了 → 落库（`pages.content`）
  Future<void> _saveTable(FlowUsCollection c) async {
    setState(() => _table = c);
    final id = _tablePageId;
    if (id == null) return;
    await _db?.updatePageContent(id, c.toStoredJson());
  }

  /// 记录页里改了一个属性值 → 落库
  Future<void> _saveRecordCell(String recordId, String fieldId, Object? value) async {
    final t = _table;
    if (t == null) return;
    await _saveTable(FlowUsTableEngine.setCell(t, recordId, fieldId, value));
  }

  /// 记录页里改了「我的想法」→ 落库
  Future<void> _saveRecordNotes(String recordId, String text) async {
    final t = _table;
    if (t == null) return;
    await _saveTable(FlowUsTableEngine.setCell(t, recordId, kRecordNotesKey, text));
  }

  /// 记录页里改了标题 → 落库
  Future<void> _saveRecordTitle(String recordId, String title) async {
    final t = _table;
    if (t == null) return;
    final titleField = t.titleField;
    if (titleField == null) return;
    await _saveTable(FlowUsTableEngine.setCell(t, recordId, titleField.id, title));
  }

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  /// 启动失败时的原因（release 里没有控制台，写到临时文件里便于排查）
  String? _bootError;

  /// 打开库 → 取（或建）一页 → 接保存链 → 检查草稿
  Future<void> _bootstrap() async {
    if (widget.database == null) {
      try {
        await _bootstrapReal();
} catch (e, st) {
        _bootError = e.toString();
        try {
          final f = File('${Directory.systemTemp.path}${Platform.pathSeparator}bijiapp-boot.log');
          await f.writeAsString('BOOT ERROR\n$e\n$st');
        } catch (_) {}
        if (mounted) setState(() {});
      }
      return;
    }
    await _bootstrapWith(widget.database!);
  }

  Future<void> _bootstrapReal() async {
    // M2-T35：启动先做一次自动备份（db + wal + shm，保留最新 10 组），再做任何读写
    //
    // ⚠️ 备份的是**演示库**，不是真实笔记库：
    //   真实库 `bijiapp.sqlite` 装的是用户自己从 FlowUs 迁来的笔记，演示壳不碰它；
    //   演示库 `bijiapp-demo.sqlite` 才是演示壳写演示文档的地方。
    //   （2026-11-10 审阅发现：演示壳此前一直用真实库，会往用户库里塞演示页。）
    String backupNote = 'backup=skipped';
    try {
      final f = await appDbFile(kDemoDbName);
      final made = await backupDbWithRotation(f, keep: 10);
      backupNote = 'backup=${made?.path ?? 'none'}';
    } catch (e) {
      backupNote = 'backup error $e';
    }
    final db = AppDatabase.demo();
    await _bootstrapWith(db);
    // 诊断：把真正落盘的库路径写进 boot 日志（release 没有控制台）
    try {
      final f = await appDbFile(kDemoDbName);
      final log = File('${Directory.systemTemp.path}${Platform.pathSeparator}bijiapp-boot.log');
      await log.writeAsString('DB OK path=${f.path} exists=${await f.exists()} $backupNote\n');
    } catch (e) {
      try {
        final log = File('${Directory.systemTemp.path}${Platform.pathSeparator}bijiapp-boot.log');
        await log.writeAsString('DB PATH ERROR $e\n');
      } catch (_) {}
    }
  }

  Future<void> _bootstrapWith(AppDatabase db) async {
    final pages = await db.listAllActive();
    // ⚠️ 只能开这一篇「学习进度」演示页：以前这里取 `pages.first`，
    // 会把用户自己的页当成演示页打开并覆盖掉（2026-11-10 出过一次事故）。
    final demoPages = pages.where((p) => p.title == kDemoPageTitle).toList();
    final page = demoPages.isNotEmpty
        ? demoPages.first
        : await db.createPage(title: kDemoPageTitle, content: _content);
    final pipe = PageSavePipeline(db: db, pageId: page.id);
    final open = await pipe.open();

    // M4：剪藏库多维表（演示壳里给它建一张示范表，用户可以自己加列/加行/筛选）
    final tablePage = await _ensureClipLibrary(db, pages);

    if (!mounted) return;
    setState(() {
      _db = db;
      _pipe = pipe;
      _content = open.content.isEmpty ? _content : open.content;
      _currentTitle = open.title.isEmpty ? _currentTitle : open.title;
      _hasRecoverableDraft = open.hasRecoverableDraft;
    });
    if (tablePage != null) {
      await _openTable(db, tablePage.id);
    }
  }

  /// 建/取「剪藏库」多维表页（type=table）。
  ///
  /// 字段是**建议值**——用户可以自己增删改（M4 的通用引擎就是这么设计的：
  /// 「具体公众号剪藏这个表格要哪些字段我到时候自己来」）。
  Future<Page?> _ensureClipLibrary(AppDatabase db, List<Page> pages) async {
    final existing = pages.where((p) => p.title == kClipLibraryTitle).toList();
    if (existing.isNotEmpty) return existing.first;

    final collection = FlowUsCollection(
      id: 'clip-lib',
      fields: [
        FlowUsFieldDefinition(id: 'title', name: '标题', rawType: 'title'),
        FlowUsFieldDefinition(id: 'f_src', name: '来源类型', rawType: 'select', options: [
          {'name': '公众号', 'color': 'green'},
          {'name': 'B站', 'color': 'blue'},
          {'name': '小红书', 'color': 'pink'},
          {'name': '抖音', 'color': 'orange'},
        ]),
        FlowUsFieldDefinition(id: 'f_acct', name: '公众号', rawType: 'text'),
        FlowUsFieldDefinition(id: 'f_time', name: '收藏时间', rawType: 'date'),
        FlowUsFieldDefinition(id: 'f_read', name: '阅读状态', rawType: 'select', options: [
          {'name': '未读', 'color': 'gray'},
          {'name': '已读', 'color': 'green'},
        ]),
        FlowUsFieldDefinition(id: 'f_ai', name: 'AI 简介', rawType: 'text'),
        FlowUsFieldDefinition(id: 'f_state', name: '存档状态', rawType: 'select', options: [
          {'name': '已存档', 'color': 'green'},
          {'name': '存档中', 'color': 'blue'},
          {'name': '不完整', 'color': 'orange'},
          {'name': '失败', 'color': 'red'},
        ]),
        FlowUsFieldDefinition(id: 'f_aistate', name: 'AI 状态', rawType: 'select', options: [
          {'name': '待生成', 'color': 'gray'},
          {'name': '生成中', 'color': 'blue'},
          {'name': '已完成', 'color': 'green'},
          {'name': '失败', 'color': 'red'},
        ]),
      ],
      records: const [],
      views: [FlowUsView(uuid: 'v1', rawType: 'table', title: '表格视图')],
    );

    final page = await db.createPage(
      title: kClipLibraryTitle,
      content: collection.toStoredJson(),
      type: PageTypes.table,
    );
    return page;
  }

  Future<void> _restoreDraft() async {
    final pipe = _pipe;
    if (pipe == null) return;
    final json = await pipe.acceptDraft();
    if (!mounted) return;
    setState(() {
      _content = json;
      _hasRecoverableDraft = false;
    });
    _snack('已恢复草稿');
  }

  Future<void> _discardDraft() async {
    await _pipe?.discardDraft();
    if (!mounted) return;
    setState(() => _hasRecoverableDraft = false);
    _snack('已忽略草稿');
  }

  @override
  void dispose() {
    _pipe?.flush();
    _pipe?.dispose();
    if (widget.database == null) _db?.close();
    super.dispose();
  }

  /// 当前页标题（M2-T02）：主区输入框、侧栏页项、标签条三处同步
  String _currentTitle = '学习进度';

  /// 当前打开的是不是**演示页**（只有演示页接了保存链）。
  ///
  /// 侧栏里那十几项（磷化工知识库 / 磷矿 / 磷酸…）是为了和真 FlowUs 截图对照而**写死的演示条目**，
  /// 它们在库里并不存在、也没有接保存链。所以：
  ///   · 点到非演示页 → 标题框显示那一项的标题，但**不落库**（否则会把演示页的标题改掉）；
  ///   · 正文也停在演示正文上（不假装切了页）。
  bool get _isDemoPage => _selectedId == kDemoPageId;

  void _onTitleChanged(String v) {
    final id = _selectedId;
    setState(() {
      _currentTitle = v;
      // ① 侧栏页项
      if (id != null) {
        if (_find(_spacePages, id) != null) {
          _spacePages = _update(_spacePages, id, (n) => n.copyWith(title: v));
        } else if (_find(_privatePages, id) != null) {
          _privatePages = _update(_privatePages, id, (n) => n.copyWith(title: v));
        }
      }
      // ② 标签条里当前页那条
      final tabId = _activeTab;
      if (tabId != null) {
        _tabs = [
          for (final t in _tabs)
            t.id == tabId ? FlowUsTab(id: t.id, title: v.isEmpty ? '无标题' : v) : t,
        ];
      }
    });
  }

  /// 防抖后的落库（演示壳：这里只落内存；真库在 M2-T14 保存链接入 pages 表）
  Future<void> _onTitleSave(String v) async {
    // ⚠️ 只有演示页接保存链：侧栏里那些写死的对照条目在库里并不存在，
    // 若在这里照落库，会把演示页的标题改成别的页面的标题。
    if (!_isDemoPage) return;
    _pipe?.editTitle(v);
    await Future<void>.delayed(const Duration(milliseconds: 30));
    _savedTitles[_selectedId ?? ''] = v;
  }

  final Map<String, String> _savedTitles = {};

  /// 正文（M2-T20：appflowy 文档 JSON）。演示内容只用内核支持的块：
  /// 标题1-3 / 段落 / 项目符号 / 编号 / 待办 / 引述 / 分割线 / 代码块
  /// （代码块是 M2-T19 自写组件：内核 6.1.1 里没有）
  String _content = const JsonEncoderShim().convert(_demoDocument);

  static const Map<String, dynamic> _demoDocument = {
    'document': {
      'type': 'page',
      'children': [
        {'type': 'heading', 'data': {'level': 1, 'delta': [{'insert': '标题一（30/45/w600）'}]}},
        {'type': 'heading', 'data': {'level': 2, 'delta': [{'insert': '标题二'}]}},
        {'type': 'heading', 'data': {'level': 3, 'delta': [{'insert': '标题三'}]}},
        {'type': 'paragraph', 'data': {'delta': [{'insert': '正文段落：16 / 26，块高 34，块间距 2。'}]}},
        {'type': 'bulleted_list', 'data': {'delta': [{'insert': '项目符号项（缩进 26）'}]}},
        {'type': 'numbered_list', 'data': {'delta': [{'insert': '编号项一'}]}},
        {'type': 'numbered_list', 'data': {'delta': [{'insert': '编号项二（序号自增）'}]}},
        {'type': 'todo_list', 'data': {'checked': false, 'delta': [{'insert': '待办项'}]}},
        {'type': 'quote', 'data': {'delta': [{'insert': '引述文字（16/26）'}]}},
        {'type': 'divider', 'data': {}},
        {
          'type': 'code',
          'data': {
            'delta': [{'insert': '// 代码块：等宽 14/21，左缘缩进 25'}],
          },
        },
        {'type': 'paragraph', 'data': {'delta': [{'insert': '在这一行打 / 可以唤起斜杠菜单，选中文字按 Ctrl+B 加粗。'}]}},
      ],
    },
  };

  void _onContentChanged(String json) {
    setState(() => _content = json);
    // ⚠️ 同标题：只有演示页接保存链，别把演示页正文写进别的页。
    if (!_isDemoPage) return;
    _pipe?.editContent(json); // 防抖 + 即时草稿（M2-T14）
  }

  /// 截图/演示用快捷键：T 开关回收站浮层、P 开关页面「⋯」长面板
  /// （真实入口分别是侧栏「回收站」与右上工具栏的 ⋯）
  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is KeyDownEvent && event.logicalKey == LogicalKeyboardKey.keyT) {
      setState(() => _trashOpen = !_trashOpen);
      return KeyEventResult.handled;
    }
    if (event is KeyDownEvent && event.logicalKey == LogicalKeyboardKey.keyP) {
      setState(() => _pageMenuOpen = !_pageMenuOpen);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  List<PageNode> _spacePages = const [
    PageNode(id: 'study', title: '学习进度', kind: PageKind.database), // 真 FlowUs 里它是多维表页（网格图标）
    // M4：剪藏库（真多维表页，能加列/加行/筛选/排序）
    PageNode(id: kClipLibraryId, title: '剪藏库', kind: PageKind.database),
    PageNode(
      id: 'pchem',
      title: '磷化工知识库',
      kind: PageKind.folder,
      expanded: false,
      children: [
        PageNode(id: 'pchem-ore', title: '磷矿'),
        PageNode(id: 'pchem-acid', title: '磷酸/磷肥'),
        PageNode(id: 'pchem-lfp', title: '磷酸铁锂'),
        PageNode(id: 'pchem-gypsum', title: '磷石膏'),
        PageNode(id: 'pchem-dongsheng', title: '东圣案例'),
        PageNode(id: 'pchem-info', title: '信息源清单', kind: PageKind.database),
        PageNode(id: 'pchem-material', title: '素材收集箱', kind: PageKind.database),
      ],
    ),
  ];
  List<PageNode> _privatePages = const [
    PageNode(id: 'p-db', title: '无标题多维表格', kind: PageKind.database),
    PageNode(id: 'p-config', title: '配置'),
    PageNode(id: 'p-u1', title: '无标题'),
    PageNode(id: 'p-u2', title: '无标题'),
    PageNode(id: 'p-linux', title: 'liunx命令'),
    PageNode(id: 'p-site', title: '网站'),
    PageNode(id: 'p-account', title: '账号'),
    PageNode(id: 'p-gzh', title: '微信公众号剪藏', icon: '📰'),
    PageNode(id: 'p-webclip', title: '网页剪藏', icon: '✂️'),
    PageNode(id: 'p-archive', title: '归档历史材料'),
  ];

  /// 不可变树更新：map 整棵树，命中 id 的节点用 fn 变换
  List<PageNode> _update(List<PageNode> list, String id, PageNode Function(PageNode) fn) => [
        for (final n in list)
          if (n.id == id)
            fn(n)
          else
            n.copyWith(children: _update(n.children, id, fn)),
      ];

  List<PageNode> _appendChild(List<PageNode> list, String parentId, PageNode child) =>
      _update(list, parentId, (n) => n.copyWith(children: [...n.children, child], expanded: true));

  PageNode? _find(List<PageNode> list, String id) {
    for (final n in list) {
      if (n.id == id) return n;
      final hit = _find(n.children, id);
      if (hit != null) return hit;
    }
    return null;
  }

  /// MaterialApp 也在本 widget 的子树里 → 用 key 拿 messenger（直接 `ScaffoldMessenger.of(context)`
  /// 会抛 "No ScaffoldMessenger widget found"，因为本 context 在 MaterialApp 之上）
  final GlobalKey<ScaffoldMessengerState> _messengerKey = GlobalKey<ScaffoldMessengerState>();

  void _snack(String msg) {
    _messengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg), duration: const Duration(seconds: 2)));
  }

  @override
  Widget build(BuildContext context) {
    final data = SidebarData(
      spaceName: '两相欢的空间',
      spacePages: _spacePages,
      privatePages: _privatePages,
      selectedPageId: _selectedId,
    );
    return MaterialApp(
      scaffoldMessengerKey: _messengerKey,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: FlowUsTypography.fontFamily,
        brightness: Brightness.light,
        scaffoldBackgroundColor: FlowUsColors.light.contentBg,
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        fontFamily: FlowUsTypography.fontFamily,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: FlowUsColors.dark.contentBg,
      ),
      home: Focus(
        autofocus: true,
        onKeyEvent: _onKey,
        child: Stack(
          children: [
            Positioned.fill(child: _buildShell(data)),
            // 启动失败横幅（诊断用）：release 没控制台，把异常直接显示出来
            if (_bootError != null)
              Positioned(
                left: 0,
                right: 0,
                top: FlowUsLayout.tabBarHeight,
                child: Container(
                  color: const Color(0xFFFFE5E5),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  child: Text('数据库打不开：$_bootError',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: Color(0xFFB42318))),
                ),
              ),
            // 崩溃恢复横幅（M2-T15 装配演示）：文案是占位，真 FlowUs 的提示形态未采（见任务表）
            if (_hasRecoverableDraft)
              Positioned(
                left: 0,
                right: 0,
                top: FlowUsLayout.tabBarHeight,
                child: _DraftBanner(onRestore: _restoreDraft, onDiscard: _discardDraft),
              ),
            if (_pageMenuOpen)
              Positioned(
                right: 8,
                top: FlowUsLayout.tabBarHeight,
                child: FlowUsPageMenu(
                  onItem: (item) {
                    setState(() => _pageMenuOpen = false);
                    _snack('${item.label}（演示壳，未接动作）');
                  },
                ),
              ),
            if (_trashOpen)
              // 回收站浮层（M1-T09）：实测是浮层不是页面
              Positioned.fill(
                child: ColoredBox(
                  color: const Color(0x33000000),
                  child: Center(
                    child: FlowUsTrashPanel(
                      entries: _demoTrash,
                      onClearAll: () => setState(() => _trashOpen = false),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  static const _demoTrash = <TrashEntry>[
    TrashEntry(id: 'x1', title: '无标题', deletedAtLabel: '2026 年 11 月 10 日 09:46'),
    TrashEntry(
      id: 'x2',
      title: '夏天的女装，为什么一件比一件贵？',
      subtitle: '微信公众号剪藏',
      deletedAtLabel: '2026 年 10 月 31 日 09:32',
    ),
    TrashEntry(id: 'x3', title: '研究用-可删', deletedAtLabel: '2026 年 11 月 9 日 00:06'),
  ];

  Widget _buildShell(SidebarData data) => FlowUsShell(
        data: data,
        callbacks: SidebarCallbacks(
          onOpenPage: (id) {
            setState(() {
              _selectedId = id;
              _currentTitle = _find(_spacePages, id)?.title ?? _find(_privatePages, id)?.title ?? '';
            });
            // M4：点开「剪藏库」→ 真的把那张多维表读出来
            if (id == kClipLibraryId) {
              final pid = _tablePageId;
              if (pid != null && _db != null) {
                _openTable(_db!, pid);
              }
            }
          },
          onToggleExpand: (id, expanded) => setState(() {
            final hit = _find(_spacePages, id) ?? _find(_privatePages, id);
            if (hit != null) {
              if (_find(_spacePages, id) != null) {
                _spacePages = _update(_spacePages, id, (n) => n.copyWith(expanded: expanded));
              } else {
                _privatePages = _update(_privatePages, id, (n) => n.copyWith(expanded: expanded));
              }
            }
          }),
          onCreatePage: (section) => setState(() {
            _seq++;
            if (section == SidebarSection.space) {
              _spacePages = [..._spacePages, PageNode(id: 'new-$_seq', title: '无标题')];
            } else {
              _privatePages = [..._privatePages, PageNode(id: 'new-$_seq', title: '无标题')];
            }
            _selectedId = 'new-$_seq';
          }),
          onCreateChildPage: (parentId) => setState(() {
            _seq++;
            _spacePages = _appendChild(_spacePages, parentId, PageNode(id: 'child-$_seq', title: '无标题'));
            _selectedId = 'child-$_seq';
          }),
          onItemMenu: (pageId, action) {
            if (action == '重命名') {
              setState(() {
                _seq++;
                if (_find(_spacePages, pageId) != null) {
                  _spacePages = _update(_spacePages, pageId, (n) => n.copyWith(title: '已重命名 $_seq'));
                } else {
                  _privatePages = _update(_privatePages, pageId, (n) => n.copyWith(title: '已重命名 $_seq'));
                }
              });
            } else if (action == '删除') {
              // 演示入口不真删（树节点删除链在数据层任务里接）；仅提示
              _snack('删除 $pageId（演示壳不接数据层）');
            } else {
              _snack('$action → $pageId（演示壳）');
            }
          },
        ),
      tabs: _tabs,
      activeTabId: _activeTab,
      tabBarCallbacks: TabBarCallbacks(
        onSelectTab: (id) => setState(() => _activeTab = id),
        onCloseTab: (id) => setState(() {
          _tabs = [for (final t in _tabs) if (t.id != id) t];
          if (_activeTab == id) _activeTab = _tabs.isEmpty ? null : _tabs.first.id;
        }),
        onCreateTab: () => setState(() {
          _seq++;
          final id = 't${_tabs.length + 1}-$_seq';
          _tabs = [..._tabs, FlowUsTab(id: id, title: '无标题')];
          _activeTab = id;
        }),
        onShare: () => _snack('分享（演示壳）'),
        onToolbarAction: (a) {
          if (a == '页面菜单') {
            setState(() => _pageMenuOpen = !_pageMenuOpen);
            return;
          }
          _snack('$a（演示壳）');
        },
      ),
      activeQuickIconIndex: 0, // 演示态对齐真 FlowUs：首页高亮
      pageTitle: _currentTitle,
      onPageTitleChanged: _onTitleChanged,
      onPageTitleSave: _onTitleSave,
      pageIcon: (_find(_spacePages, _selectedId ?? '') ?? _find(_privatePages, _selectedId ?? ''))?.icon ?? '',
      pageContent: _content,
      onPageContentChanged: _onContentChanged,
      autoFocusPageBody: true, // 演示/截图：正文默认聚焦，可直接敲 "/" 看斜杠菜单
      // M4：当前是「剪藏库」多维表页 → 正文区渲染表格
      pageIsTable: _selectedId == kClipLibraryId,
      pageTable: _table,
      onPageTableChanged: _saveTable,
      onTableRecordCellChanged: _saveRecordCell,
      onTableRecordNotesChanged: _saveRecordNotes,
      onTableRecordTitleChanged: _saveRecordTitle,
      showFloatingButtons: true,
      onFloatingAiTap: () => _snack('FlowUs AI 面板属 M9'),
      onFloatingHelpTap: () => _snack('帮助菜单（点右下帮助钮可开）'),
    );
}

/// 极简 JSON 编码（只用于把演示文档常量转成字符串；避免在极简场景引 dart:convert 的其它名字）
class JsonEncoderShim {
  const JsonEncoderShim();
  String convert(Object? v) => _encode(v);
  static String _encode(Object? v) {
    if (v is String) return '"${v.replaceAll('"', r'\"')}"';
    if (v is bool || v is num) return '$v';
    if (v is List) return '[${v.map(_encode).join(',')}]';
    if (v is Map) return '{${v.entries.map((e) => '"${e.key}":${_encode(e.value)}').join(',')}}';
    return 'null';
  }
}

/// 草稿恢复横幅（演示装配用）：ⓘ 文案形态未按真 FlowUs 采，先照系统横幅的样式做一条
class _DraftBanner extends StatelessWidget {
  const _DraftBanner({this.onRestore, this.onDiscard});

  final VoidCallback? onRestore;
  final VoidCallback? onDiscard;

  @override
  Widget build(BuildContext context) {
    const accent = Color(0xFF0285FF);
    return Container(
      height: FlowUsLayout.bannerHeight,
      decoration: const BoxDecoration(
        color: Color(0x0D0285FF), // rgba(2,133,255,0.05)
        border: Border(bottom: BorderSide(color: Color(0x1A0285FF))),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          const Icon(Icons.info_outline, size: 16, color: accent),
          const SizedBox(width: 8),
          const Expanded(
            child: Text('发现未保存的草稿（上次编辑没来得及保存）',
                style: TextStyle(fontSize: 14, height: 24 / 14, color: Color(0xFF37352F))),
          ),
          TextButton(onPressed: onRestore, child: const Text('恢复', style: TextStyle(color: accent))),
          TextButton(onPressed: onDiscard, child: const Text('忽略', style: TextStyle(color: Color(0xFF5F5E5B)))),
        ],
      ),
    );
  }
}
