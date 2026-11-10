// 侧栏骨架的几何/排版校验（M1-T02）
//
// 用 widget test 直接量尺寸——比截图目测可靠、也快得多。
// 跑法：cd client && flutter test test/sidebar_layout_test.dart

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/tokens.dart';
import 'package:bijiapp/shell/flowus_shell.dart';

const _data = SidebarData(
  spaceName: '两相欢的空间',
  // 三层树：验证「每级缩进 20」需要至少 3 层
  spacePages: [
    PageNode(id: 'study', title: '学习进度'),
    PageNode(id: 'pchem', title: '磷化工知识库', kind: PageKind.folder, children: [
      PageNode(id: 'child1', title: '磷石膏'),
      PageNode(id: 'child2', title: '磷酸铁锂', children: [
        PageNode(id: 'grand', title: '三级页'),
      ]),
    ]),
    PageNode(id: 'collapsed', title: '折叠的库', expanded: false, children: [
      PageNode(id: 'hidden', title: '折叠里的页'),
    ]),
  ],
  // 注意：这里**不能**放一个叫「无标题」的页项——否则它会和主区的「无标题」大标题重名，
  // find.text 会命中两个元素导致断言失败（本测试第一次就是这么挂的）。
  privatePages: [
    PageNode(id: 'db', title: '无标题多维表格', kind: PageKind.database),
    PageNode(id: 'cfg', title: '配置'),
    PageNode(id: 'lin', title: 'liunx命令'),
  ],
);

Future<void> _pumpShell(
  WidgetTester tester, {
  double width = 1920,
  double height = 945,
  SidebarData data = _data,
}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(home: FlowUsShell(data: data)));
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

  group('页面树（M1-T03：每级缩进 20 / 折叠 / 选中）', () {
    testWidgets('一级页项标题左缘 41 = 行左 8 + 内边距 9 + 图标槽 20 + 间距 4', (tester) async {
      await _pumpShell(tester);
      expect(tester.getRect(find.text('学习进度')).left, closeTo(41, 0.5));
    });

    testWidgets('每级缩进 20：二级标题 61、三级标题 81', (tester) async {
      await _pumpShell(tester);
      expect(tester.getRect(find.text('磷石膏')).left, closeTo(61, 0.5));
      expect(tester.getRect(find.text('磷酸铁锂')).left, closeTo(61, 0.5));
      expect(tester.getRect(find.text('三级页')).left, closeTo(81, 0.5));
    });

    testWidgets('缩进不改变行容器几何：行左 8 / 宽 211 / 高 32（三层都适用）', (tester) async {
      await _pumpShell(tester);
      for (final t in ['学习进度', '磷石膏', '三级页']) {
        final row = tester.getRect(
          find.ancestor(of: find.text(t), matching: find.byType(Container)).first,
        );
        expect(row.left, closeTo(8, 0.5), reason: '$t 行左缘');
        expect(row.width, closeTo(211, 0.5), reason: '$t 行宽');
        expect(row.height, closeTo(FlowUsLayout.sidebarItemHeight, 0.5), reason: '$t 行高');
      }
    });

    testWidgets('折叠的父页不渲染子页', (tester) async {
      await _pumpShell(tester);
      expect(find.text('折叠的库'), findsOneWidget);
      expect(find.text('折叠里的页'), findsNothing);
    });

    testWidgets('页项图标按类型区分（page / database / folder）', (tester) async {
      await _pumpShell(tester);
      expect(find.byIcon(Icons.folder_outlined), findsOneWidget); // 磷化工知识库
      expect(find.byIcon(Icons.table_chart_outlined), findsOneWidget); // 无标题多维表格
      // page 类型：学习进度、磷石膏、磷酸铁锂、三级页、折叠的库、配置、liunx命令 = 7
      expect(find.byIcon(Icons.description_outlined), findsNWidgets(7));
    });

    testWidgets('选中态：底色 = 黑 6%、文字 = textStrong', (tester) async {
      await _pumpShell(
        tester,
        data: const SidebarData(
          spaceName: '两相欢的空间',
          privatePages: [PageNode(id: 'cfg', title: '配置')],
          selectedPageId: 'cfg',
        ),
      );
      final box = tester.widget<Container>(
        find.ancestor(of: find.text('配置'), matching: find.byType(Container)).first,
      );
      expect((box.decoration as BoxDecoration?)?.color, FlowUsColors.sidebarItemSelected);
      expect(tester.widget<Text>(find.text('配置')).style?.color, FlowUsColors.light.textStrong);
    });

    testWidgets('未选中页项底色透明（不是常显灰块）', (tester) async {
      await _pumpShell(tester);
      final box = tester.widget<Container>(
        find.ancestor(of: find.text('配置'), matching: find.byType(Container)).first,
      );
      expect((box.decoration as BoxDecoration?)?.color, Colors.transparent);
    });
  });

  group('页项悬停态（M1-T03 实测：底色 3% / 图标槽替换 / ⋯＋ 出现）', () {
    Future<TestGesture> hoverRow(WidgetTester tester, String title) async {
      final g = await tester.createGesture(kind: PointerDeviceKind.mouse);
      await g.addPointer(location: Offset.zero);
      addTearDown(g.removePointer);
      await g.moveTo(tester.getCenter(find.text(title)));
      await tester.pumpAndSettle();
      return g;
    }

    testWidgets('悬停叶子行：底色 = 黑 3%，页图标被小圆点替换', (tester) async {
      await _pumpShell(tester); // 7 个 page 图标
      expect(find.byIcon(Icons.description_outlined), findsNWidgets(7));
      await hoverRow(tester, '学习进度');
      final box = tester.widget<Container>(
        find.ancestor(of: find.text('学习进度'), matching: find.byType(Container)).first,
      );
      expect((box.decoration as BoxDecoration?)?.color, FlowUsColors.sidebarItemHover);
      expect(FlowUsColors.sidebarItemHover, const Color(0x08000000)); // rgba(0,0,0,0.03) 实测
      expect(find.byIcon(Icons.description_outlined), findsNWidgets(6)); // 被替换掉 1 个
    });

    testWidgets('悬停有子页的行：换成展开箭头（12×12），标题缩到 121 宽', (tester) async {
      await _pumpShell(tester);
      await hoverRow(tester, '磷化工知识库');
      expect(find.byIcon(Icons.chevron_right), findsOneWidget);
      expect(find.byIcon(Icons.folder_outlined), findsNothing); // 图标槽被箭头接管
      // 未悬停 161（= 210 − 41 − 8），悬停 121（再让出 4+20+4+20）
      expect(tester.getRect(find.text('磷化工知识库')).width, closeTo(121, 0.5));
    });

    testWidgets('悬停出现 ⋯ 与 ＋（各 20×20），移出即消失', (tester) async {
      await _pumpShell(tester);
      expect(find.byIcon(Icons.more_horiz), findsOneWidget); // 只有顶部图标行那个
      final g = await hoverRow(tester, '学习进度');
      expect(find.byIcon(Icons.more_horiz), findsNWidgets(2)); // 顶部 + 行内
      expect(find.byIcon(Icons.add), findsNWidgets(3)); // 两个分区头（透明占位）+ 行内
      await g.moveTo(const Offset(1400, 500)); // 移到主区
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.more_horiz), findsOneWidget);
      expect(find.byIcon(Icons.add), findsNWidgets(2));
    });
  });
}