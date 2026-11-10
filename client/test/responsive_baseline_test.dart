// M1-T10 窗口与自适应基线：跨视口宽度 × 缩放比的布局断言
//
// 依据 docs/基准/基准-全局框架.md §2：侧栏恒 228、内容列恒 708、主区内居中
//   内容列 x = 228 + (视口宽 − 228 − 708) / 2（1280/1440/1600/1920/2560 五个宽度实测）
//
// 跑法：cd client && flutter test test/responsive_baseline_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/flowus_icons.dart';
import 'package:bijiapp/design/tokens.dart';
import 'package:bijiapp/shell/flowus_floating.dart';
import 'package:bijiapp/shell/flowus_tabbar.dart';
import 'package:bijiapp/shell/flowus_shell.dart';

const _data = SidebarData(
  spaceName: '两相欢的空间',
  spacePages: [PageNode(id: 'a', title: '学习进度')],
  privatePages: [PageNode(id: 'b', title: '配置')],
);

/// 规格里实测过的 5 个宽度
const _widths = [1280.0, 1440.0, 1600.0, 1920.0, 2560.0];

double _expectedLeft(double w) => FlowUsLayout.sidebarWidth + (w - FlowUsLayout.sidebarWidth - FlowUsLayout.contentColumnWidth) / 2;

Future<void> _pump(
  WidgetTester tester, {
  required double width,
  required double height,
  double dpr = 1.0,
  bool tabs = true,
}) async {
  tester.view.physicalSize = Size(width * dpr, height * dpr);
  tester.view.devicePixelRatio = dpr;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: FlowUsShell(
      data: _data,
      tabs: tabs ? const [FlowUsTab(id: 't1', title: '标签甲')] : const [],
      activeTabId: tabs ? 't1' : null,
      showFloatingButtons: true,
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  group('横向：五个实测宽度（侧栏 228 / 内容列 708 / 主区内居中）', () {
    for (final w in _widths) {
      testWidgets('视口 $w 宽', (tester) async {
        await _pump(tester, width: w, height: 945);

        // 侧栏恒 228、撑满高度
        final side = tester.getRect(find.byType(FlowUsSidebar));
        expect(side.width, FlowUsLayout.sidebarWidth);
        expect(side.left, 0);
        expect(side.height, 945);

        // 内容列 708、左缘按公式
        final title = tester.getRect(find.text('无标题'));
        expect(title.width, FlowUsLayout.contentColumnWidth);
        expect(title.left, closeTo(_expectedLeft(w), 0.5), reason: '$w 宽下内容列左缘');

        // 没有溢出异常
        expect(tester.takeException(), isNull);
      });
    }
  });

  group('缩放：100% / 125% / 150% 下同一物理窗口 → 逻辑布局一致', () {
    // 物理 1920×945 的窗口：100% = 1920 逻辑宽；125% = 1536 逻辑宽；150% = 1280 逻辑宽
    const physical = Size(1920, 945);
    final cases = <double, double>{
      1.0: 1920, // 逻辑宽
      1.25: 1536,
      1.5: 1280,
    };

    cases.forEach((dpr, logicalWidth) {
      testWidgets('DPR $dpr → 逻辑宽 $logicalWidth', (tester) async {
        tester.view.physicalSize = physical;
        tester.view.devicePixelRatio = dpr;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(MaterialApp(
          home: FlowUsShell(
            data: _data,
            tabs: const [FlowUsTab(id: 't1', title: '标签甲')],
            activeTabId: 't1',
          ),
        ));
        await tester.pumpAndSettle();

        final side = tester.getRect(find.byType(FlowUsSidebar));
        expect(side.width, FlowUsLayout.sidebarWidth, reason: '侧栏不随缩放变');

        final title = tester.getRect(find.text('无标题'));
        expect(title.width, FlowUsLayout.contentColumnWidth);
        expect(title.left, closeTo(_expectedLeft(logicalWidth), 0.5));
        expect(tester.takeException(), isNull);
      });
    });
  });

  group('纵向：有/无横幅两种状态（主内容区 y=92 / 48）', () {
    testWidgets('无横幅时标题顶部 = 48 + 入口行(66+20+2) = 136（M2-T11 实测）', (tester) async {
      await _pump(tester, width: 1920, height: 945);
      final title = tester.getRect(find.text('无标题'));
      // 内容区顶 48 → 入口行留白 66 → 入口行 20 → 2 → 标题（真 FlowUs 实测标题 y=136）
      expect(title.top, closeTo(FlowUsLayout.contentTopWithoutBanner + 88, 0.5));
      expect(title.top, closeTo(136, 0.5));
    });

    testWidgets('有系统横幅时标题整体下推 44（92 + 88 = 180）', (tester) async {
      tester.view.physicalSize = const Size(1920, 945);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(MaterialApp(
        home: FlowUsShell(
          data: _data,
          tabs: const [FlowUsTab(id: 't1', title: '标签甲')],
          activeTabId: 't1',
          systemBannerText: '空间容量已满，升级后可继续上传',
        ),
      ));
      await tester.pumpAndSettle();

      final title = tester.getRect(find.text('无标题'));
      expect(title.top, closeTo(FlowUsLayout.contentTopWithBanner + 88, 0.5));
      expect(tester.takeException(), isNull);
    });
  });

  group('窄窗口与矮窗口的防守线', () {
    testWidgets('1280×720（常见最小桌面窗）不溢出、内容列不出侧栏', (tester) async {
      await _pump(tester, width: 1280, height: 720);
      final title = tester.getRect(find.text('无标题'));
      expect(title.left, greaterThanOrEqualTo(FlowUsLayout.sidebarWidth));
      expect(tester.takeException(), isNull, reason: '矮窗口不应溢出（侧栏需要能滚）');
    });

    testWidgets('浮层（浮动钮）贴视口右缘，不因缩放漂移', (tester) async {
      await _pump(tester, width: 1600, height: 900);
      final ai = tester.getRect(
        find.ancestor(
          of: find.descendant(
            of: find.byType(FlowUsFloatingButtons),
            matching: find.byWidgetPredicate((w) => w is FlowUsSvgIcon && w.name == FlowUsIc.aiFace),
          ),
          matching: find.byType(Container),
        ).first,
      );
      expect(ai.right, closeTo(1600 - FlowUsFloating.insetRight, 0.5));
    });
  });
}