// 页面右上「⋯」长面板（M2-T13）
//
// 实测（2026-11-10，真 FlowUs 1920×945）：
//   · 面板：清单文档记 **256×851**（剪藏页）；本次在数据库页量到 251×690（字体分组收起）→ **宽度按 256**，高度随分组展开变
//   · 行：**31px** 一行，文字 **14 / 19**
//   · 图标行（带快捷键的）：主文字 14/19 + 右侧快捷键 **12/17**
//   · 分隔线：内缩 **17**、宽 **218**、1px `#E5E5E5`
//   · 底部统计：**12 / 17**，三项（块数统计 / 最后编辑人 / 最后编辑于）
//
// 面板里的项按 `基准-导出格式` §1.1 的实测清单排列，分组之间是分隔线。
// 子菜单（字体 / 页面布局 / 导出页面）内部选项**只采到导出页面的 4 个格式**，其余未采 → 先不做子菜单，记 M2-T22。

import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// 菜单项：主文字 +（可选）右侧快捷键 +（可选）子菜单箭头
class PageMenuItem {
  const PageMenuItem(this.label, {this.shortcut, this.hasSubmenu = false, this.danger = false});
  final String label;
  final String? shortcut;
  final bool hasSubmenu;

  /// 红字危险项（删除）
  final bool danger;
}

/// 分组（组间是分隔线）
const List<List<PageMenuItem>> kPageMenuGroups = [
  // 实测分隔线 7 条 → 面板是 **7 组**（字体块自成一组，M2-T13 补测后修正：原来是 6 组）
  [
    PageMenuItem('查找与替换', shortcut: 'Ctrl+F'),
    PageMenuItem('固定宽度'),
    PageMenuItem('页面目录'),
  ],
  [
    PageMenuItem('默认字体', hasSubmenu: true),
    PageMenuItem('页面布局', hasSubmenu: true),
    PageMenuItem('小字号'),
  ],
  [
    PageMenuItem('评论位置'),
    PageMenuItem('演示模式', shortcut: 'Alt+Shift+P'),
  ],
  [
    PageMenuItem('锁定页面', shortcut: 'Ctrl+L'),
    PageMenuItem('复制页面链接'),
    PageMenuItem('撤销', shortcut: 'Ctrl+Z'),
    PageMenuItem('重做', shortcut: 'Ctrl+Shift+Z'),
    PageMenuItem('页面历史'),
  ],
  [
    PageMenuItem('已解决评论'),
    PageMenuItem('删除', danger: true),
  ],
  [
    PageMenuItem('复制为公众号格式'),
    PageMenuItem('转换为模板'),
    PageMenuItem('导入'),
    PageMenuItem('导出页面', hasSubmenu: true),
  ],
  [
    PageMenuItem('移动到', shortcut: 'Ctrl+Shift+P'),
    PageMenuItem('页面动态'),
    PageMenuItem('查看页面信息'),
  ],
];

/// 底部统计（实测三项；「字数统计」在清单里出现过，本页没显示 → 作为可选）
const List<String> kPageMenuFooter = ['块数统计: 3', '最后编辑人 两相欢', '最后编辑于 今天 06:38'];

class FlowUsPageMenu extends StatelessWidget {
  const FlowUsPageMenu({super.key, this.onItem, this.footer = kPageMenuFooter});

  final void Function(PageMenuItem item)? onItem;
  final List<String> footer;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Container(
      width: FlowUsPageMenuStyle.width,
      constraints: const BoxConstraints(maxHeight: FlowUsPageMenuStyle.maxHeight),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(FlowUsRadius.panel),
        boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 12, offset: Offset(0, 4))],
      ),
      padding: const EdgeInsets.symmetric(vertical: FlowUsPageMenuStyle.paddingV),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var g = 0; g < kPageMenuGroups.length; g++) ...[
              if (g > 0) const _PageMenuSeparator(),
              for (final item in kPageMenuGroups[g]) _PageMenuRow(item: item, onTap: onItem, colors: c),
            ],
            const _PageMenuSeparator(),
            for (final line in footer)
              SizedBox(
                height: FlowUsPageMenuStyle.footerHeight,
                child: Padding(
                  padding: const EdgeInsets.only(left: FlowUsPageMenuStyle.itemInset),
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
  }
}

abstract final class FlowUsPageMenuStyle {
  /// 面板宽（清单文档实测 256；本次另量到 251，按 256）
  static const double width = 256;

  /// 面板最大高（实测剪藏页 851）
  static const double maxHeight = 851;
  static const double paddingV = 8;

  /// 行高 31
  static const double itemHeight = 31;

  /// 文字左内缩（分隔线内缩 17，文字再让 14 → 31；本次实测文字 x 相对面板约 17+14）
  static const double itemInset = 17;
  static const double itemTextInset = 14;

  /// 分隔线：内缩 17、宽 218
  static const double separatorInset = 17;
  static const double separatorWidth = 218;

  /// 底部统计行高 17
  static const double footerHeight = 17;
}

class _PageMenuRow extends StatelessWidget {
  const _PageMenuRow({required this.item, required this.colors, this.onTap});

  final PageMenuItem item;
  final FlowUsColors colors;
  final void Function(PageMenuItem item)? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: FlowUsPageMenuStyle.itemHeight,
      child: InkWell(
        onTap: onTap == null ? null : () => onTap!(item),
        child: Padding(
          padding: EdgeInsets.only(
            left: FlowUsPageMenuStyle.itemInset + FlowUsPageMenuStyle.itemTextInset,
            right: FlowUsPageMenuStyle.itemInset,
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  item.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 14,
                    height: 19 / 14,
                    color: item.danger ? const Color(0xFFD92D20) : const Color(0xFF37352F),
                  ),
                ),
              ),
              if (item.shortcut != null)
                Text(item.shortcut!,
                    style: const TextStyle(fontSize: 12, height: 17 / 12, color: Color(0xFF91918E))),
              if (item.hasSubmenu)
                const Padding(
                  padding: EdgeInsets.only(left: 4),
                  child: Icon(Icons.chevron_right, size: 14, color: Color(0xFF91918E)),
                ),
            ],
          ),
        ),
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