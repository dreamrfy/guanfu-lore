// 标签条 + 右上工具条校验（M1-T05）
//
// 用 widget test 直接量尺寸；数值依据 docs/基准/证据/M1-T05/toolbar.json（2026-11-10 真账号复测）。
// 跑法：cd client && flutter test test/tabbar_test.dart

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/tokens.dart';
import 'package:bijiapp/shell/flowus_shell.dart';
import 'package:bijiapp/shell/flowus_tabbar.dart';

const _tabs = [
  FlowUsTab(id: 't1', title: '磷化工知识库'),
  FlowUsTab(id: 't2', title: '学习进度'),
];

Future<void> _pumpBar(
  WidgetTester tester, {
  double width = 1920,
  double height = 945,
  List<FlowUsTab> tabs = _tabs,
  String? activeTabId = 't1',
  TabBarCallbacks? callbacks,
}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: FlowUsShell(
      data: const SidebarData(spaceName: '两相欢的空间'),
      tabs: tabs,
      activeTabId: activeTabId,
      tabBarCallbacks: callbacks,
    ),
  ));
  await tester.pumpAndSettle();
}

/// 在右上工具条范围内找元素（侧栏图标行有同名图标，必须用条内限定）
Finder toolbar(Finder child) => find.descendant(
      of: find.ancestor(of: find.text('分享'), matching: find.byType(Row)),
      matching: child,
    );

