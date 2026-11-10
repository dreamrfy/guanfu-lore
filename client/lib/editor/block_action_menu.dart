// 块操作菜单（M2-T08；规格见 `docs/基准/基准-块操作菜单.md`，全部取真 FlowUs 实测值）
//
// 实测要点：
//   · 面板 260 宽、白底、圆角 12、1px 边框、内边距 `8px 0`、两层阴影
//   · 行 250×32（左右各内缩 5）、文字 14/20/w400 #000，行内左边 10 放 20×20 图标、再隔 4 放文字
//   · 快捷键右对齐到行右 −14，12/17 #91918E；子菜单箭头 › 14px 同色
//   · 分隔线 1px、x 距面板左 17、宽 226、上下各 4（行距 32 → 41）
//   · 顺序 15 项，分组见 [kBlockActionGroups]
//
// 动作实现范围（本任务）：复制 / 剪切 / 创建副本 / 删除 / 在上方插入 / 在下方插入。
// 其余（AI 助手 / 复制并移动到页面 / 转换为 / 复制块链接 / 移动到 / 颜色 / 对齐 / 添加评论 / 分栏）
// 面板要 1:1 先摆出来，点击暂不响应 —— 子菜单与面板规格还没采，见 M2-T27。

import 'dart:convert';

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'block_color_panel.dart';
import 'block_submenus.dart';



/// 面板宽（实测 260）
const double kBlockMenuWidth = 260;

/// 行高（实测 32）、行左右内缩 5（行宽 250）
const double kBlockMenuItemHeight = 32;
const double kBlockMenuItemInset = 5;

/// 边框 1px（Container 的 border 会占内容宽度，行内缩进要扣掉它）
const double kBlockMenuBorderWidth = 1;

/// 行内：左 10 起放图标（20×20），再隔 4 放文字
const double kBlockMenuIconLeft = 10;
const double kBlockMenuIconSize = 20;
const double kBlockMenuIconGap = 4;

/// 快捷键右对齐内缩（行右 − 14）
const double kBlockMenuShortcutRight = 14;

/// 分隔线：1px、x 距面板左 17、宽 226、上下各 4
const double kBlockMenuSeparatorInset = 17;
const double kBlockMenuSeparatorWidth = 226;
const double kBlockMenuSeparatorGap = 4;

/// 面板距离手柄命中盒左缘的间距（实测：面板右缘 = 手柄左缘 − 22）
const double kBlockMenuHandleGap = 22;

class BlockActionItem {
  const BlockActionItem(
    this.kind,
    this.label, {
    this.shortcut,
    this.hasSubmenu = false,
    this.ai = false,
  });

  final BlockAction kind;
  final String label;
  final String? shortcut;
  final bool hasSubmenu;

  /// 第 1 项「AI 助手」带紫色图标
  final bool ai;
}

enum BlockAction {
  aiAssist,
  copy,
  cut,
  duplicate,
  copyMoveToPage,
  convertTo,
  copyBlockLink,
  delete,
  moveTo,
  color,
  align,
  addComment,
  insertAbove,
  insertBelow,
  splitRight,
}

/// 分组即分隔线位置（组间一条线）
const List<List<BlockActionItem>> kBlockActionGroups = [
  [
    BlockActionItem(BlockAction.aiAssist, 'AI 助手', shortcut: 'Ctrl+J', ai: true),
    BlockActionItem(BlockAction.copy, '复制', shortcut: 'Ctrl+C'),
    BlockActionItem(BlockAction.cut, '剪切', shortcut: 'Ctrl+X'),
    BlockActionItem(BlockAction.duplicate, '创建副本', shortcut: 'Ctrl+D'),
    BlockActionItem(BlockAction.copyMoveToPage, '复制并移动到页面'),
    BlockActionItem(BlockAction.convertTo, '转换为', hasSubmenu: true),
    BlockActionItem(BlockAction.copyBlockLink, '复制块链接', shortcut: 'F'),
    BlockActionItem(BlockAction.delete, '删除', shortcut: 'Del'),
  ],
  [
    BlockActionItem(BlockAction.moveTo, '移动到', shortcut: 'Ctrl+Shift+P'),
  ],
  [
    BlockActionItem(BlockAction.color, '颜色', hasSubmenu: true),
    BlockActionItem(BlockAction.align, '对齐方式', hasSubmenu: true),
  ],
  [
    BlockActionItem(BlockAction.addComment, '添加评论', shortcut: 'Ctrl+Shift+M'),
  ],
  [
    BlockActionItem(BlockAction.insertAbove, '在上方插入', shortcut: 'A'),
    BlockActionItem(BlockAction.insertBelow, '在下方插入', shortcut: 'B'),
    BlockActionItem(BlockAction.splitRight, '在右侧添加分栏'),
  ],
];

