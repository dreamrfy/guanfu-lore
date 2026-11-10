// M6-T01 导出 Markdown 的验收：块→Markdown 映射（规则见 docs/基准/M6-T01-块转Markdown映射.md）
//
// 跑法：cd client && flutter test test/markdown_export_test.dart

import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/data/flowus_blocks.dart';
import 'package:bijiapp/export/markdown_export.dart';

FlowUsBlock block(int code, {String text = '', Map<String, Object?>? data}) => FlowUsBlock(
      uuid: 'b${code}_${text.hashCode}',
      rawType: code,
      data: {
        if (code != FlowUsBlockType.divider.code) 'segments': [FlowUsSegment.plain(text).toJson()],
        ...?data,
      },
    );

/// 用一串块拼一篇文档
FlowUsDocument docOf(List<FlowUsBlock> blocks) {
  final doc = FlowUsDocument(rootId: 'root');
  doc.blocks['root'] = FlowUsBlock(
    uuid: 'root',
    rawType: FlowUsBlockType.page.code,
    data: {'segments': <Object?>[]},
  );
  for (final b in blocks) {
    doc.appendChild('root', b);
  }
  return doc;
}

String md(List<FlowUsBlock> blocks, {MarkdownExportOptions options = const MarkdownExportOptions()}) =>
    MarkdownExporter.fromDocument(docOf(blocks), options: options);

void main() {
  group('块 → Markdown（实测规则）', () {
    test('段落原样输出，空段落不多出空行', () {
      expect(md([block(1, text: '一段话')]), '一段话\n');
      expect(md([block(1, text: '前'), block(1, text: '   '), block(1, text: '后')]), '前\n\n后\n');
    });

    test('标题 = #×level + 空格（实测出现 1–3 级）', () {
      expect(md([block(7, text: '一级', data: {'level': 1})]), '# 一级\n');
      expect(md([block(7, text: '二级', data: {'level': 2})]), '## 二级\n');
      expect(md([block(7, text: '三级', data: {'level': 3})]), '### 三级\n');
      // 没有 level 默认 1（不抛）
      expect(md([block(7, text: '无级别')]), '# 无级别\n');
    });

    test('项目符号 = "- "', () {
      expect(md([block(4, text: '一条')]), '- 一条\n');
    });

    test('编号列表连续递增、遇到别的块重置、分隔符固定 "."', () {
      final out = md([
        block(5, text: '甲'),
        block(5, text: '乙'),
        block(5, text: '丙'),
        block(1, text: '打断'),
        block(5, text: '重新开始'),
      ]);
      expect(out, '1. 甲\n\n2. 乙\n\n3. 丙\n\n打断\n\n1. 重新开始\n');
    });

    test('待办 = "- [ ]" / 已勾选 "- [x]"（勾选写法未实测，标注在文档里）', () {
      expect(md([block(3, text: '要做', data: {'checked': false})]), '- [ ] 要做\n');
      expect(md([block(3, text: '做完了', data: {'checked': true})]), '- [x] 做完了\n');
    });

    test('引述 = "> "，分割线 = "---"', () {
      expect(md([block(12, text: '引用一句')]), '> 引用一句\n');
      expect(md([block(9)]), '---\n');
    });

    test('代码块：围栏 + 语言行；纯文本写 "Plain Text"', () {
      expect(md([block(25, text: 'ls -la\necho hi', data: {'language': 'plain'})]),
          '```Plain Text\nls -la\necho hi\n```\n');
      expect(md([block(25, text: 'x = 1', data: {'language': 'python'})]), '```python\nx = 1\n```\n');
      // 没给语言 → 空语言行
      expect(md([block(25, text: 'a')]), '```\na\n```\n');
    });

    test('多维表块不写进 md（另出 CSV）', () {
      expect(md([block(18, text: '资料表')]), '');
    });

    test('图片：`![alt](相对路径)`，绝不出现 http', () {
      final out = md(
        [block(1, text: '图前'), block(20, data: {'src': 'assets/a.png', 'alt': '示意图'})],
        options: const MarkdownExportOptions(assetPaths: {'assets/a.png': 'Image.png'}),
      );
      expect(out.contains('![示意图](Image.png)'), true, reason: out);
      expect(out.contains('http'), false, reason: '实测 1140 处图片引用里 http 出现 0 次');
    });

    test('图片没有 alt 时输出空 alt', () {
      final out = md([block(20, data: {'src': 'assets/b.jpg'})]);
      expect(out.contains('![](assets/b.jpg)'), true, reason: out);
    });

    test('标题选项会把页面标题写成一级标题', () {
      final out = md([block(1, text: '正文')], options: const MarkdownExportOptions(title: '我的页面'));
      expect(out.startsWith('# 我的页面\n\n正文'), true, reason: out);
    });

    test('末尾恰好一个换行（不多不少）', () {
      expect(md([block(1, text: 'a')]).endsWith('\n'), true);
      expect(md([block(1, text: 'a')]).endsWith('\n\n'), false);
    });
  });

  group('文件名规则（实测）', () {
    test('标题里的空格变成 +', () {
      expect(MarkdownExporter.fileName('04 29 出发 去上海'), '04+29+出发+去上海');
    });

    test('图片重名以 " 1" " 2" 递增，且在扩展名之前', () {
      expect(MarkdownExporter.dedupeAssetName('Image.png', 0), 'Image.png');
      expect(MarkdownExporter.dedupeAssetName('Image.png', 1), 'Image 1.png');
      expect(MarkdownExporter.dedupeAssetName('Image.png', 12), 'Image 12.png');
      expect(MarkdownExporter.dedupeAssetName('import/x', 1), 'import/x 1');
    });
  });
}