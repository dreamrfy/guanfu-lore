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

  /// 按 T 开关回收站浮层（只为截图用；真实入口在侧栏「回收站」）
  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is KeyDownEvent && event.logicalKey == LogicalKeyboardKey.keyT) {
      setState(() => _trashOpen = !_trashOpen);
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
    PageNode(id: 'p-gzh', title: '微信公众号剪藏'),
    PageNode(id: 'p-webclip', title: '网页剪藏'),
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
          onOpenPage: (id) => setState(() => _selectedId = id),
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
        onToolbarAction: (a) => _snack(context, '$a（演示壳）'),
      ),
      activeQuickIconIndex: 0, // 演示态对齐真 FlowUs：首页高亮
      showFloatingButtons: true,
      onFloatingAiTap: () => _snack(context, 'FlowUs AI 面板属 M9'),
      onFloatingHelpTap: () => _snack(context, '帮助菜单（点右下帮助钮可开）'),
    );
}