// 记录页「整页」形态（M4-T07）
//
// 用户 11-11 定的两种形态：
//   · **右侧展开**（默认）—— 表格一直可见，点行右侧出详情
//   · **整页**（长文时）—— 点「展开成整页」按钮，详情铺满主区
//
// 为什么长文要整页：公众号推文动辄几千字，右侧 420 宽的面板读起来憋屈。

import 'package:flutter/material.dart';

import 'flowus_table.dart';
import 'record_page.dart';

/// 整页形态的记录页：盖住整个内容区，左上角有「返回表格」
class FlowUsRecordFullPage extends StatelessWidget {
  const FlowUsRecordFullPage({
    super.key,
    required this.collection,
    required this.record,
    required this.onBack,
    required this.onTitleChanged,
    required this.onCellChanged,
    required this.onNotesChanged,
    this.aiActions = const [],
    this.aiStatusText,
  });

  final FlowUsCollection collection;
  final FlowUsRecord record;

  /// 返回表格（回到右侧展开形态）
  final VoidCallback onBack;

  final void Function(String title) onTitleChanged;
  final void Function(String fieldId, Object? value) onCellChanged;
  final void Function(String text) onNotesChanged;

  final List<(String, VoidCallback)> aiActions;
  final String? aiStatusText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // 顶部：返回 + 面包屑
        Row(
          children: [
            TextButton.icon(
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back, size: 15),
              label: const Text('返回表格', style: TextStyle(fontSize: 13, height: 18 / 13)),
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                minimumSize: const Size(0, 26),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                collection.titleField == null
                    ? '记录'
                    : (record.cells[collection.titleField!.id] as String? ?? '无标题'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, height: 18 / 13, color: Color(0xFF91918E)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        const Divider(height: 1, thickness: 1, color: Color(0xFFE5E5E5)),
        const SizedBox(height: 12),
        Expanded(
          child: SingleChildScrollView(
            child: FlowUsRecordPage(
              collection: collection,
              record: record,
              aiActions: aiActions,
              aiStatusText: aiStatusText,
              onTitleChanged: onTitleChanged,
              onCellChanged: onCellChanged,
              onNotesChanged: onNotesChanged,
            ),
          ),
        ),
      ],
    );
  }
}
