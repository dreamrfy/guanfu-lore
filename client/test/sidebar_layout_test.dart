// 侧栏骨架的几何/排版校验（M1-T02）
//
// 用 widget test 直接量尺寸——比截图目测可靠、也快得多。
// 跑法：cd client && flutter test test/sidebar_layout_test.dart

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/flowus_icons.dart';
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
  SidebarCallbacks? callbacks,
}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(home: FlowUsShell(data: data, callbacks: callbacks)));
  await tester.pumpAndSettle();
}

Future<TestGesture> hoverRow(WidgetTester tester, String title) async {
  final g = await tester.createGesture(kind: PointerDeviceKind.mouse);
  await g.addPointer(location: Offset.zero);
  addTearDown(g.removePointer);
  await g.moveTo(tester.getCenter(find.text(title)));
  await tester.pumpAndSettle();
  return g;
}


/// 真图标现在是 SVG（M1-T12）：按名字找，而不是按 Material IconData
Finder svgIcon(String name) =>
    find.byWidgetPredicate((w) => w is FlowUsSvgIcon && w.name == name);

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
      // M1-T15 起按实测拆开：13/22/500 纯黑的「立即升级」+ 12px 的 › 箭头
      expect(find.text('立即升级'), findsOneWidget);
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
      expect(svgIcon(FlowUsIc.folderContent), findsOneWidget); // 磷化工知识库
      expect(svgIcon(FlowUsIc.table), findsOneWidget); // 无标题多维表格
      // page 类型：学习进度、磷石膏、磷酸铁锂、三级页、折叠的库、配置、liunx命令 = 7
      expect(svgIcon(FlowUsIc.pages), findsNWidgets(7));
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
    testWidgets('悬停叶子行：底色 = 黑 3%，页图标被小圆点替换', (tester) async {
      await _pumpShell(tester); // 7 个 page 图标
      expect(svgIcon(FlowUsIc.pages), findsNWidgets(7));
      await hoverRow(tester, '学习进度');
      final box = tester.widget<Container>(
        find.ancestor(of: find.text('学习进度'), matching: find.byType(Container)).first,
      );
      expect((box.decoration as BoxDecoration?)?.color, FlowUsColors.sidebarItemHover);
      expect(FlowUsColors.sidebarItemHover, const Color(0x08000000)); // rgba(0,0,0,0.03) 实测
      expect(svgIcon(FlowUsIc.pages), findsNWidgets(6)); // 被替换掉 1 个
    });

    testWidgets('悬停有子页的行：换成展开箭头（12×12），标题缩到 121 宽', (tester) async {
      await _pumpShell(tester);
      await hoverRow(tester, '磷化工知识库');
      expect(find.byKey(const ValueKey('row-chevron-pchem')), findsOneWidget);
      expect(svgIcon(FlowUsIc.folderContent), findsNothing); // 图标槽被箭头接管
      // 未悬停 161（= 210 − 41 − 8），悬停 121（再让出 4+20+4+20）
      expect(tester.getRect(find.text('磷化工知识库')).width, closeTo(121, 0.5));
    });

    testWidgets('悬停出现 ⋯ 与 ＋（各 20×20），移出即消失', (tester) async {
      await _pumpShell(tester);
      // 基线 2 处：顶部图标行的「更多」+ 底部「查看更多」；悬停某一行后再 +1
      expect(svgIcon(FlowUsIc.more), findsNWidgets(2));
      final g = await hoverRow(tester, '学习进度');
      expect(svgIcon(FlowUsIc.more), findsNWidgets(3));
      expect(svgIcon(FlowUsIc.add), findsNWidgets(3)); // 两个分区头（透明占位）+ 行内
      await g.moveTo(const Offset(1400, 500)); // 移到主区
      await tester.pumpAndSettle();
      expect(svgIcon(FlowUsIc.more), findsNWidgets(2));
      expect(svgIcon(FlowUsIc.add), findsNWidgets(2));
    });
  });

  group('页面树交互（M1-T04：点击/展开/建页/菜单/右键）', () {
    testWidgets('点页项行 → onOpenPage 收到该页 id', (tester) async {
      String? opened;
      await _pumpShell(
        tester,
        callbacks: SidebarCallbacks(onOpenPage: (id) => opened = id),
      );
      await tester.tap(find.text('学习进度'));
      await tester.pumpAndSettle();
      expect(opened, 'study');
    });

    testWidgets('悬停有子页的行点箭头 → onToggleExpand(父id, 目标态)', (tester) async {
      final calls = <(String, bool)>[];
      await _pumpShell(
        tester,
        callbacks: SidebarCallbacks(onToggleExpand: (id, ex) => calls.add((id, ex))),
      );
      await hoverRow(tester, '磷化工知识库');
      await tester.tap(find.byKey(const ValueKey('row-chevron-pchem')));
      await tester.pumpAndSettle();
      expect(calls, hasLength(1));
      expect(calls.single.$1, 'pchem');
      expect(calls.single.$2, false); // 测试数据里默认展开 → 点了变折叠
    });

    testWidgets('点分区头 + → onCreatePage(该分区)', (tester) async {
      final sections = <SidebarSection>[];
      await _pumpShell(
        tester,
        callbacks: SidebarCallbacks(onCreatePage: (s) => sections.add(s)),
      );
      // 两个分区头 + 都在（透明占位也可点）
      final adds = svgIcon(FlowUsIc.add);
      expect(tester.widgetList<Icon>(adds).length, 2);
      await tester.tap(find.byWidgetPredicate((w) => w is FlowUsSvgIcon && w.name == FlowUsIc.add).first); // 第一个 = 「空间」分区
      await tester.pumpAndSettle();
      expect(sections, [SidebarSection.space]);
    });

    testWidgets('行内 ＋ → onCreateChildPage(父id)', (tester) async {
      String? parent;
      await _pumpShell(
        tester,
        callbacks: SidebarCallbacks(onCreateChildPage: (pid) => parent = pid),
      );
      await hoverRow(tester, '学习进度');
      // 行内 hover 出两个钮：⋯ 在前、＋ 在后
      final rowAdd = find.descendant(
        of: find.ancestor(of: find.text('学习进度'), matching: find.byType(Row)).first,
        matching: svgIcon(FlowUsIc.add),
      );
      await tester.tap(rowAdd.last);
      await tester.pumpAndSettle();
      expect(parent, 'study');
    });

    testWidgets('行内 ⋯ → 弹 8 项菜单（顺序与分隔线按基准）', (tester) async {
      await _pumpShell(
        tester,
        callbacks: const SidebarCallbacks(onItemMenu: _noopItemMenu),
      );
      await hoverRow(tester, '学习进度');
      await tester.tap(find.byKey(const ValueKey('row-more-study')).first);
      await tester.pumpAndSettle();
      // 8 项全出、顺序正确
      for (final label in kSidebarItemMenuActions) {
        expect(find.text(label), findsOneWidget, reason: '菜单缺项：$label');
      }
      // 项宽 = 面板内容宽 222（224 − 边框 2）− 项左右外边距 8 = 214
      final size = tester.getSize(find.ancestor(of: find.text('重命名'), matching: find.byType(Container)).first);
      expect(size.width, closeTo(FlowUsComponents.menuPanelWidth - 2 - FlowUsComponents.menuItemMarginH * 2, 0.5));
    });

    testWidgets('菜单点「重命名」→ onItemMenu(pageId, 重命名)', (tester) async {
      final calls = <(String, String)>[];
      await _pumpShell(
        tester,
        callbacks: SidebarCallbacks(onItemMenu: (id, a) => calls.add((id, a))),
      );
      await hoverRow(tester, '学习进度');
      await tester.tap(find.byKey(const ValueKey('row-more-study')).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('重命名'));
      await tester.pumpAndSettle();
      expect(calls, hasLength(1));
      expect(calls.single.$1, 'study');
      expect(calls.single.$2, '重命名');
      // 菜单选完自动关
      expect(find.text('拷贝副本'), findsNothing);
    });

    testWidgets('右键页项 = ⋯ 同款菜单（8 项）', (tester) async {
      await _pumpShell(
        tester,
        callbacks: const SidebarCallbacks(onItemMenu: _noopItemMenu),
      );
      await tester.tap(find.text('学习进度'), buttons: kSecondaryButton);
      await tester.pumpAndSettle();
      expect(find.text('添加到快速访问'), findsOneWidget);
      expect(find.text('在新窗口打开'), findsOneWidget);
    });

    testWidgets('点菜单外关闭菜单', (tester) async {
      await _pumpShell(
        tester,
        callbacks: const SidebarCallbacks(onItemMenu: _noopItemMenu),
      );
      await hoverRow(tester, '学习进度');
      await tester.tap(find.byKey(const ValueKey('row-more-study')).first);
      await tester.pumpAndSettle();
      expect(find.text('重命名'), findsOneWidget);
      await tester.tapAt(const Offset(1200, 500)); // 主区空白
      await tester.pumpAndSettle();
      expect(find.text('重命名'), findsNothing);
    });

    testWidgets('无回调时点行不崩（纯展示模式）', (tester) async {
      await _pumpShell(tester); // 不传 callbacks
      await tester.tap(find.text('学习进度'));
      await tester.pumpAndSettle();
      expect(find.text('学习进度'), findsOneWidget);
    });
  });
}

void _noopItemMenu(String pageId, String action) {}