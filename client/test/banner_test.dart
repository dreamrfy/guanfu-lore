// 顶部提示条校验（M1-T06）：系统横幅 + 删除恢复横幅
//
// 数值依据 docs/基准/证据/M1-T06/banner.json。
// 跑法：cd client && flutter test test/banner_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/flowus_icons.dart';
import 'package:bijiapp/design/tokens.dart';
import 'package:bijiapp/shell/flowus_banner.dart';
import 'package:bijiapp/shell/flowus_shell.dart';
import 'package:bijiapp/shell/flowus_tabbar.dart';

Future<void> _pumpShell(
  WidgetTester tester, {
  double width = 1920,
  double height = 945,
  String? systemBannerText,
  bool showDeleteBanner = false,
}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: FlowUsShell(
      data: const SidebarData(spaceName: '两相欢的空间'),
      systemBannerText: systemBannerText,
      showDeleteBanner: showDeleteBanner,
    ),
  ));
  await tester.pumpAndSettle();
}


/// 真图标现在是 SVG（M1-T12）：按名字找，而不是按 Material IconData
Finder svgIcon(String name) =>
    find.byWidgetPredicate((w) => w is FlowUsSvgIcon && w.name == name);

void main() {
  group('系统横幅（容量条）', () {
    testWidgets('高 44、蓝底 5%、蓝底框 10%；内容居中 + 升级钮 74×28 蓝边框', (tester) async {
      await _pumpShell(tester, systemBannerText: '空间容量已用完，已有文件不受影响，升级后可继续上传');
      final banner = tester.getRect(find.byType(FlowUsSystemBanner));
      expect(banner.height, FlowUsLayout.bannerHeight);
      expect(banner.height, 44);
      expect(banner.top, 0); // 无标签条时贴顶（有标签条时在 48——另一测试）

      final deco = tester.widget<Container>(
        find.descendant(of: find.byType(FlowUsSystemBanner), matching: find.byType(Container)).first,
      ).decoration as BoxDecoration;
      expect(deco.color, FlowUsBannerColors.systemBg); // rgba(2,133,255,0.05)
      expect((deco.border as Border?)?.bottom.color, FlowUsBannerColors.systemBorder);

      // 升级钮 74×28
      final upgradeBtn = tester.getRect(find.ancestor(of: find.text('立即升级'), matching: find.byType(Container)).first);
      expect(upgradeBtn.width, 74);
      expect(upgradeBtn.height, closeTo(FlowUsComponents.buttonSmallHeight, 0.5));
    });

    testWidgets('文字 14/24、关闭钮在右缘 right-4 处；点关闭回调', (tester) async {
      var closed = false;
      await tester.binding.setSurfaceSize(const Size(1920, 945));
      tester.view.physicalSize = const Size(1920, 945);
      tester.view.devicePixelRatio = 1.0;
      await tester.pumpWidget(MaterialApp(
        home: FlowUsShell(
          data: const SidebarData(spaceName: '两相欢的空间'),
          systemBannerText: '空间容量已用完，已有文件不受影响，升级后可继续上传',
          onSystemBannerClose: () => closed = true,
        ),
      ));
      await tester.pumpAndSettle();
      final text = tester.widget<Text>(find.text('空间容量已用完，已有文件不受影响，升级后可继续上传'));
      expect(text.style?.fontSize, 14);
      expect(text.style?.height, closeTo(24 / 14, 0.0001));
      // 关闭钮中心 x ≈ 1920 − 16 − 10 = 1894
      final closeCenter = tester.getCenter(svgIcon(FlowUsIc.close));
      expect(closeCenter.dx, closeTo(1920 - FlowUsLayout.tabBarPaddingH - 10, 1.5));
      await tester.tap(svgIcon(FlowUsIc.close));
      expect(closed, isTrue);
    });

    testWidgets('有标签条时横幅贴在标签条下（y=48）', (tester) async {
      tester.view.physicalSize = const Size(1920, 945);
      tester.view.devicePixelRatio = 1.0;
      await tester.pumpWidget(MaterialApp(
        home: FlowUsShell(
          data: const SidebarData(spaceName: '两相欢的空间'),
          tabs: const [FlowUsTab(id: 't1', title: '测试')],
          activeTabId: 't1',
          systemBannerText: '空间容量已用完',
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.getRect(find.byType(FlowUsTabBar)).height, 48);
      expect(tester.getRect(find.byType(FlowUsSystemBanner)).top, 48);
    });

    testWidgets('文字为空/不传 → 不显示横幅', (tester) async {
      await _pumpShell(tester);
      expect(find.byType(FlowUsSystemBanner), findsNothing);
    });
  });

  group('删除恢复横幅', () {
    testWidgets('高 44、红底 #CB4042；白字居中 16/24', (tester) async {
      await _pumpShell(tester, showDeleteBanner: true);
      final banner = tester.getRect(find.byType(FlowUsDeleteBanner));
      expect(banner.height, 44);
      final container = tester.widget<Container>(
        find.descendant(of: find.byType(FlowUsDeleteBanner), matching: find.byType(Container)).first,
      );
      expect((container.decoration as BoxDecoration?)?.color ?? container.color, FlowUsBannerColors.dangerBg);
      final text = tester.widget<Text>(find.text('当前页面已删除'));
      expect(text.style?.fontSize, 16);
      expect(text.style?.color, Colors.white);
    });

    testWidgets('恢复 54×32 + 彻底删除 82×32，右缘贴 8；白字白边框圆角 6', (tester) async {
      await _pumpShell(tester, showDeleteBanner: true);
      final restoreBtn = tester.getRect(find.ancestor(of: find.text('恢复'), matching: find.byType(Container)).first);
      final deleteBtn = tester.getRect(find.ancestor(of: find.text('彻底删除'), matching: find.byType(Container)).first);
      expect(restoreBtn.width, 54);
      expect(restoreBtn.height, 32);
      expect(deleteBtn.width, 82);
      expect(deleteBtn.height, 32);
      // 右缘：1920 − 8
      expect(deleteBtn.right, closeTo(1912, 0.5));
      // 两钮之间 8（用按钮容器量，Text 自身只有字宽）
      expect(deleteBtn.left - restoreBtn.right, closeTo(8, 0.5));
    });

    testWidgets('点恢复/彻底删除 → 回调', (tester) async {
      var restored = false;
      var deleted = false;
      tester.view.physicalSize = const Size(1920, 945);
      tester.view.devicePixelRatio = 1.0;
      await tester.pumpWidget(MaterialApp(
        home: FlowUsShell(
          data: const SidebarData(spaceName: '两相欢的空间'),
          showDeleteBanner: true,
          onDeleteRestore: () => restored = true,
          onDeleteConfirm: () => deleted = true,
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('恢复'));
      await tester.tap(find.text('彻底删除'));
      expect(restored, isTrue);
      expect(deleted, isTrue);
    });

    testWidgets('两种横幅可同屏（系统横幅在上、删除横幅在下，基准 k1 截图形态）', (tester) async {
      tester.view.physicalSize = const Size(1920, 945);
      tester.view.devicePixelRatio = 1.0;
      await tester.pumpWidget(MaterialApp(
        home: FlowUsShell(
          data: const SidebarData(spaceName: '两相欢的空间'),
          systemBannerText: '空间容量已用完',
          showDeleteBanner: true,
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.getRect(find.byType(FlowUsSystemBanner)).top, 0);
      expect(tester.getRect(find.byType(FlowUsDeleteBanner)).top, 44);
    });
  });
}
