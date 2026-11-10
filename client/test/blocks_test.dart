// M2-T04 基础块类型验收：各块的单行块高 / 缩进 / 字号（全部取实测值）
//
// 依据 `基准-块类型与块高.md` §2（隔离测试页实测）+ `基准-块级排版续` §1.1（标题 lv1 30/45/600）
// 跑法：cd client && flutter test test/blocks_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/page/blocks.dart';

Future<void> _pump(WidgetTester tester, List<PageBlock> blocks, {void Function(String, String)? onChanged, void Function(String)? onEnter}) async {
  tester.view.physicalSize = const Size(1000, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: SizedBox(
        width: 708,
        child: FlowUsBlockList(blocks: blocks, onChanged: onChanged ?? (_, _) {}, onEnter: onEnter),
      ),
    ),
  ));
  await tester.pumpAndSettle();
}

double _h(WidgetTester tester, String id) => tester.getRect(find.byKey(ValueKey('block-$id'))).height;

void main() {
  group('单行块高（实测值）', () {
    testWidgets('段落 34 / 空段落 34', (tester) async {
      await _pump(tester, const [
        PageBlock(id: 'p', kind: PageBlockKind.paragraph, text: '文字'),
        PageBlock(id: 'e', kind: PageBlockKind.paragraph),
      ]);
      expect(_h(tester, 'p'), closeTo(34, 0.5));
      expect(_h(tester, 'e'), closeTo(34, 0.5), reason: '空段落与普通段落同高（M0 的结论）');
    });

    testWidgets('标题 lv1 57 / lv2 52 / lv3 34 / lv4 31', (tester) async {
      await _pump(tester, const [
        PageBlock(id: 'h1', kind: PageBlockKind.heading1, level: 1, text: '一'),
        PageBlock(id: 'h2', kind: PageBlockKind.heading2, level: 2, text: '二'),
        PageBlock(id: 'h3', kind: PageBlockKind.heading3, level: 3, text: '三'),
        PageBlock(id: 'h4', kind: PageBlockKind.heading4, level: 4, text: '四'),
      ]);
      expect(_h(tester, 'h1'), closeTo(57, 0.5));
      expect(_h(tester, 'h2'), closeTo(52, 0.5));
      expect(_h(tester, 'h3'), closeTo(34, 0.5));
      expect(_h(tester, 'h4'), closeTo(31, 0.5));
    });

    testWidgets('项目符号 36 / 编号 34 / 分割线 36 / 引述 26 / 代码 26', (tester) async {
      await _pump(tester, const [
        PageBlock(id: 'b', kind: PageBlockKind.bulleted, text: '项'),
        PageBlock(id: 'n', kind: PageBlockKind.numbered, text: '项'),
        PageBlock(id: 'd', kind: PageBlockKind.divider),
        PageBlock(id: 'q', kind: PageBlockKind.quote, text: '引'),
        PageBlock(id: 'c', kind: PageBlockKind.code, text: 'code'),
      ]);
      expect(_h(tester, 'b'), closeTo(36, 0.5));
      expect(_h(tester, 'n'), closeTo(34, 0.5));
      expect(_h(tester, 'd'), closeTo(36, 0.5));
      expect(_h(tester, 'q'), closeTo(26, 0.5));
      expect(_h(tester, 'c'), closeTo(26, 0.5));
    });
  });

  group('缩进与字号', () {
    testWidgets('引述与代码块缩进 26（实测 x=742，内容列 716）', (tester) async {
      await _pump(tester, const [
        PageBlock(id: 'p', kind: PageBlockKind.paragraph, text: '段落'),
        PageBlock(id: 'q', kind: PageBlockKind.quote, text: '引述'),
        PageBlock(id: 'c', kind: PageBlockKind.code, text: 'code'),
      ]);
      // 量文字框（块容器带 left padding，它的 left 与父一致，量不出缩进）
      Rect fieldOf(String id) => tester.getRect(find.descendant(
            of: find.byKey(ValueKey('block-$id')),
            matching: find.byType(TextFormField),
          ));
      final p = fieldOf('p');
      final q = fieldOf('q');
      final c = fieldOf('c');
      // 代码块没有额外装饰 → 文字正好缩进 26
      expect(c.left - p.left, closeTo(26, 0.5));
      // 引述：块容器缩进 26（实测 x=742），文字还要再让出「左竖线 3 + 间距 12」
      // ⚠️ 竖线粗细与那 12px 的间距都**未实测**，这里的 41 = 26+3+12 是我们自己定的，已记入任务说明
      expect(q.left - p.left, closeTo(41, 0.5));
      expect(const PageBlock(id: 'x', kind: PageBlockKind.quote).indent, 26);
      expect(const PageBlock(id: 'y', kind: PageBlockKind.code).indent, 26);
    });

    testWidgets('标题 lv1 是 30 / 45 / w600（文档内标题，不是页面大标题 40/64）', (tester) async {
      await _pump(tester, const [
        PageBlock(id: 'h', kind: PageBlockKind.heading1, level: 1, text: '标题一'),
      ]);
      final st = tester
          .widget<TextField>(find.descendant(of: find.byType(TextFormField), matching: find.byType(TextField)))
          .style;
      expect(st?.fontSize, 30);
      expect(st?.height, closeTo(45 / 30, 0.0001));
      expect(st?.fontWeight, FontWeight.w600);
    });

    testWidgets('代码块 14 / 21 且等宽字体', (tester) async {
      await _pump(tester, const [PageBlock(id: 'c', kind: PageBlockKind.code, text: 'x = 1')]);
      final st = tester
          .widget<TextField>(find.descendant(of: find.byType(TextFormField), matching: find.byType(TextField)))
          .style;
      expect(st?.fontSize, 14);
      expect(st?.height, closeTo(21 / 14, 0.0001));
      expect(st?.fontFamily, 'monospace');
    });
  });

  group('编号与交互', () {
    testWidgets('编号列表序号自增，遇到别的块重置', (tester) async {
      await _pump(tester, const [
        PageBlock(id: 'n1', kind: PageBlockKind.numbered, text: '甲'),
        PageBlock(id: 'n2', kind: PageBlockKind.numbered, text: '乙'),
        PageBlock(id: 'p', kind: PageBlockKind.paragraph, text: '打断'),
        PageBlock(id: 'n3', kind: PageBlockKind.numbered, text: '丙'),
      ]);
      // n1→1. n2→2. ｜ 打断 ｜ n3 重新从 1 开始
      expect(find.text('1.'), findsNWidgets(2));
      expect(find.text('2.'), findsOneWidget);
      expect(find.text('3.'), findsNothing);
    });

    testWidgets('键入回调 (id, 文本)', (tester) async {
      final seen = <(String, String)>[];
      await _pump(tester, const [PageBlock(id: 'p', kind: PageBlockKind.paragraph, text: '旧')],
          onChanged: (id, t) => seen.add((id, t)));
      await tester.enterText(find.byType(TextFormField), '新的');
      await tester.pump();
      expect(seen, [('p', '新的')]);
    });

    testWidgets('待办块有勾选框（尺寸未实测，先 18×18）', (tester) async {
      await _pump(tester, const [PageBlock(id: 't', kind: PageBlockKind.todo, text: '待办', checked: true)]);
      expect(find.byIcon(Icons.check), findsOneWidget);
    });
  });
}