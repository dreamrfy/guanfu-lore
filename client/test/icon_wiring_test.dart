// M1-T12 图标接线完整性：名字常量 ↔ 资产文件必须一一对应
//
// 这条测试防的是"名字写错一个字母 → 界面上一个空白圈"（flutter_svg 缺资产是静默失败，不报错）。
// 跑法：cd client && flutter test test/icon_wiring_test.dart

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/flowus_icons.dart';

void main() {
  test('FlowUsIc.all 有 103 个且没有重复（M1-T15 又补 2 个）', () {
    expect(FlowUsIc.all.length, 103);
    expect(FlowUsIc.all.toSet().length, 103);
  });

  test('每个图标名都有对应的 assets/icons/<名字>.svg', () {
    final missing = <String>[];
    for (final name in FlowUsIc.all) {
      final f = File('assets/icons/$name.svg');
      if (!f.existsSync()) missing.add(name);
    }
    expect(missing, isEmpty, reason: '这些图标名在 assets/icons/ 下没有文件：$missing');
  });

  test('资产目录里的 svg 数量与清单一致（104 = 103 个清单项 + 1 个未登记）', () {
    final files = Directory('assets/icons').listSync().whereType<File>().where((f) => f.path.endsWith('.svg')).toList();
    expect(files.length, 104, reason: '目录里实际有 ${files.length} 个 svg');
    // 反向也查一遍：目录里有、但清单没登记的（多出来的那个），确保只是漏登记而不是名字不一致
    final names = FlowUsIc.all.toSet();
    final unlisted = files
        .map((f) => f.uri.pathSegments.last.replaceAll('.svg', ''))
        .where((n) => !names.contains(n))
        .toList();
    expect(unlisted.length, lessThanOrEqualTo(1), reason: '未登记图标：$unlisted');
  });

  test('关键槽位的图标名与实测一致（防止把 IcMore 换成别的）', () {
    // 依据 基准-图标对照.md + M1-T07 证据
    expect(FlowUsIc.arrowHide, 'IcArrowHide'); // 侧栏折叠 «
    expect(FlowUsIc.aiFace, 'IcAiFace'); // FlowUs AI 行（渐变圆脸，M1-T15 换成实采）
    expect(FlowUsIc.subscribe, 'IcSubscribe'); // 我的订阅
    expect(FlowUsIc.luStore, 'Store'); // 市集（Lucide）
    expect(FlowUsIc.trash, 'IcTrash'); // 回收站
    expect(FlowUsIc.pages, 'IcPages'); // 普通页
    expect(FlowUsIc.table, 'IcTable'); // 多维表页
    expect(FlowUsIc.folderContent, 'IcFolderContent'); // 文件夹页
    expect(FlowUsIc.question, 'IcQuestion'); // 帮助钮
    expect(FlowUsIc.luSearch, 'Search'); // 搜索（Lucide）
  });
}