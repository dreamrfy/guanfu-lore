// 顶部提示条：系统横幅（容量条）+ 删除恢复横幅（M1-T06）
//
// 数值来源：docs/基准/证据/M1-T06/banner.json（M0-T02/M0-T06 证据复核 + 截图取色）。
// 本文件不写魔数。
//
// 实测要点：
//   · 两种横幅都是独立一条（高 44），出现时把主内容整体下推，不做浮层
//   · 系统横幅：内容居中（图标+文字 14/24/400）+ 右侧升级钮 74×28（蓝边框 30%）+ 关闭钮 right-4
//   · 删除横幅：红底 rgb(203,64,66)、白字居中 + 右侧 恢复/彻底删除 两白字钮 right-2
// ⚠️ 图标 Material 占位（真图标 M1-T12 接线）。

import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// 系统横幅的红/蓝辅助色（横幅专属，不进全局色板——只在横幅出现）
abstract final class FlowUsBannerColors {
  /// 删除横幅红底（截图取色 rgb(203,64,66)）
  static const Color dangerBg = Color(0xFFCB4042);

  /// 升级钮边框 rgba(2,133,255,0.3)
  static const Color upgradeBorder = Color(0x4D0285FF);

  /// 系统横幅底 rgba(2,133,255,0.05)
  static const Color systemBg = Color(0x0D0285FF);

  /// 系统横幅底框 rgba(2,133,255,0.1)
  static const Color systemBorder = Color(0x1A0285FF);
}

/// 系统横幅（容量条等）：高 44、蓝底 5%、内容居中、右侧升级钮+关闭钮
class FlowUsSystemBanner extends StatelessWidget {
  const FlowUsSystemBanner({
    super.key,
    required this.text,
    this.onUpgrade,
    this.onClose,
  });

  final String text;
  final VoidCallback? onUpgrade;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return Container(
      height: FlowUsLayout.bannerHeight,
      decoration: const BoxDecoration(
        color: FlowUsBannerColors.systemBg,
        border: Border(bottom: BorderSide(color: FlowUsBannerColors.systemBorder)),
      ),
      child: Stack(
        children: [
          // 内容居中：图标 + 文字
          Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.description_outlined,
                    size: FlowUsComponents.toolButtonIconSize, color: FlowUsBannerColors.upgradeBorder),
                const SizedBox(width: 8),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 350),
                  child: Text(text,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 14, height: 24 / 14)),
                ),
                const SizedBox(width: 8),
                _UpgradeButton(onTap: onUpgrade),
              ],
            ),
          ),
          // 右侧关闭钮 absolute right-4
          if (onClose != null)
            Positioned(
              right: FlowUsLayout.tabBarPaddingH,
              top: (FlowUsLayout.bannerHeight - FlowUsComponents.inlineIconButton) / 2,
              child: GestureDetector(
                onTap: onClose,
                child: SizedBox(
                  width: FlowUsComponents.inlineIconButton,
                  height: FlowUsComponents.inlineIconButton,
                  child: Icon(Icons.close, size: 16, color: c.textTertiary),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// 「立即升级」74×28、圆角 6、蓝边框 30%、底透明、字 14/24/w500
class _UpgradeButton extends StatelessWidget {
  const _UpgradeButton({this.onTap});
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = flowUsColors(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 74,
        height: FlowUsComponents.buttonSmallHeight,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(FlowUsRadius.control),
          border: Border.all(color: FlowUsBannerColors.upgradeBorder),
        ),
        child: Text('立即升级',
            style: TextStyle(
                fontSize: 14, height: 24 / 14, fontWeight: FontWeight.w500, color: c.primary)),
      ),
    );
  }
}

/// 删除恢复横幅：红底、白字居中（图标+「当前页面已删除」）+ 右侧 恢复/彻底删除
class FlowUsDeleteBanner extends StatelessWidget {
  const FlowUsDeleteBanner({super.key, this.onRestore, this.onDelete});

  final VoidCallback? onRestore;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: FlowUsLayout.bannerHeight,
      color: FlowUsBannerColors.dangerBg,
      child: Stack(
        children: [
          Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.delete_outline,
                    size: FlowUsComponents.toolButtonIconSize, color: Colors.white),
                const SizedBox(width: 8),
                const Text('当前页面已删除',
                    style: TextStyle(fontSize: 16, height: 24 / 16, color: Colors.white)),
              ],
            ),
          ),
          // 右侧两钮：恢复 54×32 + 彻底删除 82×32，right-2（右缘贴 8）
          Positioned(
            right: 8,
            top: (FlowUsLayout.bannerHeight - FlowUsComponents.buttonHeight) / 2,
            child: Row(
              children: [
                _DeleteBarAction(
                  label: '恢复',
                  width: 54,
                  onTap: onRestore,
                  testKey: 'delete-bar-restore',
                ),
                const SizedBox(width: 8),
                _DeleteBarAction(
                  label: '彻底删除',
                  width: 82,
                  onTap: onDelete,
                  testKey: 'delete-bar-delete',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// 删除横幅的白字按钮：透明底/白边框/圆角 6/px-12/字 14/24/w500
class _DeleteBarAction extends StatelessWidget {
  const _DeleteBarAction({
    required this.label,
    required this.width,
    required this.onTap,
    required this.testKey,
  });

  final String label;
  final double width;
  final VoidCallback? onTap;
  final String testKey;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        key: ValueKey(testKey),
        width: width,
        height: FlowUsComponents.buttonHeight,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(FlowUsRadius.control),
          border: Border.all(color: Colors.white),
        ),
        child: Text(label,
            style: const TextStyle(
                fontSize: 14, height: 24 / 14, fontWeight: FontWeight.w500, color: Colors.white)),
      ),
    );
  }
}
