// 斜杠菜单（M2-T06）
//
// 实测清单在 `基准-斜杠菜单全量.md`：面板 **288×396**、**8 组 / 约 90 项 / 77 个快捷码**。
// 该文档自己的"首版建议"是：**先做基础块 + 快捷码**（写笔记的刚需），其余组按分工陆续接。本文件照此执行。
//
// 项名与快捷码**全部照抄实测**，不用自己编的（旧实现的"引用/标题1-3/…"8 项是我编的，已废）。
//
// ⚠️ 两个硬限制（本轮实测内核 `appflowy_editor_ce 6.1.1` 得到）：
//   1. 内核只有 9 种块组件：段落 / 标题 / 待办 / 项目符号 / 编号 / 引述 / 分割线 / 图片 / 表格。
//      → **没有代码块、没有着重文字（callout）、没有折叠列表、没有折叠标题、没有公式/思维导图**。
//      实测里基础块有 22 项，我们能真做出来的只有 **10 项**（见下）。缺口已拆 M2-T19。
//   2. 面板尺寸 288×396 由内核的 SelectionMenu 决定，**没有样式入口**能改（`EditorStyle` 里没有它的尺寸项）
//      → 尺寸暂按内核默认，已在任务表标注。

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/material.dart';

/// 实测「基础块」组的每一项（名字 + 快捷码），**含我们做不出来的那些**。
/// 保留完整清单是有意的：既证明我们照抄了实测，也让"差哪几项"一目了然。
class SlashItemSpec {
  const SlashItemSpec(this.name, this.code, {this.supported = true});
  final String name;
  final String code;
  final bool supported;
}

/// 基础块组全量（`基准-斜杠菜单全量` §1.2，22 项）
const List<SlashItemSpec> kBasicBlockSlashItems = [
  SlashItemSpec('正文', 'zw'),
  SlashItemSpec('待办列表', 'dblb'),
  SlashItemSpec('页面', 'ym', supported: false), // 需要建页/页面块
  SlashItemSpec('引用页面', 'yyym', supported: false), // 需要页面引用块
  SlashItemSpec('标题1', 'h1'),
  SlashItemSpec('标题2', 'h2'),
  SlashItemSpec('标题3', 'h3'),
  SlashItemSpec('标题4', 'h4'),
  SlashItemSpec('简单表格', 'jdbg', supported: false), // 表格组件有，但空表插入未验证
  SlashItemSpec('项目列表', 'xmlb'),
  SlashItemSpec('编号列表', 'bhlb'),
  SlashItemSpec('折叠列表', 'zdlb', supported: false), // 内核无 toggle list
  SlashItemSpec('分割线', 'fgx'),
  SlashItemSpec('引述文字', 'yswz'),
  SlashItemSpec('着重文字', 'zzwz', supported: false), // 内核无 callout
  SlashItemSpec('代码片段', 'dmpd', supported: false), // 内核无代码块
  SlashItemSpec('数学公式', 'sxgs', supported: false),
  SlashItemSpec('思维导图', 'swdt', supported: false),
  SlashItemSpec('思维导图页面', 'swdtym', supported: false),
  SlashItemSpec('折叠标题1', 'zdbt1', supported: false),
  SlashItemSpec('折叠标题2', 'zdbt2', supported: false),
  SlashItemSpec('折叠标题3', 'zdbt3', supported: false),
  SlashItemSpec('折叠标题4', 'zdbt4', supported: false),
];

/// 其余 7 组（本轮不接，只登记，供后续任务对照）
const Map<String, List<String>> kOtherSlashGroups = {
  'AI 助手 Beta': ['FlowUs AI', '继续写作', '翻译', '更多'],
  '行内元素': ['行内日期', '行内引用页面', '行内页面', '行内公式', '人员', 'Emoji'],
  '多维表': ['表格', '表格页面', '看板', '看板页面', '画廊', '画廊页面', '目录', '目录页面', '时间轴', '时间轴页面', '收集表', '收集表页面', '日历', '日历页面', '引用多维表'],
  '导入': ['Markdown', 'CSV', 'HTML', 'Word', 'Evernote'],
  '媒体': ['图片', 'AI 图片', '网页书签', '视频', 'AI 速记', '音频', '文件', '文件夹'],
  '嵌入': ['嵌入网页', '嵌入文件', '嵌入文件夹', 'Figma', 'Airtable', 'Sketch', '墨刀', '摹客', 'Excalidraw', 'ProcessOn', 'Canva', 'Bilibili', '腾讯视频', '优酷视频', '西瓜视频', '网易云音乐', 'CodeSandbox', 'CodePen'],
  '高级块': ['按钮', '同步块', '数据图表'],
};

SelectionMenuItem _item({
  required String name,
  required String code,
  required IconData icon,
  required Node Function() node,
  bool onlyEmptyParagraph = false,
}) {
  return SelectionMenuItem.node(
    getName: () => name,
    // 快捷码**照抄实测**（排在第一个，保证输入码就能命中）
    keywords: [code, name],
    iconData: icon,
    nodeBuilder: (editorState, context) => node(),
    replace: onlyEmptyParagraph
        ? (editorState, node) => node.type == ParagraphBlockKeys.type && node.delta?.isEmpty == true
        : null,
  );
}

/// 构建斜杠菜单项（**只列内核真能渲染的 10 项**；未接的项见 [kBasicBlockSlashItems]）
List<SelectionMenuItem> buildFlowUsSlashItems() {
  return [
    _item(name: '正文', code: 'zw', icon: Icons.notes, node: () => paragraphNode(), onlyEmptyParagraph: true),
    _item(name: '待办列表', code: 'dblb', icon: Icons.check_box_outlined, node: () => todoListNode(checked: false)),
    _item(name: '标题1', code: 'h1', icon: Icons.looks_one_outlined, node: () => headingNode(level: 1)),
    _item(name: '标题2', code: 'h2', icon: Icons.looks_two_outlined, node: () => headingNode(level: 2)),
    _item(name: '标题3', code: 'h3', icon: Icons.looks_3_outlined, node: () => headingNode(level: 3)),
    _item(name: '标题4', code: 'h4', icon: Icons.looks_4_outlined, node: () => headingNode(level: 4)),
    _item(name: '项目列表', code: 'xmlb', icon: Icons.format_list_bulleted, node: () => bulletedListNode()),
    _item(name: '编号列表', code: 'bhlb', icon: Icons.format_list_numbered, node: () => numberedListNode()),
    _item(name: '分割线', code: 'fgx', icon: Icons.horizontal_rule, node: () => dividerNode()),
    _item(name: '引述文字', code: 'yswz', icon: Icons.format_quote, node: () => quoteNode()),
  ];
}