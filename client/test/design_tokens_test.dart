// 设计 token 的"防漂移"测试（M1-T01）
//
// 目的：本项目的**唯一真理来源是真 FlowUs 实测值**（docs/基准/）。
// 这些常量被人随手改掉，界面就会悄悄偏离——所以每条关键值都在这里钉死。
//
// 跑法：cd client && flutter test test/design_tokens_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/tokens.dart';

void main() {
  group('布局（基准-全局框架）', () {
    test('侧栏固定 228（含 1px 边框），任何视口不变', () {
      expect(FlowUsLayout.sidebarWidth, 228);
      expect(FlowUsLayout.sidebarBorderWidth, 1);
    });

    test('标签条 48 / 横幅 44 / 主区起点 92 或 48', () {
      expect(FlowUsLayout.tabBarHeight, 48);
      expect(FlowUsLayout.bannerHeight, 44);
      expect(FlowUsLayout.contentTopWithBanner, 92);
      expect(FlowUsLayout.contentTopWithoutBanner, 48);
    });

    test('内容列固定 708，且在 1920 下左缘落在 720', () {
      expect(FlowUsLayout.contentColumnWidth, 708);
      expect(FlowUsLayout.contentColumnLeft(1920), 720);
      // 1280 / 2560 也要对
      expect(FlowUsLayout.contentColumnLeft(1280), 228 + (1280 - 228 - 708) / 2);
      expect(FlowUsLayout.contentColumnLeft(2560), 228 + (2560 - 228 - 708) / 2);
    });

    test('滚动条是 overlay，不占布局宽度', () {
      expect(FlowUsLayout.scrollbarIsOverlay, isTrue);
    });
  });

  group('圆角（只有 5 档）', () {
    test('2 / 6 / 8 / 12 / 全圆', () {
      expect(FlowUsRadius.badge, 2);
      expect(FlowUsRadius.control, 6);
      expect(FlowUsRadius.menuPanel, 8); // 菜单项实测 8，不是 4
      expect(FlowUsRadius.panel, 12);
      expect(FlowUsRadius.pill, 9999);
    });
  });

  group('色彩（基准-色彩）', () {
    test('主色浅深都不变', () {
      expect(FlowUsColors.light.primary, const Color(0xFF0285FF));
      expect(FlowUsColors.dark.primary, const Color(0xFF0285FF));
    });

    test('浅色板关键值', () {
      expect(FlowUsColors.light.contentBg, const Color(0xFFFFFFFF));
      expect(FlowUsColors.light.asideBg, const Color(0xFFF7F7F7));
      expect(FlowUsColors.light.textMain, const Color(0xFF37352F));
      expect(FlowUsColors.light.textSub, const Color(0xFF5F5E5B));
      expect(FlowUsColors.light.textTertiary, const Color(0xFF91918E));
      expect(FlowUsColors.light.borderDefault, const Color(0xFFE5E5E5));
      expect(FlowUsColors.light.borderAside, const Color(0xFFF0F0F0));
    });

    test('深色板与浅色成对反转', () {
      expect(FlowUsColors.dark.contentBg, const Color(0xFF191919));
      expect(FlowUsColors.dark.asideBg, const Color(0xFF202020));
      expect(FlowUsColors.dark.textMain, const Color(0xFFD4D4D4));
      expect(FlowUsColors.dark.borderDefault, const Color(0xFF2E2E2E));
    });

    test('★ 深色下悬停底是「白 6%」（不是黑 6%）', () {
      // 浅色：黑 6%
      expect(FlowUsColors.light.hoverOverlay, const Color(0x0F000000));
      // 深色：白 6%
      expect(FlowUsColors.dark.hoverOverlay, const Color(0x0FFFFFFF));
    });

    test('侧栏页项三态：hover 黑 3% / 选中黑 6%', () {
      expect(FlowUsColors.sidebarItemHover, const Color(0x08000000));
      expect(FlowUsColors.sidebarItemSelected, const Color(0x0F000000));
      // 8 位色深下：3% ≈ 8/255 = 0.0314，6% ≈ 15/255 = 0.0588（不是精确两倍，差 1/255）
      expect(FlowUsColors.sidebarItemHover.a, closeTo(0.0314, 0.002));
      expect(FlowUsColors.sidebarItemSelected.a, closeTo(0.0588, 0.002));
      // 语义上必须是"选中明显重于 hover"
      expect(FlowUsColors.sidebarItemSelected.a, greaterThan(FlowUsColors.sidebarItemHover.a));
    });
  });

  group('字体（基准-字体与图标 / 正文行高与块结构）', () {
    test('字体栈照抄，首位是 my-quote', () {
      expect(FlowUsTypography.fontFamily.startsWith('my-quote'), isTrue);
      expect(FlowUsTypography.fontFamily.contains('Microsoft YaHei'), isTrue);
    });

    test('页面大标题 40/64/w600；文档内标题 30/45/w600（两套，别混）', () {
      expect(FlowUsTypography.pageTitle.fontSize, 40);
      expect(FlowUsTypography.pageTitle.height, closeTo(64 / 40, 0.0001));
      expect(FlowUsTypography.pageTitle.fontWeight, FontWeight.w600);

      expect(FlowUsTypography.blockHeading.fontSize, 30);
      expect(FlowUsTypography.blockHeading.height, closeTo(45 / 30, 0.0001));
    });

    test('正文：字号 16，块级行高 24、行内行高 26', () {
      expect(FlowUsTypography.bodyFontSize, 16);
      expect(FlowUsTypography.bodyBlockLineHeight, 24);
      expect(FlowUsTypography.bodyInlineLineHeight, 26);
    });

    test('代码块 14/21（不是正文的 16/26）', () {
      expect(FlowUsTypography.codeBlock.fontSize, 14);
      expect(FlowUsTypography.codeBlock.height, closeTo(21 / 14, 0.0001));
    });

    test('字重只有 400/500/600，没有 700', () {
      expect(FlowUsTypography.allowedFontWeights, [400, 500, 600]);
      expect(FlowUsTypography.allowedFontWeights.contains(700), isFalse);
    });
  });

  group('块级排版（基准-块级排版）', () {
    test('单行块高 34 = 行内行高 26 + 上下各 4', () {
      expect(FlowUsBlockMetrics.singleLineBlockHeight, 34);
      expect(
        FlowUsTypography.bodyInlineLineHeight + FlowUsBlockMetrics.blockPaddingVertical * 2,
        FlowUsBlockMetrics.singleLineBlockHeight,
      );
    });

    test('块间距 2 = my-px 上下各 1', () {
      expect(FlowUsBlockMetrics.blockMarginVertical * 2, FlowUsBlockMetrics.blockGap);
      expect(FlowUsBlockMetrics.blockGap, 2);
    });

    test('列表缩进台阶 26', () {
      expect(FlowUsBlockMetrics.listIndent, 26);
    });

    test('勾选框 24×24，容器 24×26', () {
      expect(FlowUsBlockMetrics.checkboxIconSize, 24);
      expect(FlowUsBlockMetrics.checkboxBoxWidth, 24);
      expect(FlowUsBlockMetrics.checkboxBoxHeight, 26);
    });

    test('★ 块手柄与「＋」的热区不同（36 vs 12）', () {
      expect(FlowUsBlockMetrics.blockHandleHotZone, 36);
      expect(FlowUsBlockMetrics.blockAddHotZone, 12);
      expect(
        FlowUsBlockMetrics.blockHandleHotZone == FlowUsBlockMetrics.blockAddHotZone,
        isFalse,
        reason: '两个热区宽度不同，必须分别设（写成一个会重现"加号点不到"）',
      );
    });
  });

  group('组件尺寸（基准-组件）', () {
    test('按钮 32 高、内边距 0 12', () {
      expect(FlowUsComponents.buttonHeight, 32);
      expect(FlowUsComponents.buttonPaddingH, 12);
    });

    test('菜单面板 224×292、项高 32、面板圆角 12', () {
      expect(FlowUsComponents.menuPanelWidth, 224);
      expect(FlowUsComponents.menuPanelHeight8Items, 292);
      expect(FlowUsComponents.menuItemHeight, 32);
      expect(FlowUsRadius.panel, 12);
    });

    test('弹层 1200 上限、确认弹窗 302×170', () {
      expect(FlowUsComponents.modalMaxWidth, 1200);
      expect(FlowUsComponents.confirmDialogWidth, 302);
      expect(FlowUsComponents.confirmDialogHeight, 170);
    });
  });

  group('动效（基准-交互）', () {
    test('hover 0.1s ease-out', () {
      expect(FlowUsMotion.hover, const Duration(milliseconds: 100));
      expect(FlowUsMotion.hoverCurve, Curves.easeOut);
    });

    test('全站最长 0.5s，且无弹跳', () {
      expect(FlowUsMotion.longest, const Duration(milliseconds: 500));
      expect(FlowUsMotion.hoverCurve, isNot(Curves.elasticOut));
      expect(FlowUsMotion.hoverCurve, isNot(Curves.bounceOut));
    });
  });
}