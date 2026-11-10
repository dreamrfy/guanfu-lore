// M1-T09 回收站面板的验收：面板/搜索/列头/行/动作钮/清空/空态
//
// 数值依据 docs/基准/证据/M1-T09/（2026-11-10 现场实测，见 tokens 的 FlowUsTrash）。
// 跑法：cd client && flutter test test/trash_panel_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/flowus_icons.dart';
import 'package:bijiapp/design/tokens.dart';
import 'package:bijiapp/shell/flowus_trash_panel.dart';

const _entries = [
  TrashEntry(id: 'a', title: '页面甲', deletedAtLabel: '2026 年 11 月 10 日 09:46'),
  TrashEntry(
    id: 'b',
    title: '页面乙',
    subtitle: '微信公众号剪藏',
    deletedAtLabel: '2026 年 11 月 9 日 16:27',
  ),
];

Future<void> _pump(
  WidgetTester tester, {
  List<TrashEntry> entries = _entries,
  void Function(TrashEntry)? onRestore,
  void Function(TrashEntry)? onDelete,
  VoidCallback? onClear,
}) async {
  tester.view.physicalSize = const Size(1920, 945);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Center(
        child: FlowUsTrashPanel(
          entries: entries,
          onRestore: onRestore,
          onDeleteForever: onDelete,
          onClearAll: onClear,
        ),
      ),
    ),
  ));
  await tester.pumpAndSettle();
}


/// 真图标现在是 SVG（M1-T12）：按名字找，而不是按 Material IconData
Finder svgIcon(String name) =>
    find.byWidgetPredicate((w) => w is FlowUsSvgIcon && w.name == name);