/// 平铺条目（测试与计数用）
List<BlockActionItem> get kBlockActionItems => [for (final g in kBlockActionGroups) ...g];

class BlockActionMenu extends StatefulWidget {
  const BlockActionMenu({
    super.key,
    required this.blockCount,
    required this.onAction,
    this.onConvert,
    this.onAlign,
    this.onPickBackground,
  });

  /// 底部「块数统计: N」
  final int blockCount;

  final ValueChanged<BlockAction> onAction;

  /// 转换为（M2-T27）：选中某个目标块类型
  final ValueChanged<String>? onConvert;

  /// 对齐方式（M2-T27）：左对齐 / 居中对齐 / 右对齐
  final ValueChanged<String>? onAlign;

  /// 背景颜色（M2-T31）：null = 无颜色
  final ValueChanged<Color?>? onPickBackground;

  @override
  State<BlockActionMenu> createState() => _BlockActionMenuState();
}

class _BlockActionMenuState extends State<BlockActionMenu> {
  /// 当前打开的子面板（null = 只显示主面板）
  BlockAction? _submenu;

  void _onItem(BlockAction kind) {
    if (kind == BlockAction.convertTo && widget.onConvert != null) {
      setState(() => _submenu = _submenu == kind ? null : kind);
      return;
    }
    if (kind == BlockAction.align && widget.onAlign != null) {
      setState(() => _submenu = _submenu == kind ? null : kind);
      return;
    }
    if (kind == BlockAction.color && widget.onPickBackground != null) {
      setState(() => _submenu = _submenu == kind ? null : kind);
      return;
    }
    widget.onAction(kind);
  }

  @override
  Widget build(BuildContext context) {
    final panel = Container(
      width: kBlockMenuWidth,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x0F000000), width: kBlockMenuBorderWidth), // rgba(0,0,0,0.06)
        boxShadow: const [
          BoxShadow(color: Color(0x0A191919), offset: Offset(0, 5), blurRadius: 8),
          BoxShadow(color: Color(0x0D191919), offset: Offset(0, 16), blurRadius: 24),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 8), // 内边距 8 0
          for (var g = 0; g < kBlockActionGroups.length; g++) ...[
            if (g > 0) const _MenuSeparator(),
            for (final item in kBlockActionGroups[g]) _MenuItem(item: item, onTap: () => _onItem(item.kind)),
          ],
          // 底部信息：实测「分隔线（距上 4）+ 8 + 行 + 底 9」；第 2/3 行要账号数据源（M7）
          const SizedBox(height: 4),
          const _MenuSeparator(),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.only(left: kBlockMenuSeparatorInset, right: 17),
            child: Text(
              '块数统计: ${widget.blockCount}',
              style: const TextStyle(fontSize: 12, height: 18 / 12, color: Color(0xFF91918E)),
            ),
          ),
          const SizedBox(height: 9),
        ],
      ),
    );

    // M2-T27：子面板在**右侧**弹出，与主面板重叠 9px（实测）
    final sub = switch (_submenu) {
      BlockAction.convertTo when widget.onConvert != null => FlowUsConvertPanel(
          onPick: (t) {
            setState(() => _submenu = null);
            widget.onConvert!(t);
          },
        ),
      BlockAction.align when widget.onAlign != null => FlowUsAlignPanel(
          onPick: (t) {
            setState(() => _submenu = null);
            widget.onAlign!(t);
          },
        ),
      BlockAction.color when widget.onPickBackground != null => FlowUsColorPanel(
          onPickBackground: (c) {
            setState(() => _submenu = null);
            widget.onPickBackground!(c);
          },
        ),
      _ => null,
    };
    if (sub == null) return panel;
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        panel,
        Transform.translate(
          offset: const Offset(-kSubmenuOverlap, 0),
          child: sub,
        ),
      ],
    );
  }
}

