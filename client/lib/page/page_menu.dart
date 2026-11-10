// 页面右上「⋯」长面板（M2-T13 首版；M2-T22 按真机重新量过，结构大改）
//
// 实测（2026-11-10，真 FlowUs 1920×945，页面：liunx命令）：
//   · 面板 **256 宽**（x 1603..1859）、圆角 **12**、内边距 `4px 0`、白底、两层阴影；高随内容（本次 851）
//   · 行 **32 高**；文字 **14/20 #000**；图标 **16×16**（距面板左 15）；文字距面板左 **39**
//   · 快捷键 **12/17 #91918E**，右缘距面板右 **27**
//   · 开关：**30×18**、全圆角；开 **#0285FF**、关 **#BDBDBD**；滑块 14×14 白；右缘距面板右 **23**
//   · 分隔线：内缩 17、宽 218、1px `#E5E5E5`（沿用 M2-T13 实测）
//   · 两个「内联展开区」：**默认字体 / 页面布局** —— 不是飞出的子菜单，而是**面板里就地展开**：
//       标题 12/18 #91918E（距面板左 17），标题下 28 起是三张 **66×60** 卡片（间距 8）
//       卡片：圆角 4、1px 边框（未选 `#E5E5E5` / 选中 `#0285FF` + 底 `rgba(2,133,255,0.05)`）
//       卡内两行 12/18：主名（#000）+ 备注（#91918E）
//       `Plus` 徽标：**34×20**、底 `#FFF2C5`、圆角 `10 10 10 2`、字 12 `#8F6C28`，压在卡片右上角外
//   · 导出页面：**点击**（悬停不开）在其**左侧**弹出 **176 宽**面板（圆角 12、内边距 `6px 0`），
//       4 项 `PDF / 图片 / Markdown & CSV / Word`，行高 32、文字 14/20、文字距飞板左 39
//   · 底部统计：12/17、三项（块数统计 / 最后编辑人 / 最后编辑于）
//
// 分组按实测分隔线为 **9 组**。本页最后一项是「移动到」；旧版里的「页面动态 / 查看页面信息」
// 在本页菜单里没有 → 已移除（不同页面类型的菜单项可能不同，另行补采）。

import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// 行类型：普通项 / 带开关 / 内联展开区
sealed class PageMenuEntry {
  const PageMenuEntry();
}

class PageMenuRowEntry extends PageMenuEntry {
  const PageMenuRowEntry(
    this.label, {
    this.shortcut,
    this.hasSubmenu = false,
    this.danger = false,
    this.toggle,
  });

  final String label;
  final String? shortcut;
  final bool hasSubmenu;

  /// 红字危险项（删除）
  final bool danger;

  /// null = 不是开关；true/false = 开关当前状态
  final bool? toggle;
}

class PageMenuOption {
  const PageMenuOption(this.main, {this.note, this.plus = false, this.selected = false, this.icon});

  /// 卡片第一行（字体名 / 布局名）
  final String main;

  /// 卡片第二行（字体备注）
  final String? note;
  final bool plus;
  final bool selected;
  final IconData? icon;
}

class PageMenuSectionEntry extends PageMenuEntry {
  const PageMenuSectionEntry(this.title, this.options);

  final String title;
  final List<PageMenuOption> options;
}

/// 分组（组间是分隔线）
const List<List<PageMenuEntry>> kPageMenuGroups = [
  [
    PageMenuRowEntry('查找与替换', shortcut: 'Ctrl+F'),
    PageMenuRowEntry('固定宽度', toggle: true),
    PageMenuRowEntry('页面目录', toggle: false),
  ],
  [
    PageMenuSectionEntry('默认字体', [
      PageMenuOption('FlowUs', note: '默认', selected: true),
      PageMenuOption('FlowUs', note: '霞鹜文楷', plus: true),
      PageMenuOption('FlowUs', note: '思源宋体', plus: true),
    ]),
    PageMenuSectionEntry('页面布局', [
      PageMenuOption('紧密', plus: true, icon: Icons.article_outlined),
      PageMenuOption('默认', selected: true, icon: Icons.article_outlined),
      PageMenuOption('宽松', plus: true, icon: Icons.article_outlined),
    ]),
  ],
  [
    PageMenuRowEntry('小字号', toggle: false),
    PageMenuRowEntry('评论位置', hasSubmenu: true),
    PageMenuRowEntry('演示模式', shortcut: 'Alt+Shift+P'),
  ],
  [PageMenuRowEntry('锁定页面', shortcut: 'Ctrl+L')],
  [PageMenuRowEntry('复制页面链接')],
  [
    PageMenuRowEntry('撤销', shortcut: 'Ctrl+Z'),
    PageMenuRowEntry('重做', shortcut: 'Ctrl+Shift+Z'),
    PageMenuRowEntry('页面历史'),
    PageMenuRowEntry('已解决评论'),
    PageMenuRowEntry('删除', danger: true),
  ],
  [PageMenuRowEntry('复制为公众号格式')],
  [
    PageMenuRowEntry('转换为模板', toggle: false),
    PageMenuRowEntry('导入', hasSubmenu: true),
    PageMenuRowEntry('导出页面', hasSubmenu: true),
  ],
  [PageMenuRowEntry('移动到', shortcut: 'Ctrl+Shift+P')],
];

