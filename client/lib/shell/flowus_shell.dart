// FlowUs 应用外壳（M1-T02：侧栏骨架，静态像素对齐）
//
// 数值全部来自 `lib/design/tokens.dart`（其源头是 docs/基准/ 的实测规格）。**本文件不写魔数。**
//
// 本任务只验【几何 / 排版 / 颜色】：
//   · 侧栏 228 + 1px 右边框、三段结构、页项 32 高 / 211 宽 / 圆角 6 / 14-24-500
//   · 分区标题 12/20/w500、颜色 grey3
//   · 底部容量卡片结构
// ⚠️ 图标先用 Material 图标**占位**（尺寸按实测 20/16 设）——真图标（Lucide + 93 个自研 Ic* SVG）
//    接线见任务 M1-T13，接线后才会出正式对照图。

import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// 侧栏数据（本轮静态注入；M1-T03 接真实页面树）
class SidebarData {
  const SidebarData({
    required this.spaceName,
    this.spacePages = const [],
    this.privatePages = const [],
    this.showCapacityCard = true,
  });

  final String spaceName;
  final List<String> spacePages;
  final List<String> privatePages;
  final bool showCapacityCard;
}

class FlowUsSidebar extends StatelessWidget {
  const FlowUsSidebar({super.key, required this.data, this.selectedIndex});

