// M0-T12 编辑器内核像素对齐实测（对照工程）
//
// 目的：把「标题 + 正文」按 **FlowUs 实测规格** 渲染出来，与真 FlowUs 截图并排比。
// 关键隔离：标题用纯 Text（验证 Flutter 能否渲染 40/64/600），
//           正文用 appflowy_editor_ce（验证它的行高与段落机制能否对上 16/24/400）。
//
// 规格来源：docs/基准/基准-全局框架.md / 基准-字体与图标.md / 基准-色彩.md
//   侧栏 228px 固定、背景 #F7F7F7、右边框 1px #F0F0F0
//   内容列 708px 水平居中、标题 40/64/600、正文 16/24/400、文字色 #37352F
import 'package:appflowy_editor_ce/appflowy_editor_ce.dart';
import 'package:flutter/material.dart';

// ---- 实测规格常量（一处集中，别写散） ----
const kSidebarW = 228.0;
const kContentW = 708.0;
const kTextMain = Color(0xFF37352F);
const kBgAside = Color(0xFFF7F7F7);
const kBorderAside = Color(0xFFF0F0F0);
const kBody = TextStyle(
    fontSize: 16, height: 1.5, color: kTextMain, fontWeight: FontWeight.w400);
const kTitle = TextStyle(
    fontSize: 40, height: 1.6, color: kTextMain, fontWeight: FontWeight.w600);

void main() => runApp(const SpikeApp());

class SpikeApp extends StatelessWidget {
  const SpikeApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        home: Scaffold(
          backgroundColor: Colors.white,
          body: const Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _Sidebar(),
              Expanded(child: _Content()),
            ],
          ),
        ),
      );
}

class _Sidebar extends StatelessWidget {
  const _Sidebar();
  @override
  Widget build(BuildContext context) => Container(
        width: kSidebarW,
        decoration: const BoxDecoration(
          color: kBgAside,
          border: Border(right: BorderSide(color: kBorderAside, width: 1)),
        ),
        child: const SizedBox.shrink(),
      );
}

class _Content extends StatelessWidget {
  const _Content();
  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (ctx, c) {
          // 内容列 708 固定、在剩余区域内水平居中（对齐基准-全局框架 第 2 节）
          final left = (c.maxWidth - kContentW) / 2;
          return Stack(
            children: [
              Positioned(
                left: left,
                top: 0,
                width: kContentW,
                height: c.maxHeight,
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(height: 92), // 主内容区起点 y=92（标签条 48 + 横幅 44）
                    Text('项目进度总览', style: kTitle),
                    SizedBox(height: 24),
                    Expanded(child: _BodyEditor()),
                  ],
                ),
              ),
            ],
          );
        },
      );
}

/// 正文用 appflowy_editor_ce 渲染，样式按 FlowUs 实测值覆写
class _BodyEditor extends StatefulWidget {
  const _BodyEditor();
  @override
  State<_BodyEditor> createState() => _BodyEditorState();
}

class _BodyEditorState extends State<_BodyEditor> {
  late final EditorState _state;

  @override
  void initState() {
    super.initState();
    _state = EditorState(document: _doc());
  }

  Document _doc() {
    final d = Document.blank(withInitialText: false);
    d.insert(
      [0],
      [
        paragraphNode(
            text: '本轮把基准采集做完了：块结构、调色板、组件尺寸都落成了规格文件。'),
        paragraphNode(text: '接下来按规格重做界面，第一件事是把外壳立起来。'),
      ],
    );
    return d;
  }

  @override
  Widget build(BuildContext context) => AppFlowyEditor(
        editorState: _state,
        editable: false,
        editorStyle: EditorStyle.desktop(
          padding: EdgeInsets.zero,
          textStyleConfiguration: const TextStyleConfiguration(
            text: kBody,
            lineHeight: 1.5, // 实测正文 16/24 = 1.5
            bold: TextStyle(fontWeight: FontWeight.w600, color: kTextMain),
          ),
        ),
      );

  @override
  void dispose() {
    _state.dispose();
    super.dispose();
  }
}
