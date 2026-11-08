import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'block_model.dart';
import 'markdown_controller.dart';

/// 块状编辑器（P2-T03）：每块独立控制器，键击零重解析（打字不卡、光标不跳）。
/// Enter 拆分 / 块首退格合并 / 块菜单切换类型 / 加粗（** 标记渲染）。
/// 变更通过 [onChanged] 回传完整序列化正文（上层走既有防抖保存链）。
class BlocksEditor extends StatefulWidget {
  const BlocksEditor({
    super.key,
    required this.initialContent,
    required this.onChanged,
  });

  final String initialContent;
  final ValueChanged<String> onChanged;

  @override
  State<BlocksEditor> createState() => _BlocksEditorState();
}

class _BlocksEditorState extends State<BlocksEditor> {
  List<BlockData> _blocks = [];
  final Map<String, MarkdownTextController> _ctls = {};
  final Map<String, FocusNode> _focus = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadFrom(widget.initialContent);
  }

  @override
  void didUpdateWidget(covariant BlocksEditor old) {
    super.didUpdateWidget(old);
    // 外部内容变化（如草稿恢复）：仅当与当前序列化不同才重载
    final current = encodeBlocks(_blocks);
    if (widget.initialContent != current && widget.initialContent != old.initialContent) {
      _disposeControllers();
      _loadFrom(widget.initialContent);
    }
  }

  void _loadFrom(String content) {
    _blocks = decodeBlocks(content);
    _ctls.clear();
    _focus.clear();
    for (final b in _blocks) {
      _ctls[b.id] = MarkdownTextController(text: b.text);
      // 监听器必须在这里就挂上：否则首屏块的打字不触发 onChanged，保存链全死
      // （P2-T03 存量缺陷：只有拆块/合并等结构操作后才由 _syncControllers 补挂）
      _ctls[b.id]!.addListener(() => _onTextChanged(b.id, _ctls[b.id]!.text));
      _focus[b.id] = FocusNode(onKeyEvent: _keyHandler(b.id));
    }
    _loading = false;
  }

  void _disposeControllers() {
    for (final c in _ctls.values) {
      c.dispose();
    }
    for (final f in _focus.values) {
      f.dispose();
    }
    _ctls.clear();
    _focus.clear();
  }

  @override
  void dispose() {
    _disposeControllers();
    super.dispose();
  }

  void _fireChanged() {
    widget.onChanged(encodeBlocks(_blocks));
  }

  void _onTextChanged(String blockId, String text) {
    final i = _blocks.indexWhere((b) => b.id == blockId);
    if (i >= 0) _blocks[i] = _blocks[i].copy(text: text);
    _fireChanged();
  }

  FocusOnKeyEventCallback _keyHandler(String blockId) {
    return (node, event) {
      if (event is! KeyDownEvent) return KeyEventResult.ignored;
      final isEnter = event.logicalKey == LogicalKeyboardKey.enter ||
          event.logicalKey == LogicalKeyboardKey.numpadEnter;
      final isBackspace = event.logicalKey == LogicalKeyboardKey.backspace;
      final ctl = _ctls[blockId];
      if (ctl == null) return KeyEventResult.ignored;
      if (isEnter && !HardwareKeyboard.instance.isShiftPressed) {
        final offset = ctl.selection.baseOffset.clamp(0, ctl.text.length);
        _splitAt(blockId, offset);
        return KeyEventResult.handled;
      }
      if (isBackspace &&
          ctl.selection.isCollapsed &&
          ctl.selection.baseOffset == 0 &&
          ctl.text.isEmpty) {
        final merged = mergeWithPrevious(_blocks, blockId);
        if (merged != null) {
          setState(() {
            _blocks = merged.blocks;
            _syncControllers();
            _focus[merged.mergedIntoId]?.requestFocus();
            _ctls[merged.mergedIntoId]?.selection = TextSelection.collapsed(
                offset: merged.mergeOffset.clamp(0, _ctls[merged.mergedIntoId]!.text.length));
          });
          _fireChanged();
        }
        return merged != null ? KeyEventResult.handled : KeyEventResult.ignored;
      }
      return KeyEventResult.ignored;
    };
  }

  void _splitAt(String blockId, int offset) {
    setState(() {
      _blocks = splitBlock(_blocks, blockId, offset);
      _syncControllers();
    });
    _fireChanged();
    // 焦点移到新块开头：新块 id 是拆分后 blockId 的下一个
    final idx = _blocks.indexWhere((b) => b.id == blockId);
    if (idx >= 0 && idx + 1 < _blocks.length) {
      final newId = _blocks[idx + 1].id;
      _focus[newId]?.requestFocus();
      _ctls[newId]?.selection = const TextSelection.collapsed(offset: 0);
    }
  }

  /// 让控制器/焦点集合与块列表同步：新增建、删除清（保留复用项，光标不跳的关键）。
  void _syncControllers() {
    final ids = _blocks.map((b) => b.id).toSet();
    for (final b in _blocks) {
      if (!_ctls.containsKey(b.id)) {
        _ctls[b.id] = MarkdownTextController(text: b.text);
        _ctls[b.id]!.addListener(() => _onTextChanged(b.id, _ctls[b.id]!.text));
        _focus[b.id] = FocusNode(onKeyEvent: _keyHandler(b.id));
      }
    }
    for (final id in _ctls.keys.toList()) {
      if (!ids.contains(id)) {
        _ctls.remove(id)!.dispose();
        _focus.remove(id)!.dispose();
      }
    }
  }

  void _setType(String blockId, BlockType type) {
    setState(() {
      final i = _blocks.indexWhere((b) => b.id == blockId);
      if (i < 0) return;
      _blocks[i] = _blocks[i].copy(type: type, checked: type == BlockType.todo ? false : _blocks[i].checked);
      if (type == BlockType.divider && _blocks[i].text.isNotEmpty) {
        _ctls[blockId]!.text = '';
        _blocks[i] = _blocks[i].copy(text: '');
      }
    });
    _fireChanged();
    _focus[blockId]?.requestFocus();
  }

  void _toggleChecked(String blockId) {
    setState(() {
      final i = _blocks.indexWhere((b) => b.id == blockId);
      if (i < 0) return;
      _blocks[i] = _blocks[i].copy(checked: !_blocks[i].checked);
    });
    _fireChanged();
  }

  void _deleteBlock(String blockId) {
    if (_blocks.length <= 1) {
      setState(() {
        _blocks = [BlockData(id: newBlockId(), type: BlockType.p, text: '')];
        _syncControllers();
      });
      _fireChanged();
      return;
    }
    final merged = mergeWithPrevious(_blocks, blockId);
    setState(() {
      if (merged != null) {
        _blocks = merged.blocks;
      } else if (_blocks.length > 1) {
        _blocks = [..._blocks]..removeAt(0);
      }
      _syncControllers();
    });
    _fireChanged();
    if (merged != null) {
      _focus[merged.mergedIntoId]?.requestFocus();
      _ctls[merged.mergedIntoId]?.selection = TextSelection.collapsed(
          offset: merged.mergeOffset.clamp(0, _ctls[merged.mergedIntoId]!.text.length));
    }
  }

  void _insertBold(String blockId) {
    _ctls[blockId]?.wrapSelectionWithBold();
    final i = _blocks.indexWhere((b) => b.id == blockId);
    if (i >= 0) _blocks[i] = _blocks[i].copy(text: _ctls[blockId]!.text);
    _fireChanged();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LinearProgressIndicator();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final b in _blocks) _blockRow(b),
      ],
    );
  }

  Widget _blockRow(BlockData b) {
    final ctl = _ctls[b.id]!;
    final node = _focus[b.id]!;

    Widget content;
    switch (b.type) {
      case BlockType.divider:
        content = GestureDetector(
          onTap: () => node.requestFocus(),
          child: const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Divider(thickness: 1.5),
          ),
        );
      case BlockType.todo:
        content = Row(children: [
          Checkbox(value: b.checked, onChanged: (_) => _toggleChecked(b.id)),
          Expanded(
            child: _textField(b, ctl, node,
                style: TextStyle(
                    fontSize: 14,
                    decoration: b.checked ? TextDecoration.lineThrough : null,
                    color: b.checked ? Colors.grey : null)),
          ),
        ]);
      case BlockType.bullet:
        content = Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Padding(
            padding: EdgeInsets.only(top: 14, right: 6),
            child: Text('•', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          ),
          Expanded(child: _textField(b, ctl, node, style: const TextStyle(fontSize: 14))),
        ]);
      case BlockType.quote:
        content = Container(
          decoration: BoxDecoration(
            border: Border(left: BorderSide(color: Colors.blue.shade300, width: 3)),
          ),
          padding: const EdgeInsets.only(left: 10),
          margin: const EdgeInsets.symmetric(vertical: 2),
          child: _textField(b, ctl, node,
              style: TextStyle(fontSize: 14, color: Colors.grey.shade700)),
        );
      case BlockType.h1:
        content = _textField(b, ctl, node,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
            decoration: const InputDecoration.collapsed(hintText: '标题'));
      case BlockType.p:
        content = _textField(b, ctl, node, style: const TextStyle(fontSize: 14));
    }

    return Row(
      crossAxisAlignment: b.type == BlockType.divider
          ? CrossAxisAlignment.center
          : CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 34,
          child: IconButton(
            visualDensity: VisualDensity.compact,
            tooltip: '块操作（类型/加粗/删除）',
            icon: const Icon(Icons.drag_indicator, size: 18, color: Colors.grey),
            onPressed: () => _showBlockMenu(context, b),
          ),
        ),
        Expanded(child: content),
      ],
    );
  }

  Widget _textField(BlockData b, MarkdownTextController ctl, FocusNode node,
      {TextStyle? style, InputDecoration? decoration}) {
    return TextField(
      controller: ctl,
      focusNode: node,
      style: style,
      maxLines: 1,
      minLines: 1,
      keyboardType: TextInputType.text,
      textInputAction: TextInputAction.done,
      decoration: decoration ??
          const InputDecoration.collapsed(hintText: '写点什么…', border: InputBorder.none),
      onSubmitted: (_) {
        // 全平台统一：回车=拆块（FlowUs 心智）；段落内换行暂不支持（后续包评估）
        final offset = ctl.selection.baseOffset.clamp(0, ctl.text.length);
        _splitAt(b.id, offset);
      },
    );
  }

  Future<void> _showBlockMenu(BuildContext context, BlockData b) async {
    final action = await showDialog<String>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('块操作'),
        children: [
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(spacing: 8, runSpacing: 8, children: [
              for (final t in BlockType.values)
                OutlinedButton(
                  onPressed: () => Navigator.pop(ctx, 'type:${t.name}'),
                  child: Text(switch (t) {
                    BlockType.p => '段落',
                    BlockType.h1 => '标题',
                    BlockType.quote => '引用',
                    BlockType.todo => '勾选',
                    BlockType.bullet => '列表',
                    BlockType.divider => '分割线',
                  }),
                ),
            ]),
          ),
          const Divider(),
          SimpleDialogOption(
            onPressed: () => Navigator.pop(ctx, 'bold'),
            child: const Text('加粗选中文字（**）'),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.pop(ctx, 'delete'),
            child: const Text('删除此块', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (action == null || !mounted) return;
    if (action.startsWith('type:')) {
      _setType(b.id, blockTypeOf(action.substring(5)));
    } else if (action == 'bold') {
      _insertBold(b.id);
    } else if (action == 'delete') {
      _deleteBlock(b.id);
    }
  }
}
