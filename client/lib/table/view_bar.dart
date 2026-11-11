// 视图栏（M4-T08 · 第一版简化）
//
// 真 FlowUs 的视图栏是：「表格▾ ｜ 1,234 行 ｜ ⋯ ｜ 创建▾」
//   · 表格▾ → 视图切换（表格/看板/画廊/目录/时间轴/日历/收集表）
//   · 行数   → 当前视图的记录数
//   · ⋯     → 更多菜单（筛选/排序/分组/字段显示…）
//   · 创建▾ → 新建记录/新建视图
//
// ⚠️ 第一版只做**表格视图**能用的部分（用户 11-11 选的是表格形态）：
//   · 视图下拉：列出已有的视图，可切换（多个表格视图时有用）
//   · 行数：显示当前筛选后的记录数
//   · 更多菜单：筛选 / 排序（接 M4-T09/T10 的能力）
//   · 创建：新建记录 / 新建视图
//
// 看板/画廊等视图属 M4-T12~T15，**这里不画空壳**（用户明确：
// 「很多你就做了个前端样式，实际功能一个没有做」）。

import 'package:flutter/material.dart';

import 'flowus_table.dart';
import '../design/tokens.dart';

/// 视图栏
class FlowUsViewBar extends StatelessWidget {
  const FlowUsViewBar({
    super.key,
    required this.collection,
    required this.currentView,
    required this.visibleCount,
    required this.totalCount,
    required this.onSelectView,
    required this.onCreateRecord,
    this.onCreateView,
    this.onFilter,
    this.onSort,
    this.hasFilter = false,
    this.hasSort = false,
  });

  final FlowUsCollection collection;
  final FlowUsView? currentView;

  /// 当前筛选后可见的记录数
  final int visibleCount;

  /// 总记录数
  final int totalCount;

  final void Function(FlowUsView view) onSelectView;
  final VoidCallback onCreateRecord;
  final VoidCallback? onCreateView;
  final VoidCallback? onFilter;
  final VoidCallback? onSort;

  final bool hasFilter;
  final bool hasSort;

  @override
  Widget build(BuildContext context) {
    final views = collection.views;

    return SizedBox(
      height: 30,
      child: Row(
        children: [
          // 视图切换（表格▾）—— 窄容器时可压缩，别把行数挤出去
          Flexible(
            child: _ViewPicker(
              views: views,
              current: currentView,
              onSelect: onSelectView,
            ),
          ),
          const SizedBox(width: 10),
          // 行数
          Flexible(
            child: Text(
              visibleCount == totalCount ? '$totalCount 行' : '$visibleCount / $totalCount 行',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, height: 18 / 12, color: Color(0xFF91918E)),
            ),
          ),
          const Spacer(),
          // 更多菜单（⋯）
          if (onFilter != null || onSort != null)
            _MoreButton(
              onFilter: onFilter,
              onSort: onSort,
              hasFilter: hasFilter,
              hasSort: hasSort,
            ),
          const SizedBox(width: 6),
          // 创建（创建▾）
          _CreateButton(
            onCreateRecord: onCreateRecord,
            onCreateView: onCreateView,
          ),
        ],
      ),
    );
  }
}

/// 视图切换下拉
class _ViewPicker extends StatelessWidget {
  const _ViewPicker({required this.views, required this.current, required this.onSelect});

  final List<FlowUsView> views;
  final FlowUsView? current;
  final void Function(FlowUsView view) onSelect;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    if (views.isEmpty) return const SizedBox.shrink();
    return InkWell(
      onTap: () => _showPicker(context),
      borderRadius: BorderRadius.circular(4),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                current?.title.isNotEmpty == true ? current!.title : '表格视图',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13, height: 18 / 13, color: c.textMain),
              ),
            ),
            const SizedBox(width: 3),
            Icon(Icons.arrow_drop_down, size: 14, color: c.textTertiary),
          ],
        ),
      ),
    );
  }

  Future<void> _showPicker(BuildContext context) async {
    final picked = await showModalBottomSheet<FlowUsView>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final v in views)
              ListTile(
                dense: true,
                selected: v.uuid == current?.uuid,
                title: Text(
                  v.title.isNotEmpty ? v.title : v.type.label,
                  style: const TextStyle(fontSize: 14, height: 20 / 14),
                ),
                trailing: v.uuid == current?.uuid
                    ? Icon(Icons.check, size: 16, color: flowUsColors(ctx).primary)
                    : null,
                onTap: () => Navigator.of(ctx).pop(v),
              ),
          ],
        ),
      ),
    );
    if (picked != null) onSelect(picked);
  }
}

/// 更多菜单（⋯）
class _MoreButton extends StatelessWidget {
  const _MoreButton({
    this.onFilter,
    this.onSort,
    this.hasFilter = false,
    this.hasSort = false,
  });

  final VoidCallback? onFilter;
  final VoidCallback? onSort;
  final bool hasFilter;
  final bool hasSort;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return InkWell(
      onTap: () => _showMenu(context),
      borderRadius: BorderRadius.circular(4),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (hasFilter)
              Padding(
                padding: const EdgeInsets.only(right: 3),
                child: Icon(Icons.filter_alt, size: 13, color: c.primary),
              ),
            if (hasSort)
              Padding(
                padding: const EdgeInsets.only(right: 3),
                child: Icon(Icons.sort, size: 13, color: c.textTertiary),
              ),
            Icon(Icons.more_horiz, size: 15, color: c.textTertiary),
          ],
        ),
      ),
    );
  }

  Future<void> _showMenu(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (onFilter != null)
              ListTile(
                dense: true,
                title: const Text('筛选', style: TextStyle(fontSize: 14, height: 20 / 14)),
                onTap: () {
                  Navigator.of(ctx).pop();
                  onFilter!();
                },
              ),
            if (onSort != null)
              ListTile(
                dense: true,
                title: const Text('排序', style: TextStyle(fontSize: 14, height: 20 / 14)),
                onTap: () {
                  Navigator.of(ctx).pop();
                  onSort!();
                },
              ),
          ],
        ),
      ),
    );
  }
}

/// 创建按钮（创建▾）
class _CreateButton extends StatelessWidget {
  const _CreateButton({required this.onCreateRecord, this.onCreateView});

  final VoidCallback onCreateRecord;
  final VoidCallback? onCreateView;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return InkWell(
      onTap: () => _showMenu(context),
      borderRadius: BorderRadius.circular(4),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('创建', style: TextStyle(fontSize: 13, height: 18 / 13, color: c.textMain)),
            const SizedBox(width: 3),
            Icon(Icons.arrow_drop_down, size: 14, color: c.textTertiary),
          ],
        ),
      ),
    );
  }

  Future<void> _showMenu(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ListTile(
              dense: true,
              title: const Text('新建记录', style: TextStyle(fontSize: 14, height: 20 / 14)),
              onTap: () {
                Navigator.of(ctx).pop();
                onCreateRecord();
              },
            ),
            if (onCreateView != null)
              ListTile(
                dense: true,
                title: const Text('新建视图', style: TextStyle(fontSize: 14, height: 20 / 14)),
                onTap: () {
                  Navigator.of(ctx).pop();
                  onCreateView!();
                },
              ),
          ],
        ),
      ),
    );
  }
}