/// 导出页面的子菜单（实测 4 项，面板在其左侧）
const List<String> kExportPageFormats = ['PDF', '图片', 'Markdown & CSV', 'Word'];

/// 底部统计（实测三项）
const List<String> kPageMenuFooter = ['块数统计: 3', '最后编辑人 两相欢', '最后编辑于 今天 06:38'];

class FlowUsPageMenu extends StatefulWidget {
  const FlowUsPageMenu({super.key, this.onItem, this.onExport, this.footer = kPageMenuFooter});

  final void Function(PageMenuRowEntry item)? onItem;

  /// 选了导出格式（PDF / 图片 / Markdown & CSV / Word）
  final ValueChanged<String>? onExport;
  final List<String> footer;

  @override
  State<FlowUsPageMenu> createState() => _FlowUsPageMenuState();
}

class _FlowUsPageMenuState extends State<FlowUsPageMenu> {
  bool _exportOpen = false;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    final panel = Container(
      width: FlowUsPageMenuStyle.width,
      constraints: const BoxConstraints(maxHeight: FlowUsPageMenuStyle.maxHeight),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(FlowUsRadius.panel),
        boxShadow: const [
          BoxShadow(color: Color(0x0A191919), offset: Offset(0, 5), blurRadius: 8),
          BoxShadow(color: Color(0x0D191919), offset: Offset(0, 16), blurRadius: 24),
        ],
      ),
      padding: const EdgeInsets.symmetric(vertical: FlowUsPageMenuStyle.paddingV),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var g = 0; g < kPageMenuGroups.length; g++) ...[
              if (g > 0) const _PageMenuSeparator(),
              for (final entry in kPageMenuGroups[g])
                switch (entry) {
                  PageMenuRowEntry() => _PageMenuRow(
                      item: entry,
                      colors: c,
                      onTap: (item) {
                        if (item.label == '导出页面') {
                          setState(() => _exportOpen = !_exportOpen);
                          return;
                        }
                        widget.onItem?.call(item);
                      },
                    ),
                  PageMenuSectionEntry() => _PageMenuSection(section: entry, colors: c),
                },
            ],
            const _PageMenuSeparator(),
            for (final line in widget.footer)
              SizedBox(
                height: FlowUsPageMenuStyle.footerHeight,
                child: Padding(
                  padding: const EdgeInsets.only(left: FlowUsPageMenuStyle.separatorInset),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(line,
                        style: const TextStyle(fontSize: 12, height: 17 / 12, color: Color(0xFF91918E))),
                  ),
                ),
              ),
          ],
        ),
      ),
    );

    if (!_exportOpen) return panel;
    // 导出飞板在**左侧**（实测飞板右缘 ≈ 主面板左缘 + 9）
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: FlowUsPageMenuStyle.exportFlyoutTop),
          child: _ExportFlyout(
            items: kExportPageFormats,
            onPick: (f) {
              setState(() => _exportOpen = false);
              widget.onExport?.call(f);
            },
          ),
        ),
        panel,
      ],
    );
  }
}

abstract final class FlowUsPageMenuStyle {
  /// 面板宽（实测 256）
  static const double width = 256;

  /// 面板最大高（实测本次 851，随内容变）
  static const double maxHeight = 851;
  static const double paddingV = 4;

  /// 行高 32
  static const double itemHeight = 32;

  /// 图标 16×16，距面板左 15；文字距面板左 39
  static const double iconInset = 15;
  static const double iconSize = 16;
  static const double itemTextInset = 39;

  /// 快捷键 / 开关的右缘距面板右
  static const double shortcutRightInset = 27;
  static const double toggleRightInset = 23;

