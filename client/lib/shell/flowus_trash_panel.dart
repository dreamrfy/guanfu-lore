// 回收站面板（M1-T09）
//
// 数值全部来自 `tokens.dart` 的 `FlowUsTrash`（2026-11-10 现场实测）：
//   面板 638×608 / 圆角 12 / 白底 / 1px rgba(0,0,0,.06) / 阴影 rgba(25,25,25,.04) 0 5px 8px
//   搜索框 616×32（外 10 边距）、底 #F7F7F7、圆角 6、内边距 12、提示「在回收站中搜索」
//   列头 46 高、「页面」距左 15、「删除时间」距左 345、14/20 #91918E
//   行 612 宽 / 单行 38 / 带副标题 58 / 圆角 4 / 内边距 9·7；标题 14-20 w600 #000、副标题 12-18 #91918E、
//   时间 14-20 #5F5E5B；行内两钮 20×20、间距 8、右内边距 7
//
// ⚠️ 未实测：空态文案（真账号里回收站非空，没采到空态）、底部「清空回收站」的尺寸与样式
//    （只有截图依据：灰色文字、面板左下方）、搜索框未聚焦时的边框色（实测到的是 1px #5F5E5B，疑似聚焦态）。
//   这些都按最保守的方式实现并在文档里标注，等真样本再收紧。

import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// 回收站里的一条（我们自己的模型，字段只用渲染需要的）
class TrashEntry {
  const TrashEntry({
    required this.id,
    required this.title,
    this.subtitle,
    required this.deletedAtLabel,
    this.icon = 'page',
  });

  final String id;
  final String title;

  /// 副标题：实测是被删页面所在的父页面名（如「微信公众号剪藏」）
  final String? subtitle;

  /// 删除时间，已按实测格式格式化好（形如 `2026 年 11 月 10 日 09:46`）
  final String deletedAtLabel;

  /// 页面图标种类（真图标接线在 M1-T12）
  final String icon;
}

class FlowUsTrashPanel extends StatelessWidget {
  const FlowUsTrashPanel({
    super.key,
    required this.entries,
    this.onRestore,
    this.onDeleteForever,
    this.onClearAll,
    this.onSearch,
    this.searchHint = FlowUsTrash.searchHint,
  });

