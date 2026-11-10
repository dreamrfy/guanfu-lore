// 新外壳的独立入口（M1-T02）
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

const _demoData = SidebarData(
  spaceName: '两相欢的空间',
  // 数据取自真账号（2026-11-10 侧栏实测）：空间 2 项，磷化工知识库是文件夹、默认折叠
  spacePages: [
    PageNode(id: 'study', title: '学习进度'),
    PageNode(id: 'pchem', title: '磷化工知识库', kind: PageKind.folder, expanded: false, children: [
      PageNode(id: 'pchem-dongsheng', title: '东圣案例'),
      PageNode(id: 'pchem-info', title: '信息源清单', kind: PageKind.database),
      PageNode(id: 'pchem-gypsum', title: '磷石膏'),
      PageNode(id: 'pchem-ore', title: '磷矿'),
      PageNode(id: 'pchem-acid', title: '磷酸/磷肥'),
      PageNode(id: 'pchem-lfp', title: '磷酸铁锂'),
      PageNode(id: 'pchem-material', title: '素材收集箱', kind: PageKind.database),
    ]),
  ],
  privatePages: [
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
  ],
);

class ShellApp extends StatelessWidget {
  const ShellApp({super.key});

  @override
  Widget build(BuildContext context) {
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
      home: const FlowUsShell(data: _demoData),
    );
  }
}