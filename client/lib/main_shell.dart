// 新外壳的独立入口（M1-T02 建；M1-T04 接交互演示）
//
// 为什么单独一个 main：**测试与对照截图要能跑新外壳，而不能动旧 app**（main.dart 那套 UI 已判定弃用，
// 但里面还有旧功能的入口，等 M1 收口时整体替换）。
//
// 跑法：flutter run -t lib/main_shell.dart -d windows
//       flutter build windows --release -t lib/main_shell.dart --no-tree-shake-icons

import 'package:flutter/material.dart';

import 'design/tokens.dart';
import 'shell/flowus_shell.dart';

void main() => runApp(const ShellApp());

class ShellApp extends StatefulWidget {
  const ShellApp({super.key});

  @override
  State<ShellApp> createState() => _ShellAppState();
}

class _ShellAppState extends State<ShellApp> {
  String? _selectedId;
  var _seq = 0;

  List<PageNode> _spacePages = const [
    PageNode(id: 'study', title: '学习进度'),
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
      home: FlowUsShell(
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
      ),
    );
  }
}