  final List<TrashEntry> entries;
  final void Function(TrashEntry entry)? onRestore;
  final void Function(TrashEntry entry)? onDeleteForever;
  final VoidCallback? onClearAll;
  final void Function(String keyword)? onSearch;
  final String searchHint;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Container(
      width: FlowUsTrash.panelWidth,
      height: FlowUsTrash.panelHeight,
      decoration: BoxDecoration(
        color: FlowUsTrash.panelBg,
        borderRadius: BorderRadius.circular(FlowUsTrash.panelRadius),
        border: Border.all(color: FlowUsTrash.panelBorderColor, width: 1),
        boxShadow: const [BoxShadow(color: Color(0x0A191919), offset: Offset(0, 5), blurRadius: 8)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 搜索框
          Padding(
            padding: const EdgeInsets.all(FlowUsTrash.searchMargin),
            child: Container(
              height: FlowUsTrash.searchHeight,
              decoration: BoxDecoration(
                color: FlowUsTrash.searchBg,
                borderRadius: BorderRadius.circular(FlowUsTrash.searchRadius),
              ),
              alignment: Alignment.centerLeft,
              child: TextField(
                onChanged: onSearch,
                style: const TextStyle(fontSize: 14, height: 20 / 14, color: Color(0xFF000000)),
                decoration: InputDecoration(
                  isDense: true,
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(horizontal: FlowUsTrash.searchPaddingH),
                  hintText: searchHint,
                  hintStyle: const TextStyle(fontSize: 14, height: 20 / 14, color: Color(0xFF91918E)),
                ),
              ),
            ),
          ),
          // 列头
          SizedBox(
            height: FlowUsTrash.columnHeaderHeight,
            child: Stack(
              children: [
                Positioned(
                  left: FlowUsTrash.titleColumnInset,
                  top: 0,
                  bottom: 0,
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text('页面', style: _headerStyle),
                  ),
                ),
                Positioned(
                  left: FlowUsTrash.timeColumnInset,
                  top: 0,
                  bottom: 0,
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text('删除时间', style: _headerStyle),
                  ),
                ),
              ],
            ),
          ),
          // 列表（或空态）
          Expanded(
            child: entries.isEmpty
                ? Center(
                    // ⚠️ 空态文案未实测：真账号回收站非空，没采到空态
                    child: Text('回收站为空', style: TextStyle(fontSize: 14, color: c.textTertiary)),
                  )
                : ListView.builder(
                    padding: EdgeInsets.zero,
                    itemCount: entries.length,
                    itemBuilder: (ctx, i) => _TrashRow(
                      entry: entries[i],
                      onRestore: onRestore,
                      onDeleteForever: onDeleteForever,
                    ),
                  ),
          ),
          // 底部清空
          Padding(
            padding: const EdgeInsets.fromLTRB(FlowUsTrash.titleColumnInset, 6, 0, 10),
            child: Align(
              alignment: Alignment.centerLeft,
              child: GestureDetector(
                onTap: onClearAll,
                child: Text(
                  FlowUsTrash.clearLabel,
                  style: const TextStyle(fontSize: 14, height: 20 / 14, color: FlowUsTrash.clearColor),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

const TextStyle _headerStyle = TextStyle(
  fontSize: 14,
  height: 20 / 14,
  fontWeight: FontWeight.w400,
  color: FlowUsTrash.columnHeaderColor,
);

class _TrashRow extends StatelessWidget {
  const _TrashRow({required this.entry, this.onRestore, this.onDeleteForever});

  final TrashEntry entry;
  final void Function(TrashEntry entry)? onRestore;
  final void Function(TrashEntry entry)? onDeleteForever;

  @override
  Widget build(BuildContext context) {
    final hasSub = (entry.subtitle ?? '').isNotEmpty;
    return Container(
      // 实测：行 x=236..848（面板内容左缘 228、宽 636）→ 左 8、右 16（右边留出滚动条位），宽 612
      key: ValueKey('trash-row-${entry.id}'),
      margin: const EdgeInsets.only(left: 8, right: 16),
      height: hasSub ? FlowUsTrash.rowDoubleHeight : FlowUsTrash.rowSingleHeight,
      padding: const EdgeInsets.symmetric(
        vertical: FlowUsTrash.rowPaddingV,
        horizontal: FlowUsTrash.rowPaddingH,
      ),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(FlowUsTrash.rowRadius)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 页面图标 20（真图标 M1-T12）
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Icon(Icons.description_outlined, size: FlowUsTrash.rowIconSize, color: const Color(0xFF91918E)),
          ),
          const SizedBox(width: FlowUsTrash.rowIconGap),
          // 标题 + 副标题
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  entry.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14,
                    height: 20 / 14,
                    fontWeight: FontWeight.w600,
                    color: FlowUsTrash.rowTitleColor,
                  ),
                ),
                if (hasSub)
                  Text(
                    entry.subtitle!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      height: 18 / 12,
                      color: FlowUsTrash.rowSubtitleColor,
                    ),
                  ),
              ],
            ),
          ),
          // 删除时间（固定列宽 220，实测 right 区）
          SizedBox(
            width: 220,
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                entry.deletedAtLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 14, height: 20 / 14, color: FlowUsTrash.rowTimeColor),
              ),
            ),
          ),
          const SizedBox(width: 8),
          _RowAction(icon: Icons.undo, tooltip: '恢复', onTap: () => onRestore?.call(entry)),
          const SizedBox(width: FlowUsTrash.rowActionGap),
          _RowAction(icon: Icons.delete_outline, tooltip: '彻底删除', onTap: () => onDeleteForever?.call(entry)),
        ],
      ),
    );
  }
}

/// 行内动作钮：20×20、圆角 4（实测 `rounded`）
class _RowAction extends StatelessWidget {
  const _RowAction({required this.icon, required this.tooltip, this.onTap});

  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: FlowUsTrash.rowActionSize,
          height: FlowUsTrash.rowActionSize,
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(4)),
          alignment: Alignment.center,
          child: Icon(icon, size: 16, color: const Color(0xFF91918E)),
        ),
      ),
    );
  }
}