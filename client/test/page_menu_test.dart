// M2-T22 页面「⋯」长面板验收（M2-T13 首版 → 本轮按真机重测，结构大改）
//
// 实测（真 FlowUs 1920×945 · liunx命令页）：
//   面板 256 宽 / 圆角 12 / 内边距 4 0 ｜ 行 32 ｜ 文字 14/20 #000 ｜ 图标 16 距左 15、文字距左 39
//   快捷键 12/17 #91918E 右缘距右 27 ｜ 开关 30×18（开 #0285FF / 关 #BDBDBD，滑块 14 白）右缘距右 23
//   内联展开区（默认字体 / 页面布局）：标题 12/18 #91918E 距左 17；卡片 66×60、间距 8、圆角 4、
//     选中 #0285FF 边框 + rgba(2,133,255,0.05) 底 ｜ Plus 徽标 34×20 底 #FFF2C5 字 #8F6C28
//   导出页面：点击在左侧弹出 176 宽飞板，4 项 PDF/图片/Markdown & CSV/Word，行 32
// 跑法：cd client && flutter test test/page_menu_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/page/page_menu.dart';

Future<void> _pump(
  WidgetTester tester, {
  void Function(PageMenuRowEntry)? onItem,
  ValueChanged<String>? onExport,
}) async {
  tester.view.physicalSize = const Size(1000, 1700);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Align(
        alignment: Alignment.topRight,
        child: FlowUsPageMenu(onItem: onItem, onExport: onExport),
      ),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  group('常量与实测一致', () {
    test('面板 256 / 行 32 / 图标与文字缩进 / 快捷键与开关右缘 / 分隔线 / 卡片 / 飞板', () {
      expect(FlowUsPageMenuStyle.width, 256);
      expect(FlowUsPageMenuStyle.maxHeight, 851);
      expect(FlowUsPageMenuStyle.itemHeight, 32);
      expect(FlowUsPageMenuStyle.iconInset, 15);
      expect(FlowUsPageMenuStyle.itemTextInset, 39);
      expect(FlowUsPageMenuStyle.shortcutRightInset, 27);
      expect(FlowUsPageMenuStyle.toggleRightInset, 23);
      expect(FlowUsPageMenuStyle.toggleWidth, 30);
      expect(FlowUsPageMenuStyle.toggleHeight, 18);
      expect(FlowUsPageMenuStyle.toggleKnob, 14);
      expect(FlowUsPageMenuStyle.separatorInset, 17);
      expect(FlowUsPageMenuStyle.separatorWidth, 218);
      expect(FlowUsPageMenuStyle.cardWidth, 66);
      expect(FlowUsPageMenuStyle.cardHeight, 60);
      expect(FlowUsPageMenuStyle.cardGap, 8);
      expect(FlowUsPageMenuStyle.plusWidth, 34);
      expect(FlowUsPageMenuStyle.plusHeight, 20);
      expect(FlowUsPageMenuStyle.exportFlyoutWidth, 176);
      expect(FlowUsPageMenuStyle.exportFlyoutTop, 4);
    });

    test('9 组；行序与真机一致（两段内联展开区在第二组）', () {
      expect(kPageMenuGroups.length, 9);
      final rows = [for (final g in kPageMenuGroups) ...g.whereType<PageMenuRowEntry>()];
      expect([for (final r in rows) r.label], [
        '查找与替换', '固定宽度', '页面目录',
        '小字号', '评论位置', '演示模式',
        '锁定页面',
        '复制页面链接',
        '撤销', '重做', '页面历史', '已解决评论', '删除',
        '复制为公众号格式',
        '转换为模板', '导入', '导出页面',
        '移动到',
      ]);
      final sections = [for (final g in kPageMenuGroups) ...g.whereType<PageMenuSectionEntry>()];
      expect([for (final s in sections) s.title], ['默认字体', '页面布局']);
      expect(sections.first.options.length, 3);
      expect(sections.last.options.length, 3);
    });

    test('开关状态与实测一致：固定宽度 开 / 页面目录 关 / 小字号 关 / 转换为模板 关', () {
      final toggles = {
        for (final g in kPageMenuGroups)
          for (final e in g.whereType<PageMenuRowEntry>())
            if (e.toggle != null) e.label: e.toggle,
      };
      expect(toggles, {
        '固定宽度': true,
        '页面目录': false,
        '小字号': false,
        '转换为模板': false,
      });
    });

    test('导出格式 4 项', () {
      expect(kExportPageFormats, ['PDF', '图片', 'Markdown & CSV', 'Word']);
    });
  });

  group('渲染', () {
    testWidgets('面板宽 256、圆角 12、行高 32、文字 14/20', (tester) async {
      await _pump(tester);
      expect(tester.getRect(find.byType(FlowUsPageMenu)).width, 256);

      final rowBox = tester.getRect(find.ancestor(
        of: find.text('复制页面链接'),
        matching: find.byType(SizedBox),
      ).first);
      expect(rowBox.height, 32);

      final st = tester.widget<Text>(find.text('复制页面链接')).style!;
      expect(st.fontSize, 14);
      expect(st.height, closeTo(20 / 14, 1e-6));
      expect(st.color, const Color(0xFF000000));
    });

    testWidgets('快捷键 12/17 #91918E', (tester) async {
      await _pump(tester);
      final sc = tester.widget<Text>(find.text('Ctrl+Z')).style!;
      expect(sc.fontSize, 12);
      expect(sc.color, const Color(0xFF91918E));
    });

    testWidgets('开关：开 #0285FF / 关 #BDBDBD、30×18、滑块 14', (tester) async {
      await _pump(tester);
      final on = tester.widget<Container>(find.byKey(const ValueKey('page-menu-toggle-true')).first);
      final off = tester.widget<Container>(find.byKey(const ValueKey('page-menu-toggle-false')).first);
      expect(((on.decoration! as BoxDecoration).color), const Color(0xFF0285FF));
      expect(((off.decoration! as BoxDecoration).color), const Color(0xFFBDBDBD));
      expect(tester.getSize(find.byKey(const ValueKey('page-menu-toggle-true')).first), const Size(30, 18));
    });

    testWidgets('展开区：标题 + 3 张 66×60 卡片、选中边框 #0285FF、Plus 徽标 4 个', (tester) async {
      await _pump(tester);
      expect(find.text('默认字体'), findsOneWidget);
      expect(find.text('页面布局'), findsOneWidget);

      final selected = tester.widget<Container>(find.byKey(const ValueKey('page-menu-card-FlowUs-默认')));
      final deco = selected.decoration! as BoxDecoration;
      expect((deco.border! as Border).top.color, const Color(0xFF0285FF));
      expect(deco.color, const Color(0x0D0285FF));
      expect(tester.getSize(find.byKey(const ValueKey('page-menu-card-FlowUs-默认'))), const Size(66, 60));

      expect(find.text('Plus'), findsNWidgets(4));
    });

    testWidgets('底部统计 3 行', (tester) async {
      await _pump(tester);
      for (final line in kPageMenuFooter) {
        expect(find.text(line), findsOneWidget);
      }
    });
  });

  group('导出页面飞板', () {
    testWidgets('点「导出页面」→ 左侧出现 176 宽飞板、4 项；点 PDF 回调并收起', (tester) async {
      String? picked;
      await _pump(tester, onExport: (f) => picked = f);
      expect(find.text('PDF'), findsNothing);

      await tester.tap(find.text('导出页面'));
      await tester.pumpAndSettle();

      expect(find.text('PDF'), findsOneWidget);
      expect(find.text('Markdown & CSV'), findsOneWidget);
      // 飞板在主面板左侧
      // 打开飞板后整组变宽：面板在右侧 256，飞板在它左边
      final group = tester.getRect(find.byType(FlowUsPageMenu));
      expect(group.width, 176 + 256);
      final panelLeft = group.right - 256;
      expect(tester.getRect(find.text('PDF')).left, lessThan(panelLeft));

      await tester.tap(find.text('PDF'));
      await tester.pumpAndSettle();
      expect(picked, 'PDF');
      expect(find.text('PDF'), findsNothing, reason: '选完应收起飞板');
    });

    testWidgets('普通项点击仍走 onItem', (tester) async {
      PageMenuRowEntry? got;
      await _pump(tester, onItem: (e) => got = e);
      await tester.tap(find.text('撤销'));
      await tester.pump();
      expect(got?.label, '撤销');
    });
  });
}