// 页面底部引用条（M2-T12）
//
// 规格：`基准-组件.md` §7 + M2-T12 本轮补采（真 FlowUs · liunx命令页，滚到底读取 DOM 盒）
//   · 整行高 **28**（chip 上下内边距 4 + 文字行高 20）
//   · 三段：`引用当前页面 0`、`提及的页面引用 0`、`引用建议 Beta`
//   · 文字 **14/20**；第一段（当前页引用）色 **#37352F**（正文色，表"激活"），后两段 **#91918E**
//   · 计数与文字间距 **4**；`Beta` 字色 **#5F5E5B**
//   · 段与段间距 **16**；chip 圆角 **4**、内边距 `4px 8px`
//   · 文字盒相对内容列左缘 **+28**（实测 744 − 716）
//
// ⚠️ 位置差异（如实记）：真 FlowUs 这条在**正文末尾、随内容滚动**；我们这版挂在内容列底部（固定），
//    因为正文用的是内核自己的滚动区（外层再套 ScrollView 会触发 "no offstage children"）。

import 'package:flutter/material.dart';

/// 行高（chip 高）
const double kFooterBarHeight = 28;

/// chip 内边距（上下 4 / 左右 8）
const double kFooterChipPadV = 4;
const double kFooterChipPadH = 8;

/// chip 圆角
const double kFooterChipRadius = 4;

/// 段与段间距
const double kFooterGroupGap = 16;

/// 文字与计数间距
const double kFooterCountGap = 4;

/// 文字盒相对内容列左缘的偏移（实测 +28）
const double kFooterLeftInset = 28;

class PageFooterInfo {
  const PageFooterInfo({
    this.backlinkCount = 0,
    this.mentionCount = 0,
  });

  /// 引用当前页面的页面数
  final int backlinkCount;

  /// 提及当前页面的引用数
  final int mentionCount;
}

class FlowUsPageFooter extends StatelessWidget {
  const FlowUsPageFooter({super.key, this.info = const PageFooterInfo()});

  final PageFooterInfo info;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: kFooterBarHeight,
      padding: const EdgeInsets.only(left: kFooterLeftInset),
      alignment: Alignment.centerLeft,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Chip(
            label: '引用当前页面',
            count: info.backlinkCount,
            color: const Color(0xFF37352F),
            countColor: const Color(0xFF37352F),
          ),
          const SizedBox(width: kFooterGroupGap),
          _Chip(
            label: '提及的页面引用',
            count: info.mentionCount,
            color: const Color(0xFF91918E),
            countColor: const Color(0xFF91918E),
          ),
          const SizedBox(width: kFooterGroupGap),
          _Chip(
            label: '引用建议',
            trailing: 'Beta',
            color: const Color(0xFF91918E),
            trailingColor: const Color(0xFF5F5E5B),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    this.count,
    this.trailing,
    required this.color,
    this.countColor,
    this.trailingColor,
  });

  final String label;
  final int? count;
  final String? trailing;
  final Color color;
  final Color? countColor;
  final Color? trailingColor;

  @override
  Widget build(BuildContext context) {
    const textStyle = TextStyle(fontSize: 14, height: 20 / 14);
    return Container(
      key: ValueKey('footer-chip-$label'),
      padding: const EdgeInsets.symmetric(vertical: kFooterChipPadV, horizontal: kFooterChipPadH),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(kFooterChipRadius)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: textStyle.copyWith(color: color)),
          if (count != null) ...[
            const SizedBox(width: kFooterCountGap),
            Text('$count', style: textStyle.copyWith(color: countColor ?? color)),
          ],
          if (trailing != null) ...[
            const SizedBox(width: kFooterCountGap),
            Text(trailing!, style: textStyle.copyWith(color: trailingColor ?? color)),
          ],
        ],
      ),
    );
  }
}