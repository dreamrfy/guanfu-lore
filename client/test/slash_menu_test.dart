// M2-T06 斜杠菜单验收（数据层）
//
// 实测依据：`基准-斜杠菜单全量.md`（面板 288×396、8 组、约 90 项、77 个快捷码）
// 本轮范围按该文档自己的"首版建议"：**基础块组 + 快捷码**。
// 跑法：cd client && flutter test test/slash_menu_test.dart

import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/editor/slash_menu.dart';

void main() {
  group('清单照抄实测（基准-斜杠菜单全量 §1.2）', () {
    test('基础块组 23 项，名字与快捷码逐项对得上', () {
      const expected = [
        ('正文', 'zw'),
        ('待办列表', 'dblb'),
        ('页面', 'ym'),
        ('引用页面', 'yyym'),
        ('标题1', 'h1'),
        ('标题2', 'h2'),
        ('标题3', 'h3'),
        ('标题4', 'h4'),
        ('简单表格', 'jdbg'),
        ('项目列表', 'xmlb'),
        ('编号列表', 'bhlb'),
        ('折叠列表', 'zdlb'),
        ('分割线', 'fgx'),
        ('引述文字', 'yswz'),
        ('着重文字', 'zzwz'),
        ('代码片段', 'dmpd'),
        ('数学公式', 'sxgs'),
        ('思维导图', 'swdt'),
        ('思维导图页面', 'swdtym'),
        ('折叠标题1', 'zdbt1'),
        ('折叠标题2', 'zdbt2'),
        ('折叠标题3', 'zdbt3'),
        ('折叠标题4', 'zdbt4'),
      ];
      expect(kBasicBlockSlashItems.length, expected.length);
      for (var i = 0; i < expected.length; i++) {
        expect(kBasicBlockSlashItems[i].name, expected[i].$1, reason: '第 $i 项名字');
        expect(kBasicBlockSlashItems[i].code, expected[i].$2, reason: '第 $i 项快捷码');
      }
    });

    test('其余 7 组也登记了（本轮不接，但清单在）', () {
      expect(kOtherSlashGroups.keys.toList(),
          ['AI 助手 Beta', '行内元素', '多维表', '导入', '媒体', '嵌入', '高级块']);
      expect(kOtherSlashGroups['多维表']!.length, 15);
      expect(kOtherSlashGroups['嵌入']!.length, 18);
      expect(kOtherSlashGroups['媒体']!.length, 8);
    });

    test('现在能做 11 项（M2-T19 加了代码块）；做不了的 12 项显式标注（不静默丢）', () {
      final supported = kBasicBlockSlashItems.where((e) => e.supported).map((e) => e.name).toList();
      expect(supported, ['正文', '待办列表', '标题1', '标题2', '标题3', '标题4', '项目列表', '编号列表', '分割线', '引述文字', '代码片段']);

      final unsupported = kBasicBlockSlashItems.where((e) => !e.supported).map((e) => e.name).toList();
      expect(unsupported.length, 12);
      expect(unsupported, containsAll(['着重文字', '折叠列表', '简单表格', '页面', '数学公式']));
    });

    test('菜单项数与可做项一致（11）', () {
      expect(buildFlowUsSlashItems().length, 11);
    });
  });

  group('交互（widget test 驱动不了，留真机截图）', () {
    test('内核是自绘富文本：子树里 EditableText = 0', () {
      // 实测：FlowUsEditor 子树 `find.byType(EditableText)` = 0（RichText 有 2 个）→
      // tester.enterText 与原始按键都驱动不了它的文本输入，所以"打 / 弹菜单 / 过滤 / 点选"
      // 只能在真机（exe）上验，已在任务表核对项与证据目录里写明。
      expect(true, isTrue);
    }, skip: '交互验证放在真机截图（docs/基准/证据/M2-T06/）');
  });
}