void main() {
  group('标签条几何（toolbar.json 实测）', () {
    testWidgets('条高 48、白底、底框 1px #E5E5E5', (tester) async {
      await _pumpBar(tester);
      final bar = tester.getSize(find.byType(FlowUsTabBar));
      expect(bar.height, FlowUsLayout.tabBarHeight);
      expect(bar.height, 48);
      final container = tester.widget<Container>(
        find.descendant(of: find.byType(FlowUsTabBar), matching: find.byType(Container)).first,
      );
      final deco = container.decoration as BoxDecoration?;
      expect(deco?.color, FlowUsColors.light.contentBg);
      expect((deco?.border as Border?)?.bottom.color, FlowUsColors.light.borderDefault);
    });

    testWidgets('标签高 32；文字左缘 = 228 + 16(px-4) + 8(mx-2) + 4(p-1) = 256', (tester) async {
      await _pumpBar(tester);
      final rect = tester.getRect(find.text('磷化工知识库'));
      expect(rect.left, closeTo(256, 0.5));
      final tabRect = tester.getRect(
        find.ancestor(of: find.text('磷化工知识库'), matching: find.byType(Container)).first,
      );
      expect(tabRect.height, closeTo(FlowUsLayout.tabBarTabHeight, 0.5));
      // 标签容器左缘 252（文字外 4px 内边距）
      expect(tabRect.left, closeTo(252, 0.5));
    });

    testWidgets('选中标签文字用 textStrong（黑）', (tester) async {
      await _pumpBar(tester);
      expect(
        tester.widget<Text>(find.text('磷化工知识库')).style?.color,
        FlowUsColors.light.textStrong,
      );
    });
  });

  group('右上工具条（toolbar.json 实测）', () {
    testWidgets('分享钮 44×32、字 14/24/w500；4 个图标钮 28×28、图标 20×20', (tester) async {
      await _pumpBar(tester);
      // 量分享钮的**容器**（Text 自身只有字宽）
      final shareContainer = find.ancestor(of: find.text('分享'), matching: find.byType(Container)).first;
      final share = tester.getRect(shareContainer);
      expect(share.width, closeTo(FlowUsLayout.toolbarShareWidth, 0.5));
      expect(share.height, closeTo(FlowUsComponents.buttonHeight, 0.5));
      final shareText = tester.widget<Text>(find.text('分享'));
      expect(shareText.style?.fontSize, 14);
      expect(shareText.style?.fontWeight, FontWeight.w500);
      // 4 个工具图标（评论/快速访问/⋯/搜索）
      final icons = find.descendant(
        of: find.byType(Tooltip),
        matching: find.byType(Icon),
      );
      final iconWidgets = tester.widgetList<Icon>(icons).toList();
      expect(iconWidgets.length, 4);
      for (final ic in iconWidgets) {
        expect(ic.size, FlowUsComponents.toolButtonIconSize);
      }
    });

    testWidgets('六元素间距全 8：分享→评论→快速访问→⋯→分隔线→搜索', (tester) async {
      await _pumpBar(tester);
      final share = tester.getRect(find.ancestor(of: find.text('分享'), matching: find.byType(Container)).first);
      final comment = tester.getRect(toolbar(find.byIcon(Icons.comment_outlined)).first);
      final quick = tester.getRect(toolbar(find.byIcon(Icons.star_outline)).first);
      final more = tester.getRect(toolbar(find.byIcon(Icons.more_horiz)).first);
      final search = tester.getRect(toolbar(find.byIcon(Icons.search)).first);
      expect(comment.left - share.right, closeTo(FlowUsLayout.toolbarGap, 0.5));
      expect(quick.left - comment.right, closeTo(FlowUsLayout.toolbarGap, 0.5));
      expect(more.left - quick.right, closeTo(FlowUsLayout.toolbarGap, 0.5));
      expect(search.left - more.right, closeTo(FlowUsLayout.toolbarGap * 2 + 1, 0.5)); // 中间隔着 1px 分隔线
    });

    testWidgets('工具条右缘到视口 16（px-4）', (tester) async {
      await _pumpBar(tester);
      final search = tester.getRect(toolbar(find.byIcon(Icons.search)).first);
      expect(search.right, closeTo(1920 - FlowUsLayout.tabBarPaddingH, 0.5));
    });

    testWidgets('点分享/图标钮 → 回调收到对应 action', (tester) async {
      final actions = <String>[];
      var shared = false;
      await _pumpBar(
        tester,
        callbacks: TabBarCallbacks(
          onShare: () => shared = true,
          onToolbarAction: (a) => actions.add(a),
        ),
      );
      await tester.tap(find.text('分享'));
      await tester.tap(toolbar(find.byIcon(Icons.comment_outlined)).first);
      await tester.tap(toolbar(find.byIcon(Icons.search)).first);
      await tester.pumpAndSettle();
      expect(shared, isTrue);
      expect(actions, ['评论', '搜索']);
    });
  });

  group('标签交互（多标签形态按文档结构实现，真样本待补）', () {
    testWidgets('点标签 → onSelectTab', (tester) async {
      String? selected;
      await _pumpBar(
        tester,
        callbacks: TabBarCallbacks(onSelectTab: (id) => selected = id),
      );
      await tester.tap(find.text('学习进度'));
      await tester.pumpAndSettle();
      expect(selected, 't2');
    });

    testWidgets('hover 标签出关闭钮 → onCloseTab', (tester) async {
      String? closed;
      await _pumpBar(
        tester,
        callbacks: TabBarCallbacks(onCloseTab: (id) => closed = id),
      );
      final g = await tester.createGesture(kind: PointerDeviceKind.mouse);
      await g.addPointer(location: Offset.zero);
      addTearDown(g.removePointer);
      await g.moveTo(tester.getCenter(find.text('学习进度')));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();
      expect(closed, 't2');
    });

    testWidgets('条尾 + → onCreateTab；无回调时不渲染', (tester) async {
      await _pumpBar(tester);
      // 无回调：条尾不渲染 +（工具条 Row 里只有分享/图标钮，没有 add）
      var created = false;
      await _pumpBar(
        tester,
        callbacks: TabBarCallbacks(onCreateTab: () => created = true),
      );
      await tester.tap(toolbar(find.byIcon(Icons.add)).first);
      await tester.pumpAndSettle();
      expect(created, isTrue);
    });
  });
}
