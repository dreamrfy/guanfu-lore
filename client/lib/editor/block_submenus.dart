// 块菜单的三张子面板（M2-T27）
//
// 实测（真 FlowUs · liunx命令页，块菜单点开后在**右侧**弹出，与主面板重叠 9px）：
//   ① 转换为：**200 宽**、圆角 12、内边距 `8px 0`；行 **32**、文字 **14/20 #000**、文字距面板左 **43**；
//      共 **20 项**（顺序见 [kConvertTargets]）
//   ② 对齐方式：**260 宽**、圆角 12、内边距 `8px 0`；三项 左对齐(L) / 居中对齐(C) / 右对齐(R)，
//      文字 14/20、右侧字母 **12 #91918E**（右缘距面板右 27）
//   ③ 颜色：**239 宽**、圆角 12、内边距 `6px 0 0`；分段标题「文字颜色」(y=330) / 「背景颜色」(y=496)，
//      中间是色板网格（未完整采完 → 本任务不做颜色，拆 M2-T31）
//
// 转换能落地的类型（内核 + 我们自写的代码块）：正文 / 标题1-4 / 项目列表 / 编号列表 / 待办列表 / 引述文字 / 代码片段；
// 其余（页面 / 折叠列表 / 数学公式 / 思维导图 / 折叠标题1-4 / 同步块）还没实现对应块 → 面板里照摆，点了不响应。

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/material.dart';

import 'code_block_component.dart';

/// 转换为：面板宽 200、行 32、文字距面板左 43
const double kConvertPanelWidth = 200;
const double kConvertTextInset = 43;

/// 对齐方式：面板宽 260、快捷键右缘距右 27
const double kAlignPanelWidth = 260;
const double kAlignShortcutInset = 27;

/// 颜色：面板宽 239（本任务不做色板）
const double kColorPanelWidth = 239;

/// 子面板与主面板的重叠量（实测 9）
const double kSubmenuOverlap = 9;

/// 子面板统一行高 / 文字样式（与块菜单一致）
const double kSubmenuRowHeight = 32;
const TextStyle kSubmenuTextStyle = TextStyle(fontSize: 14, height: 20 / 14, color: Color(0xFF000000));
const TextStyle kSubmenuShortcutStyle = TextStyle(fontSize: 12, height: 17 / 12, color: Color(0xFF91918E));

/// 转换为的 20 项（顺序即真机顺序）
const List<String> kConvertTargets = [
  '正文',
  '待办列表',
  '页面',
  '标题1',
  '标题2',
  '标题3',
  '标题4',
  '项目列表',
  '编号列表',
  '折叠列表',
  '引述文字',
  '着重文字',
  '代码片段',
  '数学公式',
  '思维导图',
  '折叠标题1',
  '折叠标题2',
  '折叠标题3',
  '折叠标题4',
  '同步块',
];

/// 对齐方式三项（标签 + 真机显示的快捷键字母）
const List<(String, String)> kAlignOptions = [
  ('左对齐', 'L'),
  ('居中对齐', 'C'),
  ('右对齐', 'R'),
];

/// 转换为对应的新块；不支持的返回 null
Node? convertTargetNode(String label) {
  switch (label) {
    case '正文':
      return paragraphNode();
    case '标题1':
      return headingNode(level: 1);
    case '标题2':
      return headingNode(level: 2);
    case '标题3':
      return headingNode(level: 3);
    case '标题4':
      return headingNode(level: 4);
    case '项目列表':
      return bulletedListNode();
    case '编号列表':
      return numberedListNode();
    case '待办列表':
      return todoListNode(checked: false);
    case '引述文字':
      return quoteNode();
    case '代码片段':
      return codeNode();
    default:
      return null;
  }
}

/// 执行转换（保留原文字与子块）
Future<bool> applyConvert(EditorState editorState, Node node, String label) async {
  final target = convertTargetNode(label);
  if (target == null) return false;
  final delta = node.delta;
  final attributes = {...target.attributes};
  if (delta != null && target.type != DividerBlockKeys.type) {
    attributes[blockComponentDelta] = delta.toJson();
  }
  final transaction = editorState.transaction..updateNodeType(node, target.type, attributes);
  await editorState.apply(transaction);
  return true;
}

/// 对齐值 → 内核属性值（left/center/right）
String? alignAttributeOf(String label) {
  switch (label) {
    case '左对齐':
      return 'left';
    case '居中对齐':
      return 'center';
    case '右对齐':
      return 'right';
    default:
      return null;
  }
}

Future<bool> applyAlign(EditorState editorState, Node node, String label) async {
  final value = alignAttributeOf(label);
  if (value == null) return false;
  final transaction = editorState.transaction
    ..updateNode(node, {blockComponentAlign: value});
  await editorState.apply(transaction);
  return true;
}

/// 子面板外壳（白底、圆角 12、两层阴影）
class _SubmenuShell extends StatelessWidget {
  const _SubmenuShell({required this.width, required this.padding, required this.child});

  final double width;
  final EdgeInsets padding;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [
          BoxShadow(color: Color(0x0A191919), offset: Offset(0, 5), blurRadius: 8),
          BoxShadow(color: Color(0x0D191919), offset: Offset(0, 16), blurRadius: 24),
        ],
      ),
      padding: padding,
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [child]),
    );
  }
}

/// 转换为子面板（200 宽、20 项）
class FlowUsConvertPanel extends StatelessWidget {
  const FlowUsConvertPanel({super.key, required this.onPick, this.supportedOnly = false});

  final ValueChanged<String> onPick;

  /// 只列能真正转换的项（测试用）
  final bool supportedOnly;

  @override
  Widget build(BuildContext context) {
    final items = supportedOnly ? kConvertTargets.where((t) => convertTargetNode(t) != null).toList() : kConvertTargets;
    return _SubmenuShell(
      width: kConvertPanelWidth,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final t in items)
            SizedBox(
              height: kSubmenuRowHeight,
              child: InkWell(
                onTap: () => onPick(t),
                child: Padding(
                  padding: const EdgeInsets.only(left: kConvertTextInset),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(t, style: kSubmenuTextStyle),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// 对齐方式子面板（260 宽、3 项、右侧 L/C/R）
class FlowUsAlignPanel extends StatelessWidget {
  const FlowUsAlignPanel({super.key, required this.onPick});

  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    return _SubmenuShell(
      width: kAlignPanelWidth,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (label, key) in kAlignOptions)
            SizedBox(
              height: kSubmenuRowHeight,
              child: InkWell(
                onTap: () => onPick(label),
                child: Padding(
                  padding: const EdgeInsets.only(left: 15, right: kAlignShortcutInset),
                  child: Row(
                    children: [
                      const SizedBox(width: 24),
                      Expanded(child: Text(label, style: kSubmenuTextStyle)),
                      Text(key, style: kSubmenuShortcutStyle),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}