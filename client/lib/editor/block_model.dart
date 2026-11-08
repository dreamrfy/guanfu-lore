import 'dart:convert';

/// 编辑器块类型（P2-T03 范围：标题/段落/引用/勾选/无序列表/分割线；加粗为段落内行内标记）。
enum BlockType { p, h1, quote, todo, bullet, divider }

BlockType blockTypeOf(String s) => BlockType.values.firstWhere(
      (t) => t.name == s,
      orElse: () => BlockType.p,
    );

class BlockData {
  BlockData({required this.id, required this.type, required this.text, this.checked = false});

  final String id; // 稳定块 ID（控制器/焦点按它复用，光标不跳的关键）
  BlockType type;
  String text;
  bool checked; // 仅 todo 用

  BlockData copy({BlockType? type, String? text, bool? checked}) => BlockData(
        id: id,
        type: type ?? this.type,
        text: text ?? this.text,
        checked: checked ?? this.checked,
      );
}

String newBlockId() =>
    'b${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}${_rnd()}';
int _seed = 0;
String _rnd() {
  _seed = (_seed + 1) % 1296;
  return _seed.toRadixString(36).padLeft(2, '0');
}

/// —— 序列化：正文列存 JSON（v1）；旧纯文本自动兼容（按行转段落）——

String encodeBlocks(List<BlockData> blocks) {
  return jsonEncode({
    'v': 1,
    'b': [
      for (final b in blocks)
        {
          't': b.type.name,
          'x': b.text,
          if (b.type == BlockType.todo) 'd': b.checked,
          'i': b.id,
        }
    ],
  });
}

List<BlockData> decodeBlocks(String content) {
  if (content.isEmpty) {
    return [BlockData(id: newBlockId(), type: BlockType.p, text: '')];
  }
  if (!content.startsWith('{"v":')) {
    // 旧版纯文本：非空行转段落
    return [
      for (final line in content.split('\n'))
        if (line.trim().isNotEmpty)
          BlockData(id: newBlockId(), type: BlockType.p, text: line)
    ];
  }
  try {
    final map = jsonDecode(content) as Map<String, dynamic>;
    final list = (map['b'] as List).cast<Map<String, dynamic>>();
    final blocks = [
      for (final e in list)
        BlockData(
          id: (e['i'] as String?) ?? newBlockId(),
          type: blockTypeOf(e['t'] as String? ?? 'p'),
          text: e['x'] as String? ?? '',
          checked: e['d'] == true,
        ),
    ];
    return blocks.isEmpty
        ? [BlockData(id: newBlockId(), type: BlockType.p, text: '')]
        : blocks;
  } catch (_) {
    return [BlockData(id: newBlockId(), type: BlockType.p, text: content)];
  }
}

/// —— 编辑操作（纯函数）：Enter 拆分 / 退格合并 / 类型切换 ——

/// 在 blockId 的 [offset] 处回车：前半留在本块，后半进新块（插到其后，类型继承段落规则：
/// 标题回车后新块通常是段落；列表/勾选回车继承类型；文字为空时回车退化为段落）。
List<BlockData> splitBlock(List<BlockData> blocks, String blockId, int offset) {
  final out = <BlockData>[];
  var inserted = false;
  for (final b in blocks) {
    if (b.id != blockId) {
      out.add(b);
      continue;
    }
    final head = offset <= 0 ? '' : b.text.substring(0, offset.clamp(0, b.text.length));
    final tail = offset >= b.text.length ? '' : b.text.substring(offset.clamp(0, b.text.length));
    final headType = (b.type == BlockType.h1 && head.isEmpty) ? BlockType.p : b.type;
    out.add(b.copy(text: head, type: headType));
    final newType = switch (b.type) {
      BlockType.h1 => BlockType.p,
      BlockType.divider => BlockType.p,
      _ => b.text.isEmpty ? BlockType.p : b.type,
    };
    out.add(BlockData(id: newBlockId(), type: newType, text: tail,
        checked: newType == BlockType.todo ? false : b.checked));
    inserted = true;
  }
  if (!inserted) return blocks;
  return out;
}

/// 块首退格：与前一块合并（本块文字接到前块末尾，勾选属性随前块）。
/// 返回 null 表示无可合并（第一个块）。
({List<BlockData> blocks, String mergedIntoId, int mergeOffset})? mergeWithPrevious(
    List<BlockData> blocks, String blockId) {
  final idx = blocks.indexWhere((b) => b.id == blockId);
  if (idx <= 0) return null;
  final prev = blocks[idx - 1];
  final cur = blocks[idx];
  if (prev.type == BlockType.divider) {
    // 前块是分割线：删除分割线本身
    final out = [...blocks]..removeAt(idx - 1);
    return (blocks: out, mergedIntoId: cur.id, mergeOffset: 0);
  }
  final out = <BlockData>[];
  for (var i = 0; i < blocks.length; i++) {
    if (i == idx - 1) {
      out.add(prev.copy(text: prev.text + cur.text));
    } else if (i != idx) {
      out.add(blocks[i]);
    }
  }
  return (blocks: out, mergedIntoId: prev.id, mergeOffset: prev.text.length);
}