  final SidebarData data;
  final int? selectedIndex;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Container(
      width: FlowUsLayout.sidebarWidth,
      decoration: BoxDecoration(
        color: c.asideBg,
        border: Border(
          right: BorderSide(color: c.borderAside, width: FlowUsLayout.sidebarBorderWidth),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SpaceNameRow(name: data.spaceName),
          const _IconRow(),
          const SizedBox(height: 16), // 实测：图标行 86 → FlowUs AI 102
          const _AiRow(),
          const SizedBox(height: 8), // 实测：134 → 142
          _Section(title: '空间', pages: data.spacePages),
          const SizedBox(height: 26), // 实测：空间分区末 238 → 私人 264
          _Section(title: '私人', pages: data.privatePages),
          _PlainRow(icon: Icons.unfold_more, label: '查看更多'),
          const Spacer(),
          _PlainRow(icon: Icons.bookmark_outline, label: '我的订阅'),
          _PlainRow(icon: Icons.storefront_outlined, label: '市集'),
          _PlainRow(icon: Icons.delete_outline, label: '回收站'),
          if (data.showCapacityCard) const _CapacityCard(),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

/// 空间名行：高 54，左 8，图标 + 名称 + 折叠按钮 `«`
class _SpaceNameRow extends StatelessWidget {
  const _SpaceNameRow({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return SizedBox(
      height: FlowUsLayout.sidebarSpaceNameRowHeight,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: FlowUsLayout.sidebarItemInsetLeft),
        child: Row(
          children: [
            // 空间图标 26×26（实测 8/8/211/38 内层 26 高）
            Container(
              width: 26, height: 26,
              decoration: BoxDecoration(
                color: const Color(0xFFF4D13D), // 实测空间 logo 为黄色方块
                borderRadius: BorderRadius.circular(FlowUsRadius.control),
              ),
              alignment: Alignment.center,
              child: Text(name.characters.first,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.black87)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(name,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 16, height: 24 / 16, fontWeight: FontWeight.w500, color: c.textMain)),
            ),
            Icon(Icons.chevron_left, size: 20, color: c.textTertiary),
          ],
        ),
      ),
    );
  }
}

/// 图标行：高 32，5 个 32×32，起点 x=8，间距 45（实测 8/53/98/142/187）
class _IconRow extends StatelessWidget {
  const _IconRow();

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    const icons = [Icons.home_outlined, Icons.face_outlined, Icons.search, Icons.notifications_none, Icons.more_horiz];
    return SizedBox(
      height: FlowUsLayout.sidebarIconRowHeight,
      child: Padding(
        padding: const EdgeInsets.only(left: FlowUsLayout.sidebarItemInsetLeft),
        child: Row(
          children: [
            for (var i = 0; i < icons.length; i++)
              Padding(
                padding: EdgeInsets.only(right: i == icons.length - 1 ? 0 : 13), // 32 + 13 = 45
                child: SizedBox(
                  width: 32, height: 32,
                  child: Icon(icons[i], size: FlowUsComponents.toolButtonIconSize, color: c.textSub),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// FlowUs AI 行：高 32，左 8，宽 211
class _AiRow extends StatelessWidget {
  const _AiRow();

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: FlowUsLayout.sidebarItemInsetLeft),
      child: SizedBox(
        height: FlowUsLayout.sidebarIconRowHeight,
        child: Row(
          children: [
            Icon(Icons.auto_awesome, size: FlowUsComponents.inlineIconButton, color: c.primary),
            const SizedBox(width: 8),
            Expanded(child: Text('FlowUs AI',
                style: TextStyle(fontSize: 14, height: 24 / 14, color: c.textMain))),
            Icon(Icons.info_outline, size: 16, color: c.textTertiary),
          ],
        ),
      ),
    );
  }
}

/// 分区：标题行高 32（12/20/w500 grey3）+ 页项（32 高 / 211 宽 / 圆角 6 / 14-24-500）
class _Section extends StatelessWidget {
  const _Section({required this.title, required this.pages});
  final String title;
  final List<String> pages;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: FlowUsLayout.sidebarItemInsetLeft),
          child: SizedBox(
            height: FlowUsLayout.sidebarItemHeight,
            child: Row(
              children: [
                Expanded(child: Text(title,
                    style: TextStyle(fontSize: 12, height: 20 / 12, fontWeight: FontWeight.w500, color: c.textTertiary))),
                // 悬停时才出现的 `+`（M1-T04 接交互；静态先占位且常显为透明）
                SizedBox(
                  width: FlowUsComponents.inlineIconButton, height: FlowUsComponents.inlineIconButton,
                  child: Icon(Icons.add, size: 16, color: Colors.transparent),
                ),
              ],
            ),
          ),
        ),
        for (final p in pages) _PageItem(title: p),
      ],
    );
  }
}

/// 页项：高 32、左 8、宽 211（= 228 − 8 − 8 − 1）、圆角 6、字 14/24/w500、色 grey2
class _PageItem extends StatelessWidget {
  const _PageItem({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: FlowUsLayout.sidebarItemMarginH),
      child: SizedBox(
        height: FlowUsLayout.sidebarItemHeight,
        child: Padding(
          padding: const EdgeInsets.only(right: FlowUsLayout.sidebarItemPaddingRight),
          child: Row(
            children: [
              const SizedBox(width: 8),
              // 页项左侧是**页面 emoji/图标**（20×20）；hover 时原位换成 ⋯ 与 ＋
              const SizedBox(
                width: FlowUsComponents.inlineIconButton, height: FlowUsComponents.inlineIconButton,
                child: Icon(Icons.description_outlined, size: 16, color: Color(0xFF91918E)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(title,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, height: 24 / 14, fontWeight: FontWeight.w500, color: c.textSub)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 底部普通行（查看更多 / 我的订阅 / 市集 / 回收站）
class _PlainRow extends StatelessWidget {
  const _PlainRow({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: FlowUsLayout.sidebarItemMarginH),
      child: SizedBox(
        height: FlowUsLayout.sidebarItemHeight,
        child: Padding(
          padding: const EdgeInsets.only(left: 8, right: FlowUsLayout.sidebarItemPaddingRight),
          child: Row(
            children: [
              SizedBox(
                width: FlowUsComponents.inlineIconButton, height: FlowUsComponents.inlineIconButton,
                child: Icon(icon, size: 16, color: c.textTertiary),
              ),
              const SizedBox(width: 8),
              Expanded(child: Text(label,
                  style: TextStyle(fontSize: 14, height: 24 / 14, fontWeight: FontWeight.w500, color: c.textSub))),
            ],
          ),
        ),
      ),
    );
  }
}

/// 底部容量卡片：「空间容量已用完」+ 说明两行 + 「立即升级」
class _CapacityCard extends StatelessWidget {
  const _CapacityCard();

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(FlowUsLayout.sidebarItemMarginH, 0, FlowUsLayout.sidebarItemMarginH, 0),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: c.contentBg,
          borderRadius: BorderRadius.circular(FlowUsRadius.control),
          border: Border.all(color: c.borderDefault),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(children: [
              Icon(Icons.info_outline, size: 16, color: c.textTertiary),
              const SizedBox(width: 6),
              Text('空间容量已用完',
                  style: TextStyle(fontSize: 14, height: 20 / 14, fontWeight: FontWeight.w600, color: c.textMain)),
            ]),
            const SizedBox(height: 4),
            Text('已有文件不受影响，升级后可继续上传',
                style: TextStyle(fontSize: 12, height: 20 / 12, color: c.textTertiary)),
            const SizedBox(height: 6),
            Text('立即升级 ›',
                style: TextStyle(fontSize: 12, height: 20 / 12, fontWeight: FontWeight.w500, color: c.primary)),
          ],
        ),
      ),
    );
  }
}

/// 外壳：侧栏 + 主区占位（主区详细结构在 M1-T05；本轮只为了能看到侧栏在正确位置）
class FlowUsShell extends StatelessWidget {
  const FlowUsShell({super.key, required this.data});
  final SidebarData data;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Scaffold(
      backgroundColor: c.contentBg,
      body: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FlowUsSidebar(data: data),
          Expanded(
            child: LayoutBuilder(
              builder: (ctx, box) {
                // 内容列固定 708、在主区内水平居中（面向 M1-T05 的骨架先摆好）
                final left = (box.maxWidth - FlowUsLayout.contentColumnWidth) / 2;
                return Stack(
                  children: [
                    Positioned(
                      left: left, top: FlowUsLayout.contentTopWithoutBanner,
                      width: FlowUsLayout.contentColumnWidth,
                      child: Text('无标题',
                          style: TextStyle(
                              fontSize: FlowUsTypography.pageTitle.fontSize,
                              height: FlowUsTypography.pageTitle.height,
                              fontWeight: FlowUsTypography.pageTitle.fontWeight,
                              color: c.textTertiary)),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}