// 块菜单「颜色」面板（M2-T31）
//
// 实测（真 FlowUs · liunx命令页，块菜单右键点开后在主面板右侧弹出）：
//   · 面板 **239 宽**、圆角 12、内边距 `6px 0 0`；两段：**文字颜色**（y316..472）/ **背景颜色**（y482..638），每段 156 高
//   · 段标题 14/20 #91918E，距面板左 15；
//   · 每段第一格是 **22×22 的"无颜色"**（x=面板左+18）；
//   · 色板是 **30×30 全圆角**，横向起点 面板左+59，间距 15（722→767→812→858）；
//   · 背景色板三行（行距 40）：y523 / y563 / y603，色值实测见 [kBlockBackgroundSwatches]
//
// ⚠️ 本轮只做**背景颜色**：文字色在 appflowy 里要落到"行内 segment 的 color"，要动富文本 delta，另开 M2-T37。
// 文字颜色那一段**照实摆出来但点击不响应**（不编行为）。

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/material.dart';

const double kColorPanelWidth = 239;
const double kColorSectionHeight = 156;
const double kColorNoneSize = 22;
const double kColorSwatchSize = 30;
const double kColorSwatchGap = 15;
const double kColorRowGap = 40;
const double kColorTitleInset = 15;

/// 背景色板（三行，顺序即真机顺序；每行 4/5/5 个 + 每段开头一个"无颜色"）
const List<List<Color>> kBlockBackgroundSwatches = [
  [Color(0xFFF2F2F2), Color(0xFFF0EDE0), Color(0xFFFFE9D4), Color(0xFFFEEAF2)],
  [Color(0xFFFEF7D2), Color(0xFFD9F2EE), Color(0xFFDCEEFF), Color(0xFFE9E9FF), Color(0xFFFEE6E2)],
  [Color(0xFFFFFCBF), Color(0xFFD1FFF0), Color(0xFFCCF0FF), Color(0xFFE5DAFF), Color(0xFFFFD3D3)],
];

/// 把背景色写到块的 `background_color` 属性（内核读的是 #RRGGBB 字符串；null = 清除）
Future<bool> applyBlockBackground(EditorState editorState, Node node, Color? color) async {
  final value = color == null
      ? ''
      : '#' + color.toARGB32().toRadixString(16).padLeft(8, '0').substring(2).toUpperCase();
  final transaction = editorState.transaction
    ..updateNode(node, {blockComponentBackgroundColor: value.isEmpty ? null : value});
  await editorState.apply(transaction);
  return true;
}

class FlowUsColorPanel extends StatelessWidget {
  const FlowUsColorPanel({
    super.key,
    required this.onPickBackground,
    this.textSectionEnabled = false,
  });

  /// 选背景色（null = 无颜色）
  final ValueChanged<Color?> onPickBackground;

  /// 文字色这一段暂时只摆不响应
  final bool textSectionEnabled;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: kColorPanelWidth,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [
          BoxShadow(color: Color(0x0A191919), offset: Offset(0, 5), blurRadius: 8),
          BoxShadow(color: Color(0x0D191919), offset: Offset(0, 16), blurRadius: 24),
        ],
      ),
      padding: const EdgeInsets.only(top: 6),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Section(
            title: '文字颜色',
            enabled: textSectionEnabled,
            onPick: textSectionEnabled ? (_) {} : null,
          ),
          const SizedBox(height: 10),
          _Section(
            title: '背景颜色',
            enabled: true,
            onPick: onPickBackground,
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.enabled, required this.onPick});

  final String title;
  final bool enabled;
  final ValueChanged<Color?>? onPick;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: kColorSectionHeight,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 36,
            child: Padding(
              padding: const EdgeInsets.only(left: kColorTitleInset),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(title,
                    style: const TextStyle(fontSize: 14, height: 20 / 14, color: Color(0xFF91918E))),
              ),
            ),
          ),
          // 第 1 行：无颜色(22) + 4 个色块；第 2/3 行：各 5 个色块（实测：第1行左缩 18、后两行左缩 14）
          Padding(
            padding: const EdgeInsets.only(left: 18),
            child: Row(
              children: [
                _NoneSwatch(enabled: enabled, onTap: () => onPick?.call(null)),
                const SizedBox(width: 19),
                for (var i = 0; i < kBlockBackgroundSwatches[0].length; i++) ...[
                  if (i > 0) const SizedBox(width: kColorSwatchGap),
                  _Swatch(
                    color: kBlockBackgroundSwatches[0][i],
                    enabled: enabled,
                    onTap: () => onPick?.call(kBlockBackgroundSwatches[0][i]),
                  ),
                ],
              ],
            ),
          ),
          for (var row = 1; row < kBlockBackgroundSwatches.length; row++)
            Padding(
              padding: const EdgeInsets.only(left: 14, top: kColorRowGap - kColorSwatchSize),
              child: Row(
                children: [
                  for (var i = 0; i < kBlockBackgroundSwatches[row].length; i++) ...[
                    if (i > 0) const SizedBox(width: kColorSwatchGap),
                    _Swatch(
                      color: kBlockBackgroundSwatches[row][i],
                      enabled: enabled,
                      onTap: () => onPick?.call(kBlockBackgroundSwatches[row][i]),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _NoneSwatch extends StatelessWidget {
  const _NoneSwatch({required this.enabled, required this.onTap});

  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: Container(
        width: kColorNoneSize,
        height: kColorNoneSize,
        decoration: BoxDecoration(color: const Color(0x0F000000), borderRadius: BorderRadius.circular(2)),
      ),
    );
  }
}

class _Swatch extends StatelessWidget {
  const _Swatch({required this.color, required this.enabled, required this.onTap});

  final Color color;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: Container(
        width: kColorSwatchSize,
        height: kColorSwatchSize,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
    );
  }
}