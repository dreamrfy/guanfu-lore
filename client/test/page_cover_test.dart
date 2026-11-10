// M2-T11 封面与图标入口验收（数值取 2026-11-10 真 FlowUs 实测）
//
// 封面：主区全宽 × 高 274，紧贴标签条下沿
// 入口：「添加图标」「添加封面」14/20 #BDBDBD、高 20、相隔 41，在标题上方 66（无封面时）
// 跑法：cd client && flutter test test/page_cover_test.dart

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/tokens.dart';
import 'package:bijiapp/page/page_cover.dart';

Future<void> _pumpEntries(
  WidgetTester tester, {
  bool showIcon = true,
  bool showCover = true,
  VoidCallback? onAddIcon,
  VoidCallback? onAddCover,
  VoidCallback? onAddComment,
}) async {
  tester.view.physicalSize = const Size(900, 300);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Align(
        alignment: Alignment.topLeft,
        child: FlowUsPageHeaderEntries(
          showIcon: showIcon,
          showCover: showCover,
          onAddIcon: onAddIcon,
          onAddCover: onAddCover,
          onAddComment: onAddComment,
        ),
      ),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  group('常量与实测一致', () {
    test('封面 274 高；入口 14/20 #BDBDBD；相隔 41；无封面时距内容顶 66；封面底到标题 79', () {
      expect(FlowUsPageHeader.coverHeight, 274);
      expect(FlowUsPageHeader.entryColor, const Color(0xFFBDBDBD));
      expect(FlowUsPageHeader.entryFontSize, 14);
      expect(FlowUsPageHeader.entryLineHeight, 20);
      expect(FlowUsPageHeader.entriesGap, 41);
      expect(FlowUsPageHeader.entriesTopInset, 66);
      expect(FlowUsPageHeader.titleTopAfterCover, 79);
    });
  });

  group('入口行', () {
    testWidgets('两个入口都在：文字 14/20、颜色 #BDBDBD', (tester) async {
      await _pumpEntries(tester);
      for (final label in ['添加图标', '添加封面', '添加评论']) {
        final t = tester.widget<Text>(find.text(label));
        expect(t.style?.fontSize, 14, reason: label);
        expect(t.style?.height, closeTo(20 / 14, 0.0001), reason: label);
        expect(t.style?.color, FlowUsPageHeader.entryColor, reason: label);
      }
      // 入口行高 20
      expect(tester.getSize(find.byType(FlowUsPageHeaderEntries)).height, 20);
    });

    testWidgets('两个入口水平相隔 41（实测 351→448）', (tester) async {
      await _pumpEntries(tester);
      final icon = tester.getRect(find.text('添加图标'));
      final cover = tester.getRect(find.text('添加封面'));
      expect(cover.left - icon.right, closeTo(FlowUsPageHeader.entriesGap, 0.5));
    });

    testWidgets('有图标 → 不显示「添加图标」；有封面 → 不显示「添加封面」', (tester) async {
      await _pumpEntries(tester, showIcon: false, showCover: false);
      expect(find.text('添加图标'), findsNothing);
      expect(find.text('添加封面'), findsNothing);
      expect(find.text('添加评论'), findsOneWidget, reason: '实测有封面时「添加评论」仍在');
    });

    testWidgets('点入口 → 回调', (tester) async {
      final hits = <String>[];
      await _pumpEntries(
        tester,
        onAddIcon: () => hits.add('icon'),
        onAddCover: () => hits.add('cover'),
        onAddComment: () => hits.add('comment'),
      );
      await tester.tap(find.text('添加图标'));
      await tester.tap(find.text('添加封面'));
      await tester.tap(find.text('添加评论'));
      await tester.pumpAndSettle();
      expect(hits, ['icon', 'cover', 'comment']);
    });
  });

  group('封面', () {
    testWidgets('给了图就渲染、高度正好 274', (tester) async {
      tester.view.physicalSize = const Size(1200, 600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 900,
            child: FlowUsPageCover(
              // 合法的 1×1 透明 PNG（67 字节；上面那版只有文件头，解码会失败）
              imageProvider: MemoryImage(Uint8List.fromList(const [
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
                0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
                0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
                0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
                0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
              ])),
            ),
          ),
        ),
      ));
      await tester.pump();
      expect(tester.getSize(find.byType(FlowUsPageCover)).height, 274);
      expect(tester.getSize(find.byType(FlowUsPageCover)).width, 900);
    });

    testWidgets('没给图 → 不占位（SizedBox.shrink）', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: Scaffold(body: FlowUsPageCover())));
      await tester.pumpAndSettle();
      expect(tester.getSize(find.byType(FlowUsPageCover)).height, 0);
    });
  });
}