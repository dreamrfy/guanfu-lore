// 外观设置面板（M12-T02 · 字体主题 + M12-T03 · 图标主题）
//
// 用户 2026-11-11：「字体和图标能不能和其他的软件一样，搞成字体包、图标组？
// 系统默认一套风格，然后内置几个其他不同风格，用户喜欢什么自己切换？」
//
// 所以这里就是一个**可切换的外观选择器**：
//   · 字体：内置主题表 + 一键切换（全 App 立刻生效）+ 存进 app_settings
//   · 图标：内置主题表 + 一键切换（同上）
//
// ⚠️ 与 M2R 的"壳子"教训对照：这里每个选项**点下去真的会变**，
//    而且**重开 App 还在**（存 app_settings，不是内存变量）。

import 'package:flutter/material.dart';

import '../design/ai_face.dart';
import '../design/font_themes.dart';
import '../design/flowus_icons.dart';
import '../design/icon_themes.dart';
import '../design/tokens.dart';

/// 外观设置面板
class AppearancePanel extends StatelessWidget {
  const AppearancePanel({
    super.key,
    required this.fontTheme,
    required this.iconTheme,
    required this.onFontChanged,
    required this.onIconChanged,
    this.onClose,
  });

  final FontTheme fontTheme;
  final IconThemeSet iconTheme;
  final void Function(FontTheme theme) onFontChanged;
  final void Function(IconThemeSet theme) onIconChanged;

  /// 关闭面板（可选）
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Text('外观',
                  style: TextStyle(
                      fontSize: 15, height: 22 / 15, fontWeight: FontWeight.w600)),
              const Spacer(),
              if (onClose != null)
                InkWell(
                  onTap: onClose,
                  child: const Padding(
                    padding: EdgeInsets.all(4),
                    child: Icon(Icons.close, size: 16, color: Color(0xFF91918E)),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          const _SectionTitle('字体'),
          const SizedBox(height: 8),
          for (final t in FontThemes.all)
            _ChoiceTile(
              title: t.label,
              subtitle: t.note,
              selected: t.id == fontTheme.id,
              onTap: () => onFontChanged(t),
            ),
          const SizedBox(height: 20),
          const _SectionTitle('图标'),
          const SizedBox(height: 8),
          for (final t in IconThemeSets.all)
            _ChoiceTile(
              title: t.label,
              subtitle: t.note,
              selected: t.id == iconTheme.id,
              onTap: () => onIconChanged(t),
              // 预览：AI 入口那个"渐变圆脸"是 FlowUs 的私有视觉，开源库里没有 →
              // 这里用**自绘**的通用渐变圆脸（蓝紫渐变，非任何产品资产）做示意。
              preview: t.id == IconThemeSets.mingcute.id
                  ? const FlowUsAiFace(size: 22)
                  : FlowUsSvgIcon(FlowUsIc.ai, size: 22),
            ),
          const SizedBox(height: 20),
          // 预览
          const _SectionTitle('预览'),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0x0F000000)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '学习进度',
                  style: TextStyle(
                    fontFamily: FlowUsTypography.fontFamily,
                    fontSize: 40,
                    height: 64 / 40,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF37352F),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '磷酸铁锂成本分析与正极材料对比——碳酸锂价格波动。ABC abc 123',
                  style: TextStyle(
                    fontFamily: FlowUsTypography.fontFamily,
                    fontSize: 16,
                    height: 26 / 16,
                    color: const Color(0xFF37352F),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '字体与图标的选择会立刻生效，并保存在本机（重开还在）。',
            style: TextStyle(fontSize: 12, height: 18 / 12, color: c.textTertiary),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(fontSize: 13, height: 20 / 13, color: Color(0xFF91918E)),
    );
  }
}

class _ChoiceTile extends StatelessWidget {
  const _ChoiceTile({
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
    this.preview,
  });

  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  /// 右侧的小预览图
  final Widget? preview;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? const Color(0x0A0285FF) : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: selected ? c.primary.withValues(alpha: 0.4) : const Color(0x0F000000),
          ),
        ),
        child: Row(
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              size: 16,
              color: selected ? c.primary : const Color(0xFFBDBDBD),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(fontSize: 14, height: 20 / 14, color: Color(0xFF37352F)),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(fontSize: 12, height: 18 / 12, color: Color(0xFF91918E)),
                  ),
                ],
              ),
            ),
            ?preview,
          ],
        ),
      ),
    );
  }
}