  /// 开关尺寸（30×18，滑块 14）
  static const double toggleWidth = 30;
  static const double toggleHeight = 18;
  static const double toggleKnob = 14;

  /// 分隔线：内缩 17、宽 218
  static const double separatorInset = 17;
  static const double separatorWidth = 218;

  /// 内联展开区：标题距面板左 17；标题高 18；标题与卡片间隔 10
  static const double sectionTitleInset = 17;
  static const double sectionTitleHeight = 18;
  static const double sectionTitleToCards = 10;

  /// 卡片 66×60、卡片间距 8
  static const double cardWidth = 66;
  static const double cardHeight = 60;
  static const double cardGap = 8;
  static const double cardRadius = 4;

  /// `Plus` 徽标 34×20
  static const double plusWidth = 34;
  static const double plusHeight = 20;

  /// 导出飞板：宽 176、顶部距面板顶 4
  static const double exportFlyoutWidth = 176;
  static const double exportFlyoutTop = 4;

  /// 底部统计行高 17
  static const double footerHeight = 17;
}

class _PageMenuRow extends StatelessWidget {
  const _PageMenuRow({required this.item, required this.colors, this.onTap});

  final PageMenuRowEntry item;
  final FlowUsColors colors;
  final void Function(PageMenuRowEntry item)? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: FlowUsPageMenuStyle.itemHeight,
      child: InkWell(
        onTap: onTap == null ? null : () => onTap!(item),
        child: Padding(
          padding: const EdgeInsets.only(
            left: FlowUsPageMenuStyle.iconInset,
            right: FlowUsPageMenuStyle.toggleRightInset,
          ),
          child: Row(
            children: [
              SizedBox(
                width: FlowUsPageMenuStyle.iconSize,
                height: FlowUsPageMenuStyle.iconSize,
                child: Icon(_iconFor(item.label), size: 16, color: const Color(0xFF37352F)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  item.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 14,
                    height: 20 / 14,
                    color: item.danger ? const Color(0xFFD92D20) : const Color(0xFF000000),
                  ),
                ),
              ),
              if (item.toggle != null)
                _MenuToggle(on: item.toggle!)
              else ...[
                if (item.shortcut != null)
                  Text(item.shortcut!,
                      style: const TextStyle(fontSize: 12, height: 17 / 12, color: Color(0xFF91918E))),
                if (item.hasSubmenu)
                  const Padding(
                    padding: EdgeInsets.only(left: 4),
                    child: Icon(Icons.chevron_right, size: 14, color: Color(0xFF91918E)),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  /// 图标按同类目取最接近的内建字形（真 FlowUs 是自研 SVG；换自研图标集时按 label 映射替换）
  IconData _iconFor(String label) {
    switch (label) {
      case '查找与替换':
        return Icons.search;
      case '固定宽度':
      case '页面目录':
      case '小字号':
        return Icons.tune;
      case '评论位置':
      case '已解决评论':
        return Icons.mode_comment_outlined;
      case '演示模式':
        return Icons.slideshow;
      case '锁定页面':
        return Icons.lock_outline;
      case '复制页面链接':
        return Icons.link;
      case '撤销':
        return Icons.undo;
      case '重做':
        return Icons.redo;
      case '页面历史':
        return Icons.history;
      case '删除':
        return Icons.delete_outline;
      case '复制为公众号格式':
        return Icons.article_outlined;
      case '转换为模板':
        return Icons.dashboard_customize_outlined;
      case '导入':
        return Icons.download_outlined;
      case '导出页面':
        return Icons.ios_share;
      case '移动到':
        return Icons.drive_file_move_outline;
      default:
        return Icons.chevron_right;
    }
  }
}

/// 开关：30×18、全圆角；开 #0285FF / 关 #BDBDBD；滑块 14 白
class _MenuToggle extends StatelessWidget {
  const _MenuToggle({required this.on});

  final bool on;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: ValueKey('page-menu-toggle-$on'),
      width: FlowUsPageMenuStyle.toggleWidth,
      height: FlowUsPageMenuStyle.toggleHeight,
      decoration: BoxDecoration(
        color: on ? const Color(0xFF0285FF) : const Color(0xFFBDBDBD),
        borderRadius: BorderRadius.circular(999),
      ),
      padding: const EdgeInsets.all(2),
      alignment: on ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        width: FlowUsPageMenuStyle.toggleKnob,
        height: FlowUsPageMenuStyle.toggleKnob,
        decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
      ),
    );
  }
}

/// 内联展开区：标题 + 三张 66×60 卡片
class _PageMenuSection extends StatelessWidget {
  const _PageMenuSection({required this.section, required this.colors});

  final PageMenuSectionEntry section;
  final FlowUsColors colors;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: FlowUsPageMenuStyle.sectionTitleHeight,
          child: Padding(
            padding: const EdgeInsets.only(left: FlowUsPageMenuStyle.sectionTitleInset, top: 2),
            child: Text(section.title,
                style: const TextStyle(fontSize: 12, height: 18 / 12, color: Color(0xFF91918E))),
          ),
        ),
        const SizedBox(height: FlowUsPageMenuStyle.sectionTitleToCards),
        Padding(
          padding: const EdgeInsets.only(left: 18, right: 18),
          child: Row(
            children: [
              for (var i = 0; i < section.options.length; i++) ...[
                if (i > 0) const SizedBox(width: FlowUsPageMenuStyle.cardGap),
                _OptionCard(option: section.options[i]),
              ],
            ],
          ),
        ),
        const SizedBox(height: 10),
      ],
    );
  }
}

