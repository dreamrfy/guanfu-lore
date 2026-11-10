import '../data/flowus_blocks.dart';

/// 编辑器块类型（P2-T03 范围：标题/段落/引用/勾选/无序列表/分割线；加粗为段落内行内标记）。
enum BlockType { p, h1, quote, todo, bullet, divider }

BlockType blockTypeOf(String s) => BlockType.values.firstWhere(
      (t) => t.name == s,
      orElse: () => BlockType.p,
    );

class BlockData {
  BlockData({
    required this.id,
    required this.type,
    required this.text,
    this.checked = false,
    this.level,
  });

  final String id; // 稳定块 ID（控制器/焦点按它复用，光标不跳的关键）
  BlockType type;
  String text;
  bool checked; // 仅 todo 用

  /// 标题级别（M2-T01：从 FlowUs 的 `data.level` 读出来，1–4；旧 6 类编辑器只用 h1=1）
  int? level;

  BlockData copy({BlockType? type, String? text, bool? checked, int? level}) => BlockData(
        id: id,
        type: type ?? this.type,
        text: text ?? this.text,
        checked: checked ?? this.checked,
        level: level ?? this.level,
      );
}

String newBlockId() =>
    'b${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}${_rnd()}';
int _seed = 0;
String _rnd() {
  _seed = (_seed + 1) % 1296;
  return _seed.toRadixString(36).padLeft(2, '0');
}

/// —— 序列化：正文列改存 **FlowUs 真实块结构**（M2-T01 起，v2）——
///
/// v2 形状 = 真 FlowUs 的 blocks 对象（以 uuid 为键 + `parentId`/`subNodes` + `data.segments`），
/// 定义在 `lib/data/flowus_blocks.dart`。旧格式 `{v:1,b:[…]}` 与更早的纯文本仍能读。
///
/// ⚠️ **已知限制**：这个旧编辑器只有 6 类块、没有行内样式，所以 v2 → BlockData → v2 会丢
/// `enhancer`（加粗/斜体等）。当前库里不存在带样式的页面（旧格式从来没存过样式），
/// 真编辑器（M2-T05）上线后这条限制消失。

const String kLocalRootBlockId = 'local-root';

String encodeBlocks(List<BlockData> blocks, {String rootId = kLocalRootBlockId}) {
  final doc = FlowUsDocument(rootId: rootId);
  doc.blocks[rootId] = FlowUsBlock(
    uuid: rootId,
    rawType: FlowUsBlockType.page.code,
    data: {
      'segments': <Object?>[],
      'pageFixedWidth': false,
    },
  );
  for (final b in blocks) {
    final code = _codeOf(b.type);
    doc.appendChild(
      rootId,
      FlowUsBlock(
        uuid: b.id,
        rawType: code,
        data: {
          if (code != FlowUsBlockType.divider.code)
            'segments': [FlowUsSegment.plain(b.text).toJson()],
          if (b.type == BlockType.h1) 'level': b.level ?? 1,
          if (b.type == BlockType.todo) 'checked': b.checked,
        },
      ),
    );
  }
  return doc.toStoredJson();
}

int _codeOf(BlockType t) => switch (t) {
      BlockType.p => FlowUsBlockType.paragraph.code,
      BlockType.h1 => FlowUsBlockType.heading.code,
      BlockType.quote => FlowUsBlockType.quote.code,
      BlockType.todo => FlowUsBlockType.todo.code,
      BlockType.bullet => FlowUsBlockType.bulletedList.code,
      BlockType.divider => FlowUsBlockType.divider.code,
    };

/// 数字码 → 旧编辑器的 6 类块（认得的降到最近的一档，不丢文字；不认识的当段落）
BlockType _blockTypeOfCode(int code) => switch (FlowUsBlockType.fromCode(code)) {
      FlowUsBlockType.heading || FlowUsBlockType.toggleHeading => BlockType.h1,
      FlowUsBlockType.quote => BlockType.quote,
      FlowUsBlockType.todo => BlockType.todo,
      FlowUsBlockType.bulletedList ||
      FlowUsBlockType.numberedList ||
      FlowUsBlockType.toggleList =>
        BlockType.bullet,
      FlowUsBlockType.divider => BlockType.divider,
      _ => BlockType.p,
    };

BlockData _emptyBlock({String text = ''}) =>
    BlockData(id: newBlockId(), type: BlockType.p, text: text);

List<BlockData> decodeBlocks(String content) {
  if (content.trim().isEmpty) return [_emptyBlock()];
  try {
    final version = FlowUsDocument.storedVersionOf(content);
    final doc = version == FlowUsDocument.storedVersion
        ? FlowUsDocument.fromStoredJson(content)
        : FlowUsDocument.fromLegacyContent(content, pageId: kLocalRootBlockId);
    final blocks = [
      for (final child in doc.childrenOf(doc.rootId))
        BlockData(
          id: child.uuid,
          type: _blockTypeOfCode(child.rawType),
          text: child.plainText,
          checked: child.data['checked'] == true,
          level: child.headingLevel,
        ),
    ];
    return blocks.isEmpty ? [_emptyBlock()] : blocks;
  } catch (_) {
    return [_emptyBlock(text: content)];
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

/// Markdown 快捷输入触发词（V2.1 ⑤ FlowUs 化）：
/// 光标前的文本【恰好等于】触发词时返回目标块类型，否则 null。
/// 顺序敏感：长触发词在前，防止 '-' 抢先匹配 '---'、'[]' 抢先匹配 '[ ]'。
({BlockType type, bool? checked})? markdownTriggerOf(String prefix) {
  const table = <String, (BlockType, bool?)>{
    '---': (BlockType.divider, null),
    '[ ]': (BlockType.todo, false),
    '[x]': (BlockType.todo, true),
    '[]': (BlockType.todo, false),
    '-': (BlockType.bullet, null),
    '>': (BlockType.quote, null),
    '#': (BlockType.h1, null),
  };
  for (final e in table.entries) {
    if (prefix == e.key) return (type: e.value.$1, checked: e.value.$2);
  }
  return null;
}
