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
  spacePages: ['学习进度', '磷化工知识库'],
  privatePages: [
    '无标题多维表格', '配置', '无标题', '无标题', 'liunx命令',
    '网站', '账号', '微信公众号剪藏', '网页剪藏', '归档历史材料',
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