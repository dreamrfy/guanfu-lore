// 新外壳的独立入口（M1-T02 建；M1-T04 接交互演示）
//
// 为什么单独一个 main：**测试与对照截图要能跑新外壳，而不能动旧 app**（main.dart 那套 UI 已判定弃用，
// 但里面还有旧功能的入口，等 M1 收口时整体替换）。
//
// 跑法：flutter run -t lib/main_shell.dart -d windows
//       flutter build windows --release -t lib/main_shell.dart --no-tree-shake-icons

import 'package:flutter/material.dart';

import 'package:flutter/services.dart';

import 'design/tokens.dart';

import 'page/page_menu.dart';
import 'shell/flowus_shell.dart';
import 'shell/flowus_tabbar.dart';
import 'shell/flowus_trash_panel.dart';

void main() => runApp(const ShellApp());

class ShellApp extends StatefulWidget {
  const ShellApp({super.key});

  @override
  State<ShellApp> createState() => _ShellAppState();
}

class _ShellAppState extends State<ShellApp> {
  String? _selectedId = 'study'; // 默认选中「学习进度」，与真 FlowUs 截图状态一致
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

  /// 当前页标题（M2-T02）：主区输入框、侧栏页项、标签条三处同步
  String _currentTitle = '学习进度';

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
    await Future<void>.delayed(const Duration(milliseconds: 30));
    _savedTitles[_selectedId ?? ''] = v;
  }

  final Map<String, String> _savedTitles = {};

  /// 正文（M2-T20：appflowy 文档 JSON）。演示内容只用内核支持的块：
  /// 标题1-3 / 段落 / 项目符号 / 编号 / 待办 / 引述 / 分割线（代码块等内核没有，见 M2-T19）
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
        {'type': 'paragraph', 'data': {'delta': [{'insert': '在这一行打 / 可以唤起斜杠菜单，选中文字按 Ctrl+B 加粗。'}]}},
      ],
    },
  };

  void _onContentChanged(String json) => setState(() => _content = json);

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

  void _snack(BuildContext context, String msg) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
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
            if (_pageMenuOpen)
              Positioned(
                right: 8,
                top: FlowUsLayout.tabBarHeight,
                child: FlowUsPageMenu(
                  onItem: (item) {
                    setState(() => _pageMenuOpen = false);
                    _snack(context, '${item.label}（演示壳，未接动作）');
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
          onOpenPage: (id) => setState(() {
            _selectedId = id;
            _currentTitle = _find(_spacePages, id)?.title ?? _find(_privatePages, id)?.title ?? '';
          }),
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
              _snack(context, '删除 $pageId（演示壳不接数据层）');
            } else {
              _snack(context, '$action → $pageId（演示壳）');
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
        onShare: () => _snack(context, '分享（演示壳）'),
        onToolbarAction: (a) {
          if (a == '页面菜单') {
            setState(() => _pageMenuOpen = !_pageMenuOpen);
            return;
          }
          _snack(context, '$a（演示壳）');
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
      showFloatingButtons: true,
      onFloatingAiTap: () => _snack(context, 'FlowUs AI 面板属 M9'),
      onFloatingHelpTap: () => _snack(context, '帮助菜单（点右下帮助钮可开）'),
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
