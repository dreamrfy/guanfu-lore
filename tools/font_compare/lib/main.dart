// 字体候选渲染对比（M12-T01 · 需要用户拍板）
//
// 目的：让用户**看到**每套字体在自己机器上的真实效果，而不是看字体名猜。
// 做法：同一个 App 里并排渲染多套字体的同一段文字 → 截图 → 给用户看。
//
// 已知事实（2026-11-10 已测）：
//   · 真 FlowUs 的字体栈 = my-quote → PingFang SC → Microsoft YaHei → ...
//   · my-quote 是 FlowUs 私有字体，**我们没打包** → 实际落到微软雅黑
//   · 真 FlowUs 在 Windows 上**同样**落到微软雅黑，字宽与我们一致（83/97/96 vs 83/98/96）
//   → **换成别的字体不会破坏 1:1 对齐**，因为对齐的参照物本来就是雅黑
//
// 候选（都是可合法内置的宽松协议 / 系统自带）：
//   A. 系统微软雅黑（现状，不打包任何字体）
//   B. Noto Sans SC（本机已装，Google 开源 OFL）
//   C. Noto Serif SC（本机已装，Google 开源 OFL）
//   D. 等线 DengXian（Windows 自带）
//   E. 黑体 SimHei / 宋体 SimSun（Windows 自带）

import 'package:flutter/material.dart';

void main() {
  runApp(const FontCompareApp());
}

const Map<String, String> kCandidates = {
  '微软雅黑（现状）': 'Microsoft YaHei',
  'Noto Sans SC': 'Noto Sans SC',
  'Noto Serif SC': 'Noto Serif SC',
  '等线 DengXian': 'DengXian',
  '黑体 SimHei': 'SimHei',
  '宋体 SimSun': 'SimSun',
};

class FontCompareApp extends StatelessWidget {
  const FontCompareApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: Colors.white,
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '正文 16 / 行高 26',
                style: TextStyle(fontSize: 13, color: Color(0xFF91918E)),
              ),
              const SizedBox(height: 8),
              for (final entry in kCandidates.entries) ...[
                _Row(
                  label: entry.key,
                  family: entry.value,
                  text: '磷酸铁锂成本分析与正极材料对比',
                ),
                _Row(
                  label: '',
                  family: entry.value,
                  text: '正极材料对比——碳酸锂价格波动与产能分析。ABC abc 123',
                  size: 14,
                  height: 21,
                  bold: true,
                ),
                const SizedBox(height:14),
              ],
              const Divider(height: 24),
              const Text(
                '页面大标题 40 / 64 / w600',
                style: TextStyle(fontSize: 13, color: Color(0xFF91918E)),
              ),
              const SizedBox(height: 8),
              for (final entry in kCandidates.entries)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(
                    '学习进度',
                    style: TextStyle(
                      fontSize: 40,
                      height: 64 / 40,
                      fontWeight: FontWeight.w600,
                      fontFamily: entry.value,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.label,
    required this.family,
    required this.text,
    this.size = 16,
    this.height = 26,
    this.bold = false,
  });

  final String label;
  final String family;
  final String text;
  final double size;
  final double height;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 150,
          child: Text(
            label,
            style: const TextStyle(fontSize: 12, height: 18 / 12, color: Color(0xFF91918E)),
          ),
        ),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              fontSize: size,
              height: height / size,
              fontFamily: family,
              fontWeight: bold ? FontWeight.w600 : FontWeight.w400,
              color: const Color(0xFF37352F),
            ),
          ),
        ),
      ],
    );
  }
}
