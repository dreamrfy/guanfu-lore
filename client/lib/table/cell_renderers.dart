// 单元格「值渲染」（M4-T03 第一批：文本 / 数字 / 单选 / 多选 / 日期 / 复选框）
//
// 实测依据（2026-11-10，live DOM 计算样式，正文遮蔽）：
//   · 单选/多选胶囊：高 20、圆角 4、左右内边距 6、文字 14/20；多选之间间距 4（行容器 `space-x-1`）
//   · 胶囊配色**按选项色名**走：绿 #D2ECD5/#3B5B46、灰 #ECEDED/#474D58、粉 #F8DAE6/#8B2B69、橙 #F8DEC5/#683D26
//   · 日期显示 `YYYY/MM/DD HH:mm`（实测 9999/99/99 99:99）、14/24、#37352F、左对齐
//   · 文本/数字单元格同为 14/24 #37352F 左对齐
//
// ⚠️ 未实测：**勾选框**（该表没有这种列）→ 先用 16×16 方框占位，token 里标明；
//    数字单元格的对齐方式（实测到的都是左对齐，没找到右对齐的反例）。

import 'package:flutter/material.dart';

import 'flowus_table.dart';
import '../design/tokens.dart';

/// 单元格里的一个多选/单选项
class _Option {
  const _Option(this.label, this.colorName);
  final String label;
  final String? colorName;
}

/// 按字段类型渲染单元格内容
class FlowUsCellValue extends StatelessWidget {
  const FlowUsCellValue({super.key, required this.field, required this.raw});

  final FlowUsFieldDefinition field;

  /// 原始值（我们模型里原样持有的 JSON 值）
  final Object? raw;

  @override
  Widget build(BuildContext context) {
    switch (field.type) {
      case FlowUsFieldType.select:
        final opt = _firstOption();
        if (opt == null) return const SizedBox.shrink();
        return Align(alignment: Alignment.centerLeft, child: _Pill(option: opt));

      case FlowUsFieldType.multiSelect:
        final opts = _options();
        if (opts.isEmpty) return const SizedBox.shrink();
        return Align(
          alignment: Alignment.centerLeft,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < opts.length; i++) ...[
                if (i > 0) const SizedBox(width: FlowUsTable.pillGap),
                _Pill(option: opts[i]),
              ],
            ],
          ),
        );

      case FlowUsFieldType.date:
      case FlowUsFieldType.createdTime:
      case FlowUsFieldType.updatedTime:
        final text = FlowUsDateText.format(raw);
        return _plain(text);

      case FlowUsFieldType.checkbox:
        return Align(
          alignment: Alignment.centerLeft,
          child: FlowUsCheckboxCell(checked: raw == true),
        );

      case FlowUsFieldType.title:
      case FlowUsFieldType.text:
      case FlowUsFieldType.number:
      case FlowUsFieldType.unknown:
      default:
        return _plain(raw == null ? '' : '$raw');
    }
  }

  Widget _plain(String text) => Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          fontSize: FlowUsTable.cellTextSize,
          height: FlowUsTable.cellLineHeight / FlowUsTable.cellTextSize,
          color: Color(0xFF37352F),
        ),
      );

  /// 单选：值可能是字符串，也可能是 [{'name','color'}]
  _Option? _firstOption() => _options().isEmpty ? null : _options().first;

  List<_Option> _options() {
    final v = raw;
    if (v == null) return const [];
    if (v is String) return [_Option(v, null)];
    if (v is List) {
      return [
        for (final e in v)
          if (e is String)
            _Option(e, null)
          else if (e is Map)
            _Option(
              '${e['name'] ?? e['text'] ?? e['title'] ?? ''}',
              e['color']?.toString(),
            ),
      ];
    }
    if (v is Map) return [_Option('${v['name'] ?? ''}', v['color']?.toString())];
    return const [];
  }
}

/// 胶囊：高 20、圆角 4、左右 6、文字 14/20；底色/字色按选项色名
class _Pill extends StatelessWidget {
  const _Pill({required this.option});
  final _Option option;

  @override
  Widget build(BuildContext context) {
    final c = FlowUsOptionColors.of(option.colorName);
    return Container(
      height: FlowUsTable.pillHeight,
      padding: const EdgeInsets.symmetric(horizontal: FlowUsTable.pillPaddingH),
      decoration: BoxDecoration(
        color: c.bg,
        borderRadius: BorderRadius.circular(FlowUsTable.pillRadius),
      ),
      alignment: Alignment.center,
      child: Text(
        option.label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(fontSize: FlowUsTable.cellTextSize, height: 20 / 14, color: c.fg),
      ),
    );
  }
}

/// 复选框单元格。⚠️ 尺寸未实测（该表没有这种列），先用 token 的 16
class FlowUsCheckboxCell extends StatelessWidget {
  const FlowUsCheckboxCell({super.key, required this.checked});
  final bool checked;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: FlowUsTable.checkboxSize,
      height: FlowUsTable.checkboxSize,
      decoration: BoxDecoration(
        color: checked ? const Color(0xFF0285FF) : Colors.transparent,
        borderRadius: BorderRadius.circular(2),
        border: Border.all(
          color: checked ? const Color(0xFF0285FF) : const Color(0x1A37352F),
          width: 1,
        ),
      ),
      child: checked
          ? const Icon(Icons.check, size: 12, color: Colors.white)
          : null,
    );
  }
}

/// 日期文本：实测形如 `2026/10/21 11:35`（`YYYY/MM/DD HH:mm`）
///
/// 支持：毫秒时间戳（num / 数字字符串）、ISO 字符串、已经格式化过的字符串（原样返回）。
abstract final class FlowUsDateText {
  static String format(Object? raw) {
    if (raw == null) return '';
    DateTime? dt;
    if (raw is num) {
      dt = DateTime.fromMillisecondsSinceEpoch(raw.toInt());
    } else if (raw is String) {
      final n = int.tryParse(raw);
      dt = n != null ? DateTime.fromMillisecondsSinceEpoch(n) : DateTime.tryParse(raw);
      if (dt == null) return raw; // 已经是目标形态或其它文本 → 原样
    }
    if (dt == null) return '$raw';
    return _fmt(dt);
  }

  static String _fmt(DateTime d) {
    String two(int v) => v.toString().padLeft(2, '0');
    final local = d.toLocal();
    return '${local.year}/${two(local.month)}/${two(local.day)} ${two(local.hour)}:${two(local.minute)}';
  }
}