class _OptionCard extends StatelessWidget {
  const _OptionCard({required this.option});

  final PageMenuOption option;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: FlowUsPageMenuStyle.cardWidth,
      height: FlowUsPageMenuStyle.cardHeight,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            key: ValueKey('page-menu-card-${option.main}-${option.note ?? ''}'),
            width: FlowUsPageMenuStyle.cardWidth,
            height: FlowUsPageMenuStyle.cardHeight,
            padding: const EdgeInsets.symmetric(vertical: 4),
            decoration: BoxDecoration(
              color: option.selected ? const Color(0x0D0285FF) : Colors.transparent,
              borderRadius: BorderRadius.circular(FlowUsPageMenuStyle.cardRadius),
              border: Border.all(
                color: option.selected ? const Color(0xFF0285FF) : const Color(0xFFE5E5E5),
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (option.icon != null)
                  SizedBox(
                    height: 16,
                    child: Icon(option.icon, size: 16, color: const Color(0xFF37352F)),
                  ),
                SizedBox(
                  height: 18,
                  child: Text(option.main,
                      style: const TextStyle(fontSize: 12, height: 18 / 12, color: Color(0xFF000000))),
                ),
                if (option.note != null)
                  SizedBox(
                    height: 18,
                    child: Text(option.note!,
                        style: const TextStyle(fontSize: 12, height: 18 / 12, color: Color(0xFF91918E))),
                  ),
              ],
            ),
          ),
          if (option.plus)
            Positioned(
              right: -9,
              top: -7,
              child: Container(
                width: FlowUsPageMenuStyle.plusWidth,
                height: FlowUsPageMenuStyle.plusHeight,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: Color(0xFFFFF2C5),
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(10),
                    topRight: Radius.circular(10),
                    bottomRight: Radius.circular(10),
                    bottomLeft: Radius.circular(2),
                  ),
                ),
                child: const Text('Plus',
                    style: TextStyle(fontSize: 12, height: 18 / 12, color: Color(0xFF8F6C28))),
              ),
            ),
        ],
      ),
    );
  }
}

/// 导出飞板（在主页菜单左侧）：176 宽、圆角 12、内边距 6 0、行 32、文字 14/20 距左 39
class _ExportFlyout extends StatelessWidget {
  const _ExportFlyout({required this.items, required this.onPick});

  final List<String> items;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: FlowUsPageMenuStyle.exportFlyoutWidth,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(FlowUsRadius.panel),
        boxShadow: const [
          BoxShadow(color: Color(0x0A191919), offset: Offset(0, 5), blurRadius: 8),
          BoxShadow(color: Color(0x0D191919), offset: Offset(0, 16), blurRadius: 24),
        ],
      ),
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final f in items)
            SizedBox(
              height: FlowUsPageMenuStyle.itemHeight,
              child: InkWell(
                onTap: () => onPick(f),
                child: Padding(
                  padding: const EdgeInsets.only(left: FlowUsPageMenuStyle.itemTextInset),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(f,
                        style: const TextStyle(fontSize: 14, height: 20 / 14, color: Color(0xFF000000))),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PageMenuSeparator extends StatelessWidget {
  const _PageMenuSeparator();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.only(left: FlowUsPageMenuStyle.separatorInset),
      child: Container(
        width: FlowUsPageMenuStyle.separatorWidth,
        height: 1,
        color: const Color(0xFFE5E5E5),
      ),
    );
  }
}