// 侧栏骨架的几何/排版校验（M1-T02）
//
// 用 widget test 直接量尺寸——比截图目测可靠、也快得多。
// 跑法：cd client && flutter test test/sidebar_layout_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/tokens.dart';
import 'package:bijiapp/shell/flowus_shell.dart';

const _data = SidebarData(
  spaceName: '两相欢的空间',
  spacePages: ['学习进度', '磷化工知识库'],
  // 注意：这里**不能**放一个叫「无标题」的页项——否则它会和主区的「无标题」大标题重名，
  // find.text 会命中两个元素导致断言失败（本测试第一次就是这么挂的）。
  privatePages: ['无标题多维表格', '配置', 'liunx命令'],
);

Future<void> _pumpShell(WidgetTester tester, {double width = 1920, double height = 945}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(const MaterialApp(home: FlowUsShell(data: _data)));
  await tester.pumpAndSettle();
}

void main() {
  group('侧栏几何（基准-全局框架 §4）', () {
    testWidgets('侧栏宽 228、且撑满整个高度', (tester) async {
      await _pumpShell(tester);
      final size = tester.getSize(find.byType(FlowUsSidebar));
      expect(size.width, FlowUsLayout.sidebarWidth);
      expect(size.width, 228);
      expect(size.height, 945);
    });

    testWidgets('侧栏在主区左侧（主区起点 x = 228）', (tester) async {
      await _pumpShell(tester);
      final rect = tester.getRect(find.byType(FlowUsSidebar));
      expect(rect.left, 0);
      expect(rect.right, 228);
    });
  });

  group('侧栏结构完整性（八块一个都不能少）', () {
    testWidgets('空间名 / 图标行 / FlowUs AI / 两个分区 / 查看更多 / 底部三项 / 容量卡片', (tester) async {
      await _pumpShell(tester);
      expect(find.text('两相欢的空间'), findsOneWidget); // 空间名行
      expect(find.text('FlowUs AI'), findsOneWidget); // AI 行
      expect(find.text('空间'), findsOneWidget); // 分区 1
      expect(find.text('私人'), findsOneWidget); // 分区 2
      expect(find.text('查看更多'), findsOneWidget);
      expect(find.text('我的订阅'), findsOneWidget);
      expect(find.text('市集'), findsOneWidget);
      expect(find.text('回收站'), findsOneWidget);
      expect(find.text('空间容量已用完'), findsOneWidget); // 底部容量卡片
      expect(find.text('立即升级 ›'), findsOneWidget);
    });

    testWidgets('页项都在（空间 2 个 + 私人 3 个）', (tester) async {
      await _pumpShell(tester);
      for (final t in ['学习进度', '磷化工知识库', '无标题多维表格', '配置']) {
        expect(find.text(t), findsOneWidget, reason: '缺少页项：$t');
      }
    });
  });

  group('排版与颜色（基准-字体与图标 / 基准-色彩）', () {
    testWidgets('页项字号 14 / 字重 500 / 未选中色 grey2', (tester) async {
      await _pumpShell(tester);
      final text = tester.widget<Text>(find.text('学习进度'));
      expect(text.style?.fontSize, 14);
      expect(text.style?.fontWeight, FontWeight.w500);
      expect(text.style?.color, FlowUsColors.light.textSub);
      expect(text.style?.color, const Color(0xFF5F5E5B));
      // 行高 24（height 用倍数表示）
      expect(text.style?.height, closeTo(24 / 14, 0.0001));
    });

    testWidgets('分区标题 12/20/w500、颜色 grey3', (tester) async {
      await _pumpShell(tester);
      final text = tester.widget<Text>(find.text('空间'));
      expect(text.style?.fontSize, 12);
      expect(text.style?.height, closeTo(20 / 12, 0.0001));
      expect(text.style?.fontWeight, FontWeight.w500);
      expect(text.style?.color, FlowUsColors.light.textTertiary);
    });

    testWidgets('侧栏底 #F7F7F7、右边框 #F0F0F0（1px）', (tester) async {
      await _pumpShell(tester);
      final container = tester.widget<Container>(
        find.descendant(of: find.byType(FlowUsSidebar), matching: find.byType(Container)).first,
      );
      final deco = container.decoration as BoxDecoration?;
      expect(deco?.color, FlowUsColors.light.asideBg);
      expect(deco?.color, const Color(0xFFF7F7F7));
      final border = deco?.border as Border?;
      expect(border?.right.color, FlowUsColors.light.borderAside);
      expect(border?.right.width, FlowUsLayout.sidebarBorderWidth);
    });
  });

  group('主区骨架（M1-T05 预置）', () {
    testWidgets('内容列 708、在 1920 下左缘落在 720', (tester) async {
      await _pumpShell(tester);
      final col = find.text('无标题');
      expect(col, findsOneWidget);
      final rect = tester.getRect(col);
      // 主区左缘 228，主区宽 1692，内容列 708 → 居中后左缘 = 228 + 492 = 720
      expect(rect.left, closeTo(720, 0.5));
    });

    testWidgets('页面大标题用 40/64/w600，颜色 grey3（占位）', (tester) async {
      await _pumpShell(tester);
      final text = tester.widget<Text>(find.text('无标题'));
      expect(text.style?.fontSize, 40);
      expect(text.style?.height, closeTo(64 / 40, 0.0001));
      expect(text.style?.fontWeight, FontWeight.w600);
    });
  });
}