void main() {
  testWidgets('面板 638×608、圆角 12、白底、1px rgba(0,0,0,0.06)', (tester) async {
    await _pump(tester);
    final panel = find.byType(FlowUsTrashPanel);
    final rect = tester.getRect(panel);
    expect(rect.width, FlowUsTrash.panelWidth);
    expect(rect.height, FlowUsTrash.panelHeight);

    final box = tester.widget<Container>(find.descendant(of: panel, matching: find.byType(Container)).first);
    final deco = box.decoration as BoxDecoration;
    expect(deco.color, FlowUsTrash.panelBg);
    expect((deco.borderRadius! as BorderRadius).topLeft.x, FlowUsTrash.panelRadius);
    expect((deco.border! as Border).top.color, FlowUsTrash.panelBorderColor);
    expect(deco.boxShadow!.first.offset, const Offset(0, 5));
    expect(deco.boxShadow!.first.blurRadius, 8);
  });

  testWidgets('搜索框 616×32（外 10 边距）、底 #F7F7F7、提示「在回收站中搜索」', (tester) async {
    await _pump(tester);
    final field = find.byType(TextField);
    expect(field, findsOneWidget);
    expect(tester.widget<TextField>(field).decoration?.hintText, '在回收站中搜索');

    final boxFinder = find.ancestor(of: field, matching: find.byType(Container)).first;
    final box = tester.widget<Container>(boxFinder);
    final deco = box.decoration as BoxDecoration;
    expect(deco.color, FlowUsTrash.searchBg); // #F7F7F7
    expect((deco.borderRadius! as BorderRadius).topLeft.x, FlowUsTrash.searchRadius);

    final r = tester.getRect(boxFinder);
    expect(r.height, FlowUsTrash.searchHeight);
    // 638 − 左右边框 1×2 − 外边距 10×2 = 616（与实测一致）
    expect(r.width, closeTo(FlowUsTrash.panelWidth - 2 - FlowUsTrash.searchMargin * 2, 0.5));
  });

  testWidgets('列头：高 46、「页面」左偏 15、「删除时间」左偏 345、色 #91918E', (tester) async {
    await _pump(tester);
    final panelRect = tester.getRect(find.byType(FlowUsTrashPanel));
    final page = tester.getRect(find.text('页面'));
    final time = tester.getRect(find.text('删除时间'));

    // 列头容器左缘 = 面板左缘（实测 228 相对 227 差 1 的边框）
    expect(page.left - panelRect.left, closeTo(FlowUsTrash.titleColumnInset + 1, 1));
    expect(time.left - panelRect.left, closeTo(FlowUsTrash.timeColumnInset + 1, 1));

    final st = tester.widget<Text>(find.text('页面')).style;
    expect(st?.fontSize, 14);
    expect(st?.height, closeTo(20 / 14, 0.0001));
    expect(st?.color, FlowUsTrash.columnHeaderColor);
  });

  testWidgets('行：612 宽、单行 38 / 带副标题 58、标题 14-20 w600 #000', (tester) async {
    await _pump(tester);
    // 注意：带 margin 的 Container 的 getRect 含 margin，所以按**位置**校验：
    // 实测行 x=236..848、面板 227..865 → 左 9、右 17，可见宽度 612
    final panelRect0 = tester.getRect(find.byType(FlowUsTrashPanel));
    final rowA = tester.getRect(find.byKey(const ValueKey('trash-row-a')));
    // margin 盒贴着内容区（面板边框 1px），所以左/右各差 1；可见宽度 = 盒宽 − 24（左右 margin）
    expect(rowA.left - panelRect0.left, closeTo(1, 0.5));
    expect(panelRect0.right - rowA.right, closeTo(1, 0.5));
    expect(rowA.width - 24, closeTo(FlowUsTrash.rowWidth, 0.5));
    expect(rowA.height, closeTo(FlowUsTrash.rowSingleHeight, 0.5));

    final rowB = tester.getRect(find.byKey(const ValueKey('trash-row-b')));
    expect(rowB.height, closeTo(FlowUsTrash.rowDoubleHeight, 0.5));

    final title = tester.widget<Text>(find.text('页面甲')).style;
    expect(title?.fontSize, 14);
    expect(title?.fontWeight, FontWeight.w600);
    expect(title?.color, FlowUsTrash.rowTitleColor);

    final sub = tester.widget<Text>(find.text('微信公众号剪藏')).style;
    expect(sub?.fontSize, 12);
    expect(sub?.color, FlowUsTrash.rowSubtitleColor);
  });

  testWidgets('删除时间 14/20 #5F5E5B，固定 220 宽列', (tester) async {
    await _pump(tester);
    final t = tester.widget<Text>(find.text('2026 年 11 月 10 日 09:46'));
    expect(t.style?.fontSize, 14);
    expect(t.style?.height, closeTo(20 / 14, 0.0001));
    expect(t.style?.color, FlowUsTrash.rowTimeColor);

    final col = tester.getRect(find.ancestor(of: find.text('2026 年 11 月 10 日 09:46'), matching: find.byType(SizedBox)).first);
    expect(col.width, 220);
  });

  testWidgets('行内两个动作钮 20×20、间距 8，点了各自回调', (tester) async {
    final restored = <String>[];
    final deleted = <String>[];
    await _pump(
      tester,
      onRestore: (e) => restored.add(e.id),
      onDelete: (e) => deleted.add(e.id),
    );

    final undo = svgIcon(FlowUsIc.luUndo2).first;
    final del = svgIcon(FlowUsIc.trash).first;
    expect(tester.getRect(find.ancestor(of: undo, matching: find.byType(Container)).first).width,
        FlowUsTrash.rowActionSize);
    expect(tester.getRect(find.ancestor(of: del, matching: find.byType(Container)).first).width,
        FlowUsTrash.rowActionSize);

    expect(FlowUsTrash.rowActionGap, 8);
    // 两个钮之间的间距 = 右侧钮左缘 − 左侧钮右缘
    final btnGap = tester.getRect(
          find.ancestor(of: del, matching: find.byType(Container)).first,
        ).left -
        tester.getRect(find.ancestor(of: undo, matching: find.byType(Container)).first).right;
    expect(btnGap, closeTo(FlowUsTrash.rowActionGap, 0.6));

    await tester.tap(undo);
    await tester.pumpAndSettle();
    await tester.tap(del);
    await tester.pumpAndSettle();
    expect(restored, ['a']);
    expect(deleted, ['a']);
  });

  testWidgets('底部「清空回收站」可点，触发回调', (tester) async {
    var cleared = false;
    await _pump(tester, onClear: () => cleared = true);
    expect(find.text('清空回收站'), findsOneWidget);
    await tester.tap(find.text('清空回收站'));
    await tester.pumpAndSettle();
    expect(cleared, isTrue);
  });

  testWidgets('空列表 → 显示空态（文案未实测，先用「回收站为空」）', (tester) async {
    await _pump(tester, entries: const []);
    expect(find.text('回收站为空'), findsOneWidget);
    expect(find.text('页面甲'), findsNothing);
  });
}