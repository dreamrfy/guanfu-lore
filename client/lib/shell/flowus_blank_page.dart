// 空页类型选择器（M1-T08）
//
// 数值来源：docs/基准/证据/M1-T08/blank-state.json（2026-11-10 现场建空页实测）。
// 结构：大标题占位(40/64) + 提示行(16/24 灰) + 两组入口（页面类 6 + 多维表类 7，行高 36 圆角 4）。
// 入口行常态整行浅灰 rgb(189,189,189)、hover 黑 6%；第一行默认带底（初始焦点态）。
// ⚠️ 骨架屏/首次加载真样本未采到（基准 🟡）→ 本文件只做空态；加载态等有样本再补。
// ⚠️ 图标 Material 占位（真图标 M1-T12 接线）。

import 'package:flutter/material.dart';

import '../design/flowus_icons.dart';
import '../design/tokens.dart';

/// 空页类型入口（点击回调由宿主接：M2 各页面类型落地时用）
@immutable
class BlankPageEntry {
  const BlankPageEntry({required this.label, required this.group});

  final String label;

  /// page = 页面类（6 项）；database = 多维表类（7 项）
  final BlankEntryGroup group;
}

enum BlankEntryGroup { page, database }

/// 页面类入口（实测顺序）
const List<BlankPageEntry> kBlankPageEntries = [
  BlankPageEntry(label: '页面', group: BlankEntryGroup.page),
  BlankPageEntry(label: 'AI 写作', group: BlankEntryGroup.page),
  BlankPageEntry(label: '文件夹', group: BlankEntryGroup.page),
  BlankPageEntry(label: '思维导图', group: BlankEntryGroup.page),
  BlankPageEntry(label: '模板', group: BlankEntryGroup.page),
  BlankPageEntry(label: '导入', group: BlankEntryGroup.page),
];

/// 多维表类入口（实测顺序）
const List<BlankPageEntry> kBlankDatabaseEntries = [
  BlankPageEntry(label: '表格', group: BlankEntryGroup.database),
  BlankPageEntry(label: '看板', group: BlankEntryGroup.database),
  BlankPageEntry(label: '画廊', group: BlankEntryGroup.database),
  BlankPageEntry(label: '目录', group: BlankEntryGroup.database),
  BlankPageEntry(label: '时间轴', group: BlankEntryGroup.database),
  BlankPageEntry(label: '日历', group: BlankEntryGroup.database),
  BlankPageEntry(label: '收集表', group: BlankEntryGroup.database),
];

/// 空页类型选择器：出现在一个**没有内容**的新页面正文区
class FlowUsBlankPage extends StatelessWidget {
  const FlowUsBlankPage({super.key, this.onSelectEntry});

  /// 点入口行（label + 是否多维表类）
  final void Function(String label, BlankEntryGroup group)? onSelectEntry;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    // 占位灰 = rgb(189,189,189)（实测；深色下跟随 textTertiary）
    final placeholderColor = Theme.of(context).brightness == Brightness.dark
        ? c.textTertiary
        : const Color(0xFFBDBDBD);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 提示行 708×36
        SizedBox(
          height: FlowUsLayout.blankHintHeight,
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text('按回车开始编辑，或从下方选择页面类型',
                style: TextStyle(fontSize: 16, height: 24 / 16, color: placeholderColor)),
          ),
        ),
        // 页面类 6 项
        for (final e in kBlankPageEntries)
          _EntryRow(
            entry: e,
            color: placeholderColor,
            onTap: onSelectEntry == null ? null : () => onSelectEntry!(e.label, e.group),
          ),
        // 分组标题「多维表」（上间隔 16 = blankGroupGap；标题行本身高 36）
        SizedBox(height: FlowUsLayout.blankGroupGap),
        SizedBox(
          height: FlowUsLayout.blankEntryHeight,
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text('多维表',
                style: TextStyle(fontSize: 14, height: 20 / 14, color: placeholderColor)),
          ),
        ),
        // 多维表类 7 项
        for (final e in kBlankDatabaseEntries)
          _EntryRow(
            entry: e,
            color: placeholderColor,
            onTap: onSelectEntry == null ? null : () => onSelectEntry!(e.label, e.group),
          ),
      ],
    );
  }
}

/// 入口行：高 36、圆角 4、图标 20×20 + 文字 16/24；hover 黑 6%
class _EntryRow extends StatefulWidget {
  const _EntryRow({required this.entry, required this.color, this.onTap});

  final BlankPageEntry entry;
  final Color color;
  final VoidCallback? onTap;

  @override
  State<_EntryRow> createState() => _EntryRowState();
}

class _EntryRowState extends State<_EntryRow> {
  bool _hovered = false;

  /// 有实采 SVG 的返回图标名（String），**没采到的返回 Material IconData** 占位
  /// （思维导图/看板/画廊/目录/时间轴/日历/收集表 这几项的空页类型图标 M0 没收割到，已记在 M1-T14）
  Object get _icon => switch (widget.entry.label) {
        '页面' => FlowUsIc.pages,
        'AI 写作' => FlowUsIc.aiFill,
        '文件夹' => FlowUsIc.folderContent,
        '思维导图' => Icons.account_tree_outlined,
        '模板' => Icons.dashboard_outlined,
        '导入' => Icons.upload_outlined,
        '表格' => FlowUsIc.table,
        '看板' => Icons.view_kanban_outlined,
        '画廊' => Icons.grid_view_outlined,
        '目录' => Icons.list_alt_outlined,
        '时间轴' => Icons.timeline_outlined,
        '日历' => Icons.calendar_today_outlined,
        '收集表' => Icons.fact_check_outlined,
        _ => FlowUsIc.pages,
      };

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: GestureDetector(
        onTap: widget.onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          height: FlowUsLayout.blankEntryHeight,
          decoration: BoxDecoration(
            // 常态透明、hover 黑 6%（实测第一行默认带底=初始焦点态；这里按纯 hover 实现）
            color: _hovered ? c.hoverOverlay : Colors.transparent,
            borderRadius: BorderRadius.circular(FlowUsLayout.blankEntryRadius),
          ),
          padding: const EdgeInsets.only(left: 4),
          child: Row(
            children: [
              SizedBox(
                width: FlowUsLayout.blankEntryIconSize,
                height: FlowUsLayout.blankEntryIconSize,
                child: _icon is String
                    ? FlowUsSvgIcon(_icon as String,
                        size: FlowUsLayout.blankEntryIconSize, color: widget.color)
                    : Icon(_icon as IconData,
                        size: FlowUsLayout.blankEntryIconSize, color: widget.color),
              ),
              const SizedBox(width: 12),
              Text(widget.entry.label,
                  style: TextStyle(fontSize: 16, height: 24 / 16, color: widget.color)),
            ],
          ),
        ),
      ),
    );
  }
}
