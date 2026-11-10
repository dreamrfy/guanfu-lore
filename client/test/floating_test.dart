// 右下角浮动圆钮校验（M1-T07）
//
// 数值依据 docs/基准/证据/M1-T07/floating.json。
// 跑法：cd client && flutter test test/floating_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

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

void main() {
  // 在浮动钮组范围内找（侧栏 AI 行有同名图标，必须限定范围）
  Finder floating(Finder child) => find.descendant(
        of: find.byType(FlowUsFloatingButtons),
        matching: child,
      );

  testWidgets('两钮 36×36 全圆白底；右下角 right40/bottom40；钮间 gap 10', (tester) async {
    await _pumpShell(tester);
    final ai = tester.getRect(floating(find.byIcon(Icons.auto_awesome)));
    final help = tester.getRect(floating(find.byIcon(Icons.question_mark)));
    // 图标 20 / 16
    expect(ai.width, closeTo(FlowUsComponents.toolButtonIconSize, 0.5));
    expect(help.width, closeTo(16, 0.5));
    // 钮容器 36×36
    final aiBtn = tester.getRect(find.ancestor(of: floating(find.byIcon(Icons.auto_awesome)), matching: find.byType(Container)).first);
    expect(aiBtn.width, FlowUsComponents.floatingButton);
    expect(aiBtn.height, FlowUsComponents.floatingButton);
    // 位置：右缘 = 1920−40，下缘 = 945−40
    final group = tester.getRect(find.byType(FlowUsFloatingButtons));
    expect(group.right, closeTo(1880, 0.5));
    expect(group.bottom, closeTo(905, 0.5));
    // 钮间 gap 10（容器 92 = 顶 10 + 36 + 10 + 36，与实测一致）
    expect(group.height, closeTo(92, 0.5));
  });

  testWidgets('点两钮 → 回调；不显示时无钮', (tester) async {
    var aiTapped = false;
    var helpTapped = false;
    await _pumpShell(tester, onAi: () => aiTapped = true, onHelp: () => helpTapped = true);
    await tester.tap(floating(find.byIcon(Icons.auto_awesome)));
    await tester.tap(floating(find.byIcon(Icons.question_mark)));
    expect(aiTapped, isTrue);
    expect(helpTapped, isTrue);

    await _pumpShell(tester, show: false);
    expect(find.byType(FlowUsFloatingButtons), findsNothing);
  });
}
