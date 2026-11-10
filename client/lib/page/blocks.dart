// 基础块类型（M2-T04）：段落 / 标题 1-4 / 项目符号 / 编号 / 待办 / 引述 / 分割线 / 代码块
//
// 数值出处（全部实测，不做目测）：
//   · 单行块高与 x 偏移：`基准-块类型与块高.md` §2（隔离测试页实测）
//       段落 34 @716 ｜ 空段落 34 ｜ 标题 lv1 **57** / lv2 52 / lv3 34 / lv4 31 @716
//       项目列表 **36** @716 ｜ 编号列表 **34** @716 ｜ 引述 **26 @742** ｜ 分割线 **36** @716 ｜ 代码块 **26 @742**
//       （内容列左缘 716 → 引述/代码块缩进 **26**）
//   · 标题 lv1 字号：**30 / 45 / w600**（`基准-块级排版续` §1.1 + 本轮在「网站」页复核：块高 57 = 45 行高 + 上下各 6 内边距）
//   · 正文 16 / 26、块内边距上下 4、块间距 2（`基准-正文行高与块结构` M0-T31）
//   · 引述 16/26、代码块 **14 / 21**（同上 §2、§3）
//
// ⚠️ **未实测**（本文件里用显式注释标出的地方）：
//   ① 标题 **lv2 / lv3 / lv4 的字号**：只量到块高（52/34/31），字号没有干净样本
//      （M0-T24 的记录里绝对值精度有限）→ 暂按"lv1 30 → 逐级 −2"给一档并标注，等补采任务定死
//   ② 待办复选框的尺寸与样式（该账号没有待办块样本）
//   ③ 分割线的粗细与颜色（只量到块高 36）
//   ④ 列表的符号字形（只量到缩进 26）

import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// 块类型（对应真实 FlowUs 的数字 type）
enum PageBlockKind {
  paragraph(1),
  heading1(7),
  heading2(7),
  heading3(7),
  heading4(7),
  bulleted(4),
  numbered(5),
  todo(3),
  quote(12),
  divider(9),
  code(25);

  const PageBlockKind(this.flowUsType);

  /// 真实接口里的数字类型（标题四档都是 7，靠 `data.level` 区分）
  final int flowUsType;
}

/// 一个块
class PageBlock {
  const PageBlock({
    required this.id,
    required this.kind,
    this.text = '',
    this.checked = false,
    this.number,
    this.level = 1,
  });

  final String id;
  final PageBlockKind kind;
  final String text;

  /// 待办是否勾选
  final bool checked;

  /// 编号列表的显示序号（1 起；由列表控件算，不在数据里持久化）
  final int? number;

  /// 标题级别 1–4（kind 为 heading* 时有效）
  final int level;

  bool get isHeading => kind == PageBlockKind.heading1 || kind == PageBlockKind.heading2 ||
      kind == PageBlockKind.heading3 || kind == PageBlockKind.heading4;

  /// 单行块高（实测）
  double get singleLineHeight => switch (kind) {
        PageBlockKind.heading1 => 57,
        PageBlockKind.heading2 => 52,
        PageBlockKind.heading3 => 34,
        PageBlockKind.heading4 => 31,
        PageBlockKind.bulleted => 36,
        PageBlockKind.numbered => 34,
        PageBlockKind.quote => 26,
        PageBlockKind.code => 26,
        PageBlockKind.divider => 36,
        _ => 34, // 段落 / 待办
      };

  /// 内容缩进（实测：引述与代码块 x=742，其余 716 → 缩进 26）
  double get indent =>
      (kind == PageBlockKind.quote || kind == PageBlockKind.code) ? FlowUsBlockMetrics.listIndent : 0;
}

/// 块列表（编辑 + 排版）。M2-T04 只做"能正确显示各类型 + 能编辑文字"，
/// 块类型切换菜单/斜杠菜单属 M2-T06，Markdown 快捷属 M2-T09。
class FlowUsBlockList extends StatelessWidget {
  const FlowUsBlockList({
    super.key,
    required this.blocks,
    required this.onChanged,
    this.onEnter,
  });

  final List<PageBlock> blocks;
  final void Function(String id, String text) onChanged;
  final void Function(String id)? onEnter;

