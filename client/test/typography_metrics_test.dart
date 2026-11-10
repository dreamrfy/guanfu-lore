// M1-T16 字体度量对照：用 TextPainter 量同字符串的宽度，与真 FlowUs（canvas measureText）比
//
// 真 FlowUs 基准（Chrome + 它自己的字体栈，14px）：
//   '磷化工知识库' @14/500 = 84.00
//   '学习进度'     @14/500 = 56.00
//   '空间容量已用完' @14/600 = 98.00
//   '升级后可继续上传' @12/400 = 96.00
//
// 若我们的宽度也相同 → 差异只在"字形粗细"（Flutter 对 w500 会合成假粗体，YaHei 没有 500 字重），
// 而不是字体族选错。这条测试就是用来把这两件事区分开的。

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/tokens.dart';

double _width(String text, {required double size, required FontWeight weight}) {
  final tp = TextPainter(
    text: TextSpan(
      text: text,
      style: TextStyle(
        fontFamily: FlowUsTypography.fontFamily,
        fontSize: size,
        fontWeight: weight,
      ),
    ),
    textDirection: TextDirection.ltr,
  )..layout();
  return tp.width;
}

void main() {
  test('CJK 字宽基准：每个汉字 14px（真 FlowUs canvas 实测 6 字 = 84）', () {
    final w = _width('磷化工知识库', size: 14, weight: FontWeight.w500);
    // 中文全角：6 字 × 14 = 84（允许 ±2 的字体差异）
    expect(w, closeTo(84, 2), reason: '实测宽度 $w，真 FlowUs 84');
  });

  test('4 字标题与 7 字卡片标题宽度同比例', () {
    expect(_width('学习进度', size: 14, weight: FontWeight.w500), closeTo(56, 2));
    expect(_width('空间容量已用完', size: 14, weight: FontWeight.w600), closeTo(98, 2));
    expect(_width('升级后可继续上传', size: 12, weight: FontWeight.w400), closeTo(96, 2));
  });

  test('字体栈与真 FlowUs 的 computed font-family 同序（第一项必须是 my-quote）', () {
    expect(FlowUsTypography.fontFamily.startsWith('my-quote'), true);
    expect(FlowUsTypography.fontFamily.contains('PingFang SC'), true);
    expect(FlowUsTypography.fontFamily.contains('Microsoft YaHei'), true);
  });
}