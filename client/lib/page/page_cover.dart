// 页面封面与图标入口（M2-T11）
//
// 实测（2026-11-10，真 FlowUs 1920×945）：
//   · 封面 = **主区全宽** × **高 274**，紧贴标签条下沿（x=228、w=1684、y=48）
//   · 「添加图标」「添加封面」入口：14/20、颜色 **#BDBDBD**、高 20，位于标题上方 **22px**，
//     两者水平相隔 **41**；有封面时这两个入口不出现（只剩「添加评论」）
//   · 图标/封面**选择器本身没采到**（基准-界面清单 §2.9 只记到入口按钮）→ 这里只做入口 + 回调，
//     选择器面板留 M2-T23
//
// 数据字段对齐真实模型：页面块的 `data.icon`（emoji）与 `data.cover`/`coverPos`（见 `基准-文档模型` §3）。

import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// 封面图（主区全宽、高 274、紧贴标签条下沿）
class FlowUsPageCover extends StatelessWidget {
  const FlowUsPageCover({super.key, this.imageProvider});

  /// 封面图（空 = 不渲染封面；真 FlowUs 的 cover 存在页面块 data 里，现阶段由宿主注入）
  final ImageProvider? imageProvider;

  @override
  Widget build(BuildContext context) {
    final provider = imageProvider;
    if (provider == null) return const SizedBox.shrink();
    return SizedBox(
      height: FlowUsPageHeader.coverHeight,
      width: double.infinity,
      child: Image(image: provider, fit: BoxFit.cover),
    );
  }
}

/// 标题上方的两个入口：「添加图标」「添加封面」（只在没有图标/封面时出现，hover 才显）
class FlowUsPageHeaderEntries extends StatelessWidget {
  const FlowUsPageHeaderEntries({
    super.key,
    this.showIcon = true,
    this.showCover = true,
    this.onAddIcon,
    this.onAddCover,
    this.onAddComment,
  });

  /// 没有图标时才显示「添加图标」；有封面时不显示「添加封面」
  final bool showIcon;
  final bool showCover;
  final VoidCallback? onAddIcon;
  final VoidCallback? onAddCover;

  /// 「添加评论」始终在（实测有封面时也出现）
  final VoidCallback? onAddComment;

  @override
  Widget build(BuildContext context) {
    // 实测：入口常态就可见（computed opacity 1），不是 hover 才出现 → 不需要 hover 状态
    final entries = <Widget>[
      if (showIcon) _Entry(label: '添加图标', onTap: onAddIcon),
      if (showCover) _Entry(label: '添加封面', onTap: onAddCover),
      _Entry(label: '添加评论', onTap: onAddComment),
    ];
    return SizedBox(
        height: FlowUsPageHeader.entryHeight,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < entries.length; i++)
              Padding(
                padding: EdgeInsets.only(
                  right: i == entries.length - 1 ? 0 : FlowUsPageHeader.entriesGap,
                ),
                child: entries[i],
              ),
          ],
        ),
      );
  }
}

class _Entry extends StatelessWidget {
  const _Entry({required this.label, this.onTap});
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Text(
        label,
        style: TextStyle(
          fontSize: FlowUsPageHeader.entryFontSize,
          height: FlowUsPageHeader.entryLineHeight / FlowUsPageHeader.entryFontSize,
          fontWeight: FontWeight.w400,
          color: FlowUsPageHeader.entryColor, // #BDBDBD
        ),
      ),
    );
  }
}