class _MenuSeparator extends StatelessWidget {
  const _MenuSeparator();

  @override
  Widget build(BuildContext context) {
    // 高 9：线 1 + 上下各 4
    return Padding(
      padding: const EdgeInsets.only(top: kBlockMenuSeparatorGap, bottom: kBlockMenuSeparatorGap),
      child: Padding(
        padding: const EdgeInsets.only(left: kBlockMenuSeparatorInset),
        child: Container(width: kBlockMenuSeparatorWidth, height: 1, color: const Color(0x0F000000)),
      ),
    );
  }
}

class _MenuItem extends StatefulWidget {
  const _MenuItem({required this.item, required this.onTap});

  final BlockActionItem item;
  final VoidCallback onTap;

  @override
  State<_MenuItem> createState() => _MenuItemState();
}

class _MenuItemState extends State<_MenuItem> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return Padding(
      // 实测行左缘距面板左 5（含 1px 边框 → 内容内缩 4）
      padding: const EdgeInsets.symmetric(horizontal: kBlockMenuItemInset - kBlockMenuBorderWidth),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.onTap,
          child: Container(
            key: ValueKey('block-action-${widget.item.kind.name}'),
            height: kBlockMenuItemHeight,
            decoration: BoxDecoration(
              color: _hover ? const Color(0x0F000000) : Colors.transparent, // 黑 6%
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const SizedBox(width: kBlockMenuIconLeft),
                SizedBox(
                  width: kBlockMenuIconSize,
                  height: kBlockMenuIconSize,
                  child: widget.item.ai
                      ? const Icon(Icons.auto_awesome, size: 16, color: Color(0xFF7B61FF))
                      : null,
                ),
                const SizedBox(width: kBlockMenuIconGap),
                Expanded(
                  child: Text(
                    widget.item.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 14, height: 20 / 14, color: Color(0xFF000000)),
                  ),
                ),
                if (widget.item.shortcut != null)
                  Padding(
                    padding: const EdgeInsets.only(right: kBlockMenuShortcutRight),
                    child: Text(
                      widget.item.shortcut!,
                      style: const TextStyle(fontSize: 12, height: 17 / 12, color: Color(0xFF91918E)),
                    ),
                  )
                else if (widget.item.hasSubmenu)
                  const Padding(
                    padding: EdgeInsets.only(right: kBlockMenuShortcutRight),
                    child: Icon(Icons.chevron_right, size: 14, color: Color(0xFF91918E)),
                  )
                else
                  const SizedBox(width: kBlockMenuShortcutRight),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// 本任务能真正执行的动作（其余先只摆面板）
const Set<BlockAction> kImplementedBlockActions = {
  BlockAction.copy,
  BlockAction.cut,
  BlockAction.duplicate,
  BlockAction.delete,
  BlockAction.insertAbove,
  BlockAction.insertBelow,
};

/// 动作实现：只用 EditorState 的公开 API（transaction + apply）。
class BlockActionRunner {
  BlockActionRunner(this.editorState, {this.onCopied});

  final EditorState editorState;
  final VoidCallback? onCopied;

  Future<bool> run(BlockAction action, Node node) async {
    switch (action) {
      case BlockAction.copy:
      case BlockAction.cut:
        await Clipboard.setData(ClipboardData(text: jsonEncode(node.toJson())));
        onCopied?.call();
        if (action == BlockAction.cut) _delete(node);
        return true;
      case BlockAction.duplicate:
        final copy = node.deepCopy();
        final txn = editorState.transaction..insertNode(node.path.next, copy);
        await editorState.apply(txn);
        return true;
      case BlockAction.delete:
        _delete(node);
        return true;
      case BlockAction.insertAbove:
        return _insertAt(node.path);
      case BlockAction.insertBelow:
        return _insertAt(node.path.next);
      default:
        return false;
    }
  }

  Future<void> _delete(Node node) async {
    if (node.parent == null) return;
    final txn = editorState.transaction..deleteNode(node);
    await editorState.apply(txn);
  }

  Future<bool> _insertAt(Path path) async {
    final txn = editorState.transaction
      ..insertNode(path, paragraphNode())
      ..afterSelection = Selection.collapsed(Position(path: path));
    await editorState.apply(txn);
    return true;
  }
}