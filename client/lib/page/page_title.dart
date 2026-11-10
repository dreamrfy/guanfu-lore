// 页面标题块（M2-T02）
//
// 规格（`基准-块级排版` / `tokens.dart`）：**40 / 64 / w600**，占位文案「无标题」用 grey3。
// 交互：
//   · 每次键入**立刻**回调 `onChanged`（侧栏页项、标签条、主区三处即时同步靠它）
//   · 落库走**防抖**（默认 800ms，与既有 `SaveController` 一致），避免每敲一个字写一次库
//
// 为什么不用 TextField 的 maxLines=1 直接顶着：标题要能换行（FlowUs 长标题会折行），
// 所以用多行 TextField + 自己控制样式，高度随内容长。

import 'dart:async';

import 'package:flutter/material.dart';

import '../design/tokens.dart';

class FlowUsPageTitle extends StatefulWidget {
  const FlowUsPageTitle({
    super.key,
    required this.title,
    required this.onChanged,
    this.onSave,
    this.debounce = const Duration(milliseconds: 800),
    this.autofocus = false,
  });

  /// 当前标题（空串 = 显示占位「无标题」）
  final String title;

  /// 键入即回调（用于三处同步）
  final ValueChanged<String> onChanged;

  /// 防抖后落库（null = 不落库，纯展示）
  final Future<void> Function(String title)? onSave;

  final Duration debounce;
  final bool autofocus;

  @override
  State<FlowUsPageTitle> createState() => _FlowUsPageTitleState();
}

class _FlowUsPageTitleState extends State<FlowUsPageTitle> {
  late final TextEditingController _controller = TextEditingController(text: widget.title);
  Timer? _timer;
  String _pending = '';

  @override
  void didUpdateWidget(covariant FlowUsPageTitle old) {
    super.didUpdateWidget(old);
    // 外部改了标题（例如侧栏重命名）→ 同步进输入框，但别打断正在输入的光标
    if (widget.title != old.title && widget.title != _controller.text) {
      _controller.text = widget.title;
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    widget.onChanged(v);
    final save = widget.onSave;
    if (save == null) return;
    _pending = v;
    _timer?.cancel();
    _timer = Timer(widget.debounce, () {
      // 防抖窗口内只落最后一次
      save(_pending);
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    final style = TextStyle(
      fontSize: FlowUsTypography.pageTitle.fontSize,
      height: FlowUsTypography.pageTitle.height,
      fontWeight: FlowUsTypography.pageTitle.fontWeight,
      color: c.textMain,
    );
    return TextField(
      controller: _controller,
      autofocus: widget.autofocus,
      maxLines: null, // 长标题折行
      cursorColor: c.primary,
      style: style,
      onChanged: _onChanged,
      decoration: InputDecoration(
        isDense: true,
        border: InputBorder.none,
        contentPadding: EdgeInsets.zero,
        hintText: '无标题',
        // 占位与正文同字号/行高/字重，只有颜色是 grey3（实测 40/64/w600 + grey3）
        hintStyle: style.copyWith(color: c.textTertiary),
      ),
    );
  }
}