  @override
  Widget build(BuildContext context) {
    // 编号列表的序号按"连续的编号块"自增（遇到别的块重置）
    var counter = 0;
    final withNumbers = <PageBlock>[];
    for (final b in blocks) {
      if (b.kind == PageBlockKind.numbered) {
        counter++;
        withNumbers.add(PageBlock(
          id: b.id,
          kind: b.kind,
          text: b.text,
          checked: b.checked,
          number: counter,
          level: b.level,
        ));
      } else {
        counter = 0;
        withNumbers.add(b);
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final b in withNumbers)
          Padding(
            // 块间距 2 = 上下各 1（my-px）
            padding: const EdgeInsets.symmetric(vertical: FlowUsBlockMetrics.blockMarginVertical),
            child: _BlockRow(
              key: ValueKey('block-${b.id}'),
              block: b,
              onChanged: (v) => onChanged(b.id, v),
              onEnter: onEnter == null ? null : () => onEnter!(b.id),
            ),
          ),
      ],
    );
  }
}

class _BlockRow extends StatelessWidget {
  const _BlockRow({super.key, required this.block, required this.onChanged, this.onEnter});

  final PageBlock block;
  final ValueChanged<String> onChanged;
  final VoidCallback? onEnter;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    final b = block;

    if (b.kind == PageBlockKind.divider) {
      // 分割线：块高 36（实测），线在中间。⚠️ 线的粗细/颜色未实测，先按 1px #E5E5E5
      return SizedBox(
        height: b.singleLineHeight,
        child: Center(
          child: Container(height: 1, color: const Color(0xFFE5E5E5)),
        ),
      );
    }

    return Padding(
      padding: EdgeInsets.only(left: b.indent),
      child: SizedBox(
        height: b.singleLineHeight,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (b.kind == PageBlockKind.bulleted) const _Glyph(text: '•'),
            if (b.kind == PageBlockKind.numbered) _Glyph(text: '${b.number ?? 1}.'),
            if (b.kind == PageBlockKind.todo)
              // ⚠️ 待办框尺寸未实测，先用 18×18、圆角 2
              Padding(
                padding: const EdgeInsets.only(top: 4, right: 6),
                child: Container(
                  width: 18,
                  height: 18,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(2),
                    border: Border.all(color: const Color(0x1A37352F)),
                    color: b.checked ? c.primary : Colors.transparent,
                  ),
                  child: b.checked ? const Icon(Icons.check, size: 12, color: Colors.white) : null,
                ),
              ),
            if (b.kind == PageBlockKind.quote)
              // 引述：内容缩进 26（实测 x=742）。⚠️ 左侧竖线的粗细/颜色未实测，先按 3px 浅灰
              Container(width: 3, color: const Color(0xFFE5E5E5)),
            if (b.kind == PageBlockKind.quote) const SizedBox(width: 12),
            Expanded(
              child: _BlockText(block: b, onChanged: onChanged, onEnter: onEnter),
            ),
          ],
        ),
      ),
    );
  }
}

/// 列表符号（圆点 / 序号）：宽度让文字对齐到 26 的内容缩进
class _Glyph extends StatelessWidget {
  const _Glyph({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: FlowUsBlockMetrics.listIndent,
      child: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Text(
          text,
          style: const TextStyle(fontSize: 16, height: 26 / 16, color: Color(0xFF37352F)),
        ),
      ),
    );
  }
}

class _BlockText extends StatelessWidget {
  const _BlockText({required this.block, required this.onChanged, this.onEnter});

  final PageBlock block;
  final ValueChanged<String> onChanged;
  final VoidCallback? onEnter;

  TextStyle _style(FlowUsColors c) {
    final b = block;
    if (b.isHeading) {
      // 标题 lv1 = 30/45/w600（实测）；lv2-4 字号未实测 → 见文件头 ⚠️①
      final size = switch (b.level) { 1 => 30.0, 2 => 28.0, 3 => 24.0, _ => 20.0 };
      return TextStyle(fontSize: size, height: 45 / 30, fontWeight: FontWeight.w600, color: c.textMain);
    }
    if (b.kind == PageBlockKind.code) {
      // 代码块 14/21（实测）
      return const TextStyle(fontSize: 14, height: 21 / 14, fontFamily: 'monospace', color: Color(0xFF37352F));
    }
    return TextStyle(
      fontSize: FlowUsTypography.bodyFontSize,
      height: FlowUsTypography.bodyInlineLineHeight / FlowUsTypography.bodyFontSize,
      color: c.textMain,
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    final b = block;
    // 标题的上下内边距 6（实测：57 = 45 + 6×2）
    final padV = b.isHeading ? 6.0 : FlowUsBlockMetrics.blockPaddingVertical;
    return Padding(
      padding: EdgeInsets.symmetric(vertical: padV),
      child: TextFormField(
        initialValue: b.text,
        maxLines: null,
        style: _style(c),
        cursorColor: c.primary,
        onChanged: onChanged,
        onFieldSubmitted: onEnter == null ? null : (_) => onEnter!(),
        decoration: const InputDecoration(
          isDense: true,
          border: InputBorder.none,
          contentPadding: EdgeInsets.zero,
        ),
      ),
    );
  }
}