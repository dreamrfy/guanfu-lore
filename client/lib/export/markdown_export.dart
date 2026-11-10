// 块 → Markdown 导出（M6-T01）
//
// 规则全部来自实测：`docs/基准/M6-T01-块转Markdown映射.md`（从真 FlowUs 的 131 篇导出里数出来的）。
// 要点（照抄，不要"优化"）：
//   · 标题 = `#`×level + 空格           · 项目符号 = `- `        · 编号 = `1. `（分隔符固定 `.`）
//   · 待办 = `- [ ] ` / `- [x] `        · 引述 = `> `            · 分割线 = `---`
//   · 代码块 = ``` 围栏 + 语言行（FlowUs 纯文本写 `Plain Text`）
//   · 图片 = `![alt](相对路径)`，**从不写 http 绝对地址**；同目录重名以 ` 1` ` 2` 递增
//
// 未验证（见文档 §5）：折叠标题、已勾选待办、代码语言取值、表头分隔行、**图片块的 type 号**（按 data 键识别）。

import '../data/flowus_blocks.dart';

/// 导出选项
class MarkdownExportOptions {
  const MarkdownExportOptions({
    this.title,
    this.assetPaths = const {},
    this.fileNameForAsset,
  });

  /// 页面标题。给了就作为 `# ` 一级标题写在最前面（FlowUs 的 md 正文不重复标题，标题在文件名上，
  /// 所以默认不写；给调用方选择）
  final String? title;

  /// 资产 key → 相对文件名（例如 `assets/x.png` → `Image.png`）。导出图片时用它换成相对路径
  final Map<String, String> assetPaths;

  /// 需要联表命名时用：资产 key → 文件名（优先级低于 [assetPaths]）
  final String Function(String key)? fileNameForAsset;
}

/// 把文档还原成 Markdown
class MarkdownExporter {
  const MarkdownExporter._();

  static String fromDocument(FlowUsDocument doc, {MarkdownExportOptions options = const MarkdownExportOptions()}) {
    final out = StringBuffer();
    if (options.title != null && options.title!.trim().isNotEmpty) {
      out.writeln('# ${options.title!.trim()}');
      out.writeln();
    }
    var numberInList = 0; // 连续编号列表的序号（实测：分隔符固定 `.`，遇到别的块就重置）
    for (final child in doc.childrenOf(doc.rootId)) {
      final isNumbered = child.type == FlowUsBlockType.numberedList;
      numberInList = isNumbered ? numberInList + 1 : 0;
      final md = _blockToMarkdown(child, options, number: isNumbered ? numberInList : null);
      if (md == null) continue;
      out.writeln(md);
      out.writeln(); // 实测：块与块之间空一行
    }
    // 整页没有可导出的块（例如只有多维表）→ 空串，不要吐一个孤零零的换行
    if (out.isEmpty) return '';
    // 实测 131 篇里 123 篇末尾有换行；统一保留，方便 diff
    var s = out.toString();
    while (s.endsWith('\n\n')) {
      s = s.substring(0, s.length - 1);
    }
    if (!s.endsWith('\n')) s += '\n';
    return s;
  }

  /// 单个块 → Markdown（返回 null 表示这个块在 md 里不产出内容）
  static String? _blockToMarkdown(FlowUsBlock b, MarkdownExportOptions options, {int? number}) {
    final text = b.plainText;
    switch (b.type) {
      case FlowUsBlockType.page:
        return null; // 根块/子页由目录结构表达，不写进 md

      case FlowUsBlockType.paragraph:
        // 空段落不额外产出（块之间本来就空一行，再写会多出空行）
        return text.trim().isEmpty ? null : text;

      case FlowUsBlockType.heading:
      case FlowUsBlockType.toggleHeading:
        final level = (b.headingLevel ?? 1).clamp(1, 6);
        return '${'#' * level} ${text.trim()}';

      case FlowUsBlockType.bulletedList:
        return '- $text';

      case FlowUsBlockType.numberedList:
        return '${number ?? 1}. $text';

      case FlowUsBlockType.todo:
        final checked = b.data['checked'] == true;
        return '- [${checked ? 'x' : ' '}] $text';

      case FlowUsBlockType.quote:
        return '> $text';

      case FlowUsBlockType.divider:
        return '---';

      case FlowUsBlockType.codeBlock:
        final lang = _codeLanguage(b);
        final body = text.isEmpty ? '' : text;
        return '```${lang.isEmpty ? '' : lang}\n$body\n```';

      case FlowUsBlockType.collection:
      case FlowUsBlockType.collectionView:
        // 多维表不进 md，导出器另出 CSV（见文档 §2）
        return null;

      case FlowUsBlockType.simpleTable:
      case FlowUsBlockType.tableCell:
        return _simpleTable(b);

      default:
        // 其余未知/未覆盖类型：优先按图片处理，否则退化成正文（宁可丢格式，不丢文字）
        final image = _imageMarkdown(b, options);
        if (image != null) return image;
        return text.isEmpty ? null : text;
    }
  }

  /// 代码块语言行。实测纯文本写作 `Plain Text`；没语言就留空
  static String _codeLanguage(FlowUsBlock b) {
    final raw = b.data['language'] ?? b.data['lang'] ?? b.data['codeLanguage'];
    if (raw is String && raw.trim().isNotEmpty) {
      final v = raw.trim();
      if (v.toLowerCase() == 'plain' || v.toLowerCase() == 'plaintext') return 'Plain Text';
      return v;
    }
    return '';
  }

  /// 图片块：**type 号未实测**，这里按 data 里的图片键识别（见文档 §5 第 1 条）
  static String? _imageMarkdown(FlowUsBlock b, MarkdownExportOptions options) {
    final src = b.data['src'] ?? b.data['url'] ?? b.data['fileName'] ?? b.data['file'];
    if (src is! String || src.isEmpty) return null;
    final alt = (b.data['alt'] as String?) ?? (b.data['caption'] as String?) ?? '';
    final rel = options.assetPaths[src] ?? options.fileNameForAsset?.call(src) ?? src;
    return '![$alt]($rel)';
  }

  /// 简单表格：管道表。实测数据行竖线数 4（=3 列）
  static String? _simpleTable(FlowUsBlock b) {
    final rows = b.data['rows'] ?? b.data['table'];
    if (rows is! List || rows.isEmpty) return null;
    final lines = <String>[];
    for (final row in rows) {
      if (row is List) {
        lines.add('| ${row.map((c) => '$c').join(' | ')} |');
      }
    }
    return lines.isEmpty ? null : lines.join('\n');
  }

  /// 文件名规则（实测）：标题里的空格变 `+`
  static String fileName(String title) => title.trim().replaceAll(RegExp(r'\s+'), '+');

  /// 图片文件的去重命名（实测：`Image.png`、`Image 1.png`、`Image 2.png`…）
  static String dedupeAssetName(String baseName, int index) {
    if (index == 0) return baseName;
    final dot = baseName.lastIndexOf('.');
    if (dot <= 0) return '$baseName $index';
    return '${baseName.substring(0, dot)} $index${baseName.substring(dot)}';
  }
}