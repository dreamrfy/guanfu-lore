// 右下角浮动圆钮 + 帮助菜单校验（M1-T07）
//
// 数值依据：docs/基准/证据/M1-T07/offset-chain.json、help-menu-rows.json（2026-11-10 现场实测）。
// 跑法：cd client && flutter test test/floating_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/flowus_icons.dart';
import 'package:bijiapp/design/tokens.dart';
import 'package:bijiapp/shell/flowus_floating.dart';
import 'package:bijiapp/shell/flowus_shell.dart';

Future<void> _pumpShell(
  WidgetTester tester, {
  double width = 1920,
  double height = 945,
  bool show = true,
  VoidCallback? onAi,
  VoidCallback? onHelp,
}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: FlowUsShell(
      data: const SidebarData(spaceName: '两相欢的空间'),
      showFloatingButtons: show,
      onFloatingAiTap: onAi,
      onFloatingHelpTap: onHelp,
    ),
  ));
  await tester.pumpAndSettle();
}


/// 真图标现在是 SVG（M1-T12）：按名字找，而不是按 Material IconData
Finder svgIcon(String name) =>
    find.byWidgetPredicate((w) => w is FlowUsSvgIcon && w.name == name);

void main() {
  Finder floating(Finder child) =>
      find.descendant(of: find.byType(FlowUsFloatingButtons), matching: child);

  Finder buttonOf(String iconName) =>
      find.ancestor(of: floating(svgIcon(iconName)), matching: find.byType(Container)).first;

  testWidgets('两钮 36×36 全圆白底 1px 边框；距右 20、距底 86 / 40（实测渲染值）', (tester) async {
    await _pumpShell(tester);
    final ai = tester.getRect(buttonOf(FlowUsIc.aiFill));
    final help = tester.getRect(buttonOf(FlowUsIc.question));

    for (final r in [ai, help]) {
      expect(r.width, closeTo(FlowUsComponents.floatingButton, 0.5));
      expect(r.height, closeTo(FlowUsComponents.floatingButton, 0.5));
    }
    // 实测 x=1864 → 右缘 1900 = 1920 − 20；AI 钮距底 86、帮助钮距底 40
    expect(ai.right, closeTo(1900, 0.5));
    expect(help.right, closeTo(1900, 0.5));
    expect(945 - ai.bottom, closeTo(FlowUsFloating.aiBottom, 0.5));
    expect(945 - help.bottom, closeTo(FlowUsFloating.helpBottom, 0.5));
    // 钮间 gap = 86 − 40 − 36 = 10
    expect(
      FlowUsFloating.aiBottom - FlowUsFloating.helpBottom - FlowUsComponents.floatingButton,
      closeTo(FlowUsFloating.gap, 0.01),
    );

    final deco = tester.widget<Container>(buttonOf(FlowUsIc.aiFill)).decoration as BoxDecoration;
    expect(deco.shape, BoxShape.circle);
    expect(deco.color, Colors.white);
    expect((deco.border! as Border).top.color, const Color(0x0F000000)); // rgba(0,0,0,0.06)
    expect((deco.border! as Border).top.width, 1);
  });

  testWidgets('图标尺寸 20（AI）/ 16（帮助）', (tester) async {
    await _pumpShell(tester);
    expect(tester.widget<FlowUsSvgIcon>(floating(svgIcon(FlowUsIc.aiFill))).size, 20);
    expect(tester.widget<FlowUsSvgIcon>(floating(svgIcon(FlowUsIc.question))).size, 16);
  });

  testWidgets('点帮助钮 → 菜单 8 条 + 版本脚注；再点收起', (tester) async {
    await _pumpShell(tester);
    expect(find.text('帮助中心'), findsNothing);

    await tester.tap(floating(svgIcon(FlowUsIc.question)));
    await tester.pumpAndSettle();
    for (final label in [
      '帮助中心',
      '在线客服',
      '问题反馈',
      '更新日志',
      '键盘快捷键',
      '快捷命令',
      '导入任务列表',
      '官方网站',
    ]) {
      expect(find.text(label), findsOneWidget, reason: '菜单缺 $label');
    }
    expect(find.text('FlowUs 1.146.0'), findsOneWidget);

    await tester.tap(floating(svgIcon(FlowUsIc.question)));
    await tester.pumpAndSettle();
    expect(find.text('帮助中心'), findsNothing);
  });

  testWidgets('菜单几何：宽 260、距右 20、距底 84', (tester) async {
    await _pumpShell(tester);
    await tester.tap(floating(svgIcon(FlowUsIc.question)));
    await tester.pumpAndSettle();

    final menu = tester.getRect(find.ancestor(of: find.text('帮助中心'), matching: find.byType(Container)).last);
    expect(menu.width, closeTo(FlowUsFloating.menuWidth, 0.5));
    expect(1920 - menu.right, closeTo(FlowUsFloating.menuInsetRight, 0.5));
    expect(945 - menu.bottom, closeTo(FlowUsFloating.menuBottom, 0.5));
  });

  testWidgets('菜单行：高 32、文字 14/20 纯黑 #000', (tester) async {
    await _pumpShell(tester);
    await tester.tap(floating(svgIcon(FlowUsIc.question)));
    await tester.pumpAndSettle();

    final t = tester.widget<Text>(find.text('帮助中心'));
    expect(t.style?.fontSize, 14);
    expect(t.style?.height, closeTo(20 / 14, 0.0001));
    expect(t.style?.color, const Color(0xFF000000)); // 实测纯黑，不是正文的 #37352F

    final row = tester.getRect(find.ancestor(of: find.text('帮助中心'), matching: find.byType(SizedBox)).first);
    expect(row.height, closeTo(FlowUsFloating.menuItemHeight, 0.5));
  });

  testWidgets('分隔线 3 条：宽 226、色 #E5E5E5', (tester) async {
    await _pumpShell(tester);
    await tester.tap(floating(svgIcon(FlowUsIc.question)));
    await tester.pumpAndSettle();

    final seps = tester
        .widgetList<Container>(find.descendant(
          of: find.byType(FlowUsFloatingButtons),
          matching: find.byWidgetPredicate((w) => w is Container && w.constraints?.maxHeight == 1),
        ))
        .toList();
    expect(seps.length, 3, reason: '三组之间 2 条 + 版本脚注前 1 条');
    expect(seps.first.constraints!.maxWidth, closeTo(FlowUsFloating.menuSeparatorWidth, 0.5));
    expect(seps.first.color, FlowUsFloating.menuSeparatorColor);

    final footer = tester.widget<Text>(find.text('FlowUs 1.146.0'));
    expect(footer.style?.fontSize, 12);
    expect(footer.style?.color, const Color(0xFF91918E));
  });

  testWidgets('点菜单项 → 收起菜单（条目回调由 Shell 透传，本轮只验收起）', (tester) async {
    await _pumpShell(tester);
    await tester.tap(floating(svgIcon(FlowUsIc.question)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('键盘快捷键'));
    await tester.pumpAndSettle();
    expect(find.text('帮助中心'), findsNothing);
  });

  testWidgets('点 AI 钮 → 回调；AI 面板属 M9', (tester) async {
    var ai = false;
    await _pumpShell(tester, onAi: () => ai = true);
    await tester.tap(floating(svgIcon(FlowUsIc.aiFill)));
    await tester.pumpAndSettle();
    expect(ai, isTrue);
    expect(find.text('帮助中心'), findsNothing);
  });

  testWidgets('不显示时没有浮层', (tester) async {
    await _pumpShell(tester, show: false);
    expect(find.byType(FlowUsFloatingButtons), findsNothing);
  });
}