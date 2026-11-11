// M1-T12 图标接线完整性：名字常量 ↔ 资产文件必须一一对应
//
// 这条测试防的是"名字写错一个字母 → 界面上一个空白圈"（flutter_svg 缺资产是静默失败，不报错）。
// 跑法：cd client && flutter test test/icon_wiring_test.dart

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/design/flowus_icons.dart';
import 'package:bijiapp/design/icon_themes.dart';

void main() {
  test('FlowUsIc.all 有 105 个且没有重复（M2-T31 补登记 IcCheckboxCheck）', () {
    expect(FlowUsIc.all.length, 105);
    expect(FlowUsIc.all.toSet().length, 105);
  });

  test('每个图标名在**每个主题**下都有对应文件', () {
    // M12-T03：图标按主题分目录（assets/icons/<主题>/<名字>.svg）
    for (final theme in IconThemeSets.all) {
      final missing = <String>[];
      for (final name in FlowUsIc.all) {
        final f = File('assets/icons/${theme.dir}/$name.svg');
        if (!f.existsSync()) missing.add(name);
      }
      expect(missing, isEmpty,
          reason: '这些图标名在 ${theme.dir}/ 下没有文件：$missing');
    }
  });

  test('每个主题的资产目录与清单一一对应（不多不少）', () {
    for (final theme in IconThemeSets.all) {
      final dir = Directory('assets/icons/${theme.dir}');
      final files = dir.existsSync()
          ? dir.listSync().whereType<File>().where((f) => f.path.endsWith('.svg')).toList()
          : <File>[];
      expect(files.length, FlowUsIc.all.length,
          reason: '${theme.dir}/ 里实际有 ${files.length} 个 svg');
      // 反向也查一遍：目录里有、但清单没登记的 —— 那就是"取不到的图标 = 空白圈"
      final names = FlowUsIc.all.toSet();
      final unlisted = files
          .map((f) => f.uri.pathSegments.last.replaceAll('.svg', ''))
          .where((n) => !names.contains(n))
          .toList();
      expect(unlisted, isEmpty,
          reason: '${theme.dir}/ 里有、清单没登记的图标：$unlisted');
    }
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