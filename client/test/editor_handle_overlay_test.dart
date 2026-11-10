// M2-T21 集成验收：真编辑器里（AppFlowyEditor + overlay 层）手柄能不能画在块外、能不能点「＋」插块
//
// 这些断言在 M2-T07 那版做不到：手柄当时画在块内部，块外 20px 被内核裁掉、也点不到。
// 跑法：cd client && flutter test test/editor_handle_overlay_test.dart

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/flowus_icons.dart';
import 'package:bijiapp/editor/block_handle.dart';
import 'package:bijiapp/editor/flowus_editor.dart';

const _doc = '{"document":{"type":"page","children":['
    '{"type":"paragraph","data":{"delta":[{"insert":"悬停我"}]}},'
    '{"type":"paragraph","data":{"delta":[{"insert":"第二段"}]}}'
    ']}}';

Finder _icon(String name) => find.byWidgetPredicate((w) => w is FlowUsSvgIcon && w.name == name);

class _Bench {
  _Bench(this.state, this.mouse, this.handles);

  final EditorState state;
  final TestGesture mouse;
  final BlockHandleController handles;

  Widget build() => MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 708,
            child: FlowUsEditor(initialContent: _doc, onChanged: (_) {}),
          ),
        ),
      );
}

Future<_Bench> _pump(WidgetTester tester, {String content = _doc}) async {
  tester.view.physicalSize = const Size(1200, 800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  EditorState? captured;
  BlockHandleController? capturedHandles;
  final mouse = await tester.createGesture(kind: PointerDeviceKind.mouse);
  await mouse.addPointer(location: const Offset(1100, 750));
  addTearDown(mouse.removePointer);

  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      // 内容列在真应用里是居中的（x≈720）；这里给 260 的左留白，让“块左外 20px”落在屏幕内
      body: Padding(
        padding: const EdgeInsets.only(left: 260, top: 100),
        child: SizedBox(
          width: 708,
          child: FlowUsEditor(
            initialContent: content,
            onChanged: (_) {},
            onReady: (s) => captured = s,
            onHandlesReady: (h) => capturedHandles = h,
          ),
        ),
      ),
    ),
  ));
  await tester.pumpAndSettle();
  return _Bench(captured!, mouse, capturedHandles!);
}

void main() {
  testWidgets('悬停正文块 → 手柄出现在块左外 20px（overlay 画的，没被裁剪）', (tester) async {
    final b = await _pump(tester);
    await b.mouse.moveTo(tester.getCenter(find.text('悬停我', findRichText: true)));
    await tester.pumpAndSettle();

    final handle = _icon(FlowUsIc.menu);
    expect(handle, findsOneWidget);
    final textRect = tester.getRect(find.text('悬停我', findRichText: true));
    // 手柄 16 宽、右缘落在文字左缘左侧（块左缘 0 + 文字内边距，手柄 left = 块left-20）
    expect(tester.getSize(handle), const Size(16, 16));
    expect(tester.getRect(handle).right, lessThan(textRect.left));
  });

  testWidgets('贴左缘 → 「＋」出现；点它 → 块数 +1，新块是空段落', (tester) async {
    final b = await _pump(tester);
    expect(b.state.document.root.children.length, 2);

    await b.mouse.moveTo(tester.getCenter(find.text('悬停我', findRichText: true)));
    await tester.pumpAndSettle();
    final handleRect = tester.getRect(_icon(FlowUsIc.menu));
    // 挪到热区下半（「＋」的位置）
    await b.mouse.moveTo(Offset(handleRect.left + 10, handleRect.top + 14 + 10));
    await tester.pumpAndSettle();

    final plus = _icon(FlowUsIc.add);
    expect(plus, findsOneWidget, reason: '进热区后「＋」应出现');

    await tester.tap(plus);
    await tester.pumpAndSettle();
    expect(b.state.document.root.children.length, 3);
    expect(b.state.document.root.children[1].delta?.toPlainText(), '');
  });

  testWidgets('点手柄 → 块菜单打开；选「在上方插入」→ 块 +1 且菜单关闭', (tester) async {
    final b = await _pump(tester);
    expect(b.state.document.root.children.length, 2);

    await b.mouse.moveTo(tester.getCenter(find.text('悬停我', findRichText: true)));
    await tester.pumpAndSettle();
    await tester.tap(_icon(FlowUsIc.menu));
    await tester.pumpAndSettle();

    // 15 项都摆出来了
    expect(find.text('AI 助手'), findsOneWidget);
    expect(find.text('在上方插入'), findsOneWidget);
    expect(find.text('在右侧添加分栏'), findsOneWidget);

    await tester.tap(find.text('在上方插入'));
    await tester.pumpAndSettle();

    expect(b.state.document.root.children.length, 3);
    expect(b.state.document.root.children[1].delta?.toPlainText(), '悬停我');
    expect(find.text('AI 助手'), findsNothing, reason: '动作执行后菜单应关闭');
  });

  testWidgets('点菜单外的空白 → 菜单关闭、文档不变', (tester) async {
    final b = await _pump(tester);
    await b.mouse.moveTo(tester.getCenter(find.text('悬停我', findRichText: true)));
    await tester.pumpAndSettle();
    await tester.tap(_icon(FlowUsIc.menu));
    await tester.pumpAndSettle();
    expect(find.text('AI 助手'), findsOneWidget);

    await tester.tapAt(const Offset(1150, 760));
    await tester.pumpAndSettle();
    expect(find.text('AI 助手'), findsNothing);
    expect(b.state.document.root.children.length, 2);
  });

  testWidgets('拖拽排序：拖到末尾后顺序改变，拖拽中出现 2px 蓝指示线（M2-T26）', (tester) async {
    const three = '{"document":{"type":"page","children":['
        '{"type":"paragraph","data":{"delta":[{"insert":"AAA"}]}},'
        '{"type":"paragraph","data":{"delta":[{"insert":"BBB"}]}},'
        '{"type":"paragraph","data":{"delta":[{"insert":"CCC"}]}}'
        ']}}';
    final b = await _pump(tester, content: three);
    List<String> order() => [
      for (final n in b.state.document.root.children)
        if (n.delta!.toPlainText().isNotEmpty) n.delta!.toPlainText(),
    ];
    expect(order(), ['AAA', 'BBB', 'CCC']);

    final first = b.state.document.root.children.first;
    final lastRect = tester.getRect(find.text('CCC', findRichText: true));

    // 直接驱动控制器（手势接线在 release 里人工验；这里验排序与指示线的逻辑）
    b.handles.startDrag(first);
    b.handles.updateDrag(lastRect.bottom + 24);
    await tester.pump();
    final indicator = find.byWidgetPredicate((w) => w is ColoredBox && w.color == const Color(0xFF0285FF));
    expect(indicator, findsWidgets, reason: '拖拽中应出现落点指示线');
    expect(b.handles.dropIndex, isNotNull);

    await b.handles.endDrag();
    await tester.pumpAndSettle();
    expect(order(), ['BBB', 'CCC', 'AAA'], reason: '第一块应被移到末尾');
  });
}
