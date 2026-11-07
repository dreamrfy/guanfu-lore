import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:bijiapp/controllers/save_controller.dart';
import 'package:bijiapp/data/save_state.dart';

void main() {
  group('deriveSaveStatus（纯函数五态）', () {
    test('冲突优先级最高', () {
      expect(
        deriveSaveStatus(dirty: true, writeFailed: true, conflict: true),
        SaveStatus.conflict,
      );
    });
    test('写盘失败绝不显示已保存', () {
      expect(
        deriveSaveStatus(dirty: false, writeFailed: true, conflict: false),
        SaveStatus.saveFailed,
      );
    });
    test('有未落盘编辑 = 编辑中', () {
      expect(
        deriveSaveStatus(dirty: true, writeFailed: false, conflict: false),
        SaveStatus.editing,
      );
    });
    test('落盘成功且无编辑 = 已保存在本机·等待同步（P1 常态）', () {
      expect(
        deriveSaveStatus(dirty: false, writeFailed: false, conflict: false),
        SaveStatus.pendingSync,
      );
    });
    test('五态文案互不相同（界面可区分）', () {
      final labels = SaveStatus.values.map(saveStatusLabel).toSet();
      expect(labels.length, SaveStatus.values.length);
      expect(saveStatusLabel(SaveStatus.pendingSync), contains('已保存在本机'));
      expect(saveStatusLabel(SaveStatus.saveFailed), isNot(contains('已保存')));
    });
  });

  group('SaveController（防抖+落盘+失败重试）', () {
    test('编辑→防抖→落盘成功→等待同步；失败→保存失败；恢复→重试成功', () {
      fakeAsync((async) {
        var writes = 0;
        Object? failNext;
        final ctl = SaveController(
          write: (content) async {
            if (failNext != null) throw failNext;
            writes++;
          },
        );

        // 编辑中
        ctl.editText('第一段');
        expect(ctl.status, SaveStatus.editing);
        expect(writes, 0, reason: '防抖期内不应落盘');

        // 防抖到期 → 落盘成功
        async.elapse(const Duration(milliseconds: 800));
        expect(writes, 1);
        expect(ctl.status, SaveStatus.pendingSync);

        // 注入故障 → 编辑 → 落盘失败
        failNext = Exception('模拟写盘失败');
        ctl.editText('第二段');
        async.elapse(const Duration(milliseconds: 800));
        expect(writes, 1, reason: '失败的写入不计入成功次数');
        expect(ctl.status, SaveStatus.saveFailed);
        expect(saveStatusLabel(ctl.status), isNot(contains('已保存')));

        // 故障解除 → 再编辑 → 重试成功
        failNext = null;
        ctl.editText('第三段');
        async.elapse(const Duration(milliseconds: 800));
        expect(writes, 2);
        expect(ctl.status, SaveStatus.pendingSync);

        // 冲突位（P7 预留）
        ctl.setConflict(true);
        expect(ctl.status, SaveStatus.conflict);

        // 干净状态 flush 是空操作
        ctl.setConflict(false);
        ctl.flush();
        async.flushMicrotasks();
        expect(writes, 2);
        ctl.disposeTimer();
        ctl.dispose();
      });
    });

    test('连续打字只落最后一次（防抖合并）', () {
      fakeAsync((async) {
        var writes = 0;
        String? last;
        final ctl = SaveController(
          write: (content) async {
            writes++;
            last = content;
          },
        );
        ctl.editText('a');
        async.elapse(const Duration(milliseconds: 300));
        ctl.editText('ab');
        async.elapse(const Duration(milliseconds: 300));
        ctl.editText('abc');
        async.elapse(const Duration(milliseconds: 800));
        expect(writes, 1, reason: '800ms 内的三次编辑应合并为一次落盘');
        expect(last, 'abc');
        ctl.disposeTimer();
        ctl.dispose();
      });
    });

    test('幽灵保存防护：markSaved 后相同内容 flush 不落盘、不跳版本', () {
      fakeAsync((async) {
        var writes = 0;
        final ctl = SaveController(
          write: (content) async {
            writes++;
          },
        );
        ctl.markSaved('库里的内容'); // 载入基准
        expect(ctl.status, SaveStatus.pendingSync);
        // 键盘组合事件把文本「改」回相同值：editText 标脏，但 flush 时应跳过
        ctl.editText('库里的内容');
        expect(ctl.status, SaveStatus.editing);
        ctl.flush();
        async.flushMicrotasks();
        expect(writes, 0, reason: '与已保存基准一致的内容不得产生写入');
        expect(ctl.status, SaveStatus.pendingSync);
        ctl.disposeTimer();
        ctl.dispose();
      });
    });

    test('草稿钩子：键击即时写草稿；主库成功即清除；主库失败保留草稿', () {
      fakeAsync((async) {
        var writes = 0;
        Object? failNext;
        final drafts = <String>[];
        var cleared = 0;
        final ctl = SaveController(
          write: (content) async {
            if (failNext != null) throw failNext;
            writes++;
          },
          draftWrite: (content) async {
            drafts.add(content);
          },
          draftClear: () async {
            cleared++;
          },
        );

        // 编辑：草稿立即写（微任务级，不等 800ms 防抖计时器）
        ctl.editText('崩溃前打的字');
        async.flushMicrotasks();
        expect(drafts, ['崩溃前打的字'], reason: '草稿必须即时落，不等 800ms');
        expect(writes, 0);

        // 主库失败：草稿保留（内容保护）
        failNext = 'x';
        async.elapse(const Duration(milliseconds: 800));
        expect(ctl.status, SaveStatus.saveFailed);
        expect(cleared, 0, reason: '写盘失败时草稿必须保留');
        expect(drafts.length, 1);

        // 恢复后重试成功：草稿清除
        failNext = null;
        ctl.editText('崩溃前打的字-补');
        async.elapse(const Duration(milliseconds: 800));
        expect(ctl.status, SaveStatus.pendingSync);
        async.flushMicrotasks();
        expect(cleared, 1, reason: '主库落盘成功后草稿应被清除');
        ctl.disposeTimer();
        ctl.dispose();
      });
    });
  });
}
