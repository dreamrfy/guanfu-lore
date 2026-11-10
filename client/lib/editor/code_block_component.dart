// 代码块组件（M2-T19：补内核缺失的块组件，这次只做「代码块」）
//
// 内核 `appflowy_editor_ce 6.1.1` 只有 9 种块组件，没有代码块，所以这里自写一套
// `BlockComponentBuilder` + `BlockComponentStatefulWidget`（照着内核的 Paragraph* 实现改的骨架）。
//
// 实测规格（`基准-正文行高与块结构` §2 / `基准-块类型与块高` §2）：
//   · 字号/行高 **14 / 21**（不是正文的 16/26）
//   · 缩进 **25**（该文档写"x=745，内容列左缘 720 → 缩进 25"）
//   · 单行块高 **26**
//   · 颜色与正文一致 #37352F；**等宽字体**
//
// ⚠️ 代码块**背景色未实测**（M0 没有量到），所以这里不画底色 —— 宁可少画，不编。

import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/material.dart';

class CodeBlockKeys {
  CodeBlockKeys._();

  /// 与真 FlowUs 的语义对齐；内核没有这个类型，我们自己定名 `code`
  static const String type = 'code';

  static const String delta = blockComponentDelta;

  static const String backgroundColor = blockComponentBackgroundColor;

  static const String textDirection = blockComponentTextDirection;
}

/// 代码块的字号/行高/缩进（实测）
const double kCodeFontSize = 14;
const double kCodeLineHeight = 21;
const double kCodeIndent = 25;

Node codeNode({
  String? text,
  Delta? delta,
  String? textDirection,
  Attributes? attributes,
  Iterable<Node> children = const [],
}) {
  return Node(
    type: CodeBlockKeys.type,
    attributes: {
      CodeBlockKeys.delta: (delta ?? (Delta()..insert(text ?? ''))).toJson(),
      ...?attributes,
      // ignore: use_null_aware_elements
      if (textDirection != null) CodeBlockKeys.textDirection: textDirection,
    },
    children: children,
  );
}

typedef CodeBlockShowPlaceholder = bool Function(EditorState editorState, Node node);

class CodeBlockComponentBuilder extends BlockComponentBuilder {
  CodeBlockComponentBuilder({
    super.configuration,
    this.showPlaceholder,
  });

  final CodeBlockShowPlaceholder? showPlaceholder;

  @override
  BlockComponentWidget build(BlockComponentContext blockComponentContext) {
    final node = blockComponentContext.node;
    return CodeBlockComponentWidget(
      node: node,
      key: node.key,
      configuration: configuration,
      showActions: showActions(node),
      showPlaceholder: showPlaceholder,
      actionBuilder: (context, state) => actionBuilder(blockComponentContext, state),
      actionTrailingBuilder: (context, state) => actionTrailingBuilder(blockComponentContext, state),
    );
  }

  @override
  BlockComponentValidate get validate => (node) => node.delta != null;
}

class CodeBlockComponentWidget extends BlockComponentStatefulWidget {
  const CodeBlockComponentWidget({
    super.key,
    required super.node,
    super.showActions,
    super.actionBuilder,
    super.actionTrailingBuilder,
    super.configuration = const BlockComponentConfiguration(),
    this.showPlaceholder,
  });

  final CodeBlockShowPlaceholder? showPlaceholder;

  @override
  State<CodeBlockComponentWidget> createState() => _CodeBlockComponentWidgetState();
}

class _CodeBlockComponentWidgetState extends State<CodeBlockComponentWidget>
    with
        SelectableMixin,
        DefaultSelectableMixin,
        BlockComponentConfigurable,
        BlockComponentBackgroundColorMixin,
        NestedBlockComponentStatefulWidgetMixin,
        BlockComponentTextDirectionMixin,
        BlockComponentAlignMixin {
  @override
  final forwardKey = GlobalKey(debugLabel: 'flowy_rich_text');

  @override
  GlobalKey<State<StatefulWidget>> get containerKey => widget.node.key;

  @override
  GlobalKey<State<StatefulWidget>> blockComponentKey = GlobalKey(debugLabel: CodeBlockKeys.type);

  @override
  BlockComponentConfiguration get configuration => widget.configuration;

  @override
  Node get node => widget.node;

  bool _showPlaceholder = false;

  @override
  void initState() {
    super.initState();
    editorState.selectionNotifier.addListener(_onSelectionChange);
    _onSelectionChange();
  }

  @override
  void dispose() {
    editorState.selectionNotifier.removeListener(_onSelectionChange);
    super.dispose();
  }

  void _onSelectionChange() {
    final selection = editorState.selection;
    final show = widget.showPlaceholder != null
        ? widget.showPlaceholder!(editorState, node)
        : selection != null && (selection.isSingle && selection.start.path.equals(node.path));
    if (show != _showPlaceholder) {
      setState(() => _showPlaceholder = show);
    }
  }

  /// 代码块的文字样式：**等宽 14/21**（把内核算出来的 span 再套一层覆盖）
  TextStyle get _codeStyle => const TextStyle(
        fontFamily: 'monospace',
        fontSize: kCodeFontSize,
        height: kCodeLineHeight / kCodeFontSize,
        color: Color(0xFF37352F),
      );

  @override
  Widget buildComponent(BuildContext context, {bool withBackgroundColor = true}) {
    final textDirection = calculateTextDirection(layoutDirection: Directionality.maybeOf(context));

    Widget child = Container(
      width: double.infinity,
      alignment: alignment,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        textDirection: textDirection,
        children: [
          AppFlowyRichText(
            key: forwardKey,
            delegate: this,
            node: widget.node,
            editorState: editorState,
            textAlign: alignment?.toTextAlign ?? textAlign,
            placeholderText: _showPlaceholder ? placeholderText : ' ',
            textSpanDecorator: (textSpan) =>
                textSpan.updateTextStyle(_codeStyle).updateTextStyle(textStyleWithTextSpan(textSpan: textSpan)),
            placeholderTextSpanDecorator: (textSpan) =>
                textSpan.updateTextStyle(placeholderTextStyleWithTextSpan(textSpan: textSpan)),
            textDirection: textDirection,
            cursorColor: editorState.editorStyle.cursorColor,
            selectionColor: editorState.editorStyle.selectionColor,
            cursorWidth: editorState.editorStyle.cursorWidth,
          ),
        ],
      ),
    );

    child = BlockSelectionContainer(
      key: blockComponentKey,
      node: node,
      delegate: this,
      listenable: editorState.selectionNotifier,
      remoteSelection: editorState.remoteSelections,
      blockColor: editorState.editorStyle.selectionColor,
      supportTypes: const [BlockSelectionType.block],
      // 缩进 25（实测）作用在块容器上
      child: Padding(
        padding: EdgeInsets.only(
          left: padding.left + kCodeIndent,
          top: padding.top,
          right: padding.right,
          bottom: padding.bottom,
        ),
        child: child,
      ),
    );

    final decoration = this.decoration;
    if (withBackgroundColor && decoration != null) {
      child = DecoratedBox(decoration: decoration, child: child);
    }

    if (widget.showActions && widget.actionBuilder != null) {
      child = BlockComponentActionWrapper(
        node: node,
        actionBuilder: widget.actionBuilder!,
        actionTrailingBuilder: widget.actionTrailingBuilder,
        child: child,
      );
    }

    return child;
  }
}