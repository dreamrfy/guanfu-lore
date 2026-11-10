// 保存链与崩溃恢复（M2-T14）
//
// 复用既有零件（不重造轮子）：
//   · `SaveController`（lib/controllers/save_controller.dart）：防抖 800ms → 落盘 → 状态灯；键击即时写草稿
//   · `AppDatabase`：`updatePageContent`（rev 自增）、`renamePage`、`saveDraft` / `draftFor` / `clearDraft`
//
// 这一层只负责把"页面"和这几个零件接起来，并定义**崩溃恢复的判定规则**：
//   · 键击 → 立刻写草稿（drafts 表）；主库落盘成功 → 清草稿
//   · 下次打开页面：草稿存在且**与主库正文不同** → 提示恢复；相同 → 视为无草稿（顺手清掉）
//
// ⚠️ 离线队列不在本轮（属 M7 同步；本地库已经是"离线可写"，只是没有云端队列）。

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../controllers/save_controller.dart';
import '../data/database.dart';
import '../data/save_state.dart';

/// 打开页面时的状态（供 UI 决定要不要弹恢复提示）
class PageOpenResult {
  const PageOpenResult({
    required this.title,
    required this.content,
    required this.hasRecoverableDraft,
  });

  final String title;
  final String content;

  /// 有比主库更新的草稿（崩溃后恢复用）
  final bool hasRecoverableDraft;
}

class PageSavePipeline extends ChangeNotifier {
  PageSavePipeline({
    required this.db,
    required this.pageId,
    Duration debounce = const Duration(milliseconds: 800),
  }) : _titleDebounce = debounce {
    content = SaveController(
      write: (json) => db.updatePageContent(pageId, json),
      draftWrite: (json) => db.saveDraft(pageId, json),
      draftClear: () => db.clearDraft(pageId),
      debounce: debounce,
    );
    content.addListener(_bubble);
  }

  final AppDatabase db;
  final String pageId;

  /// 正文保存控制器（防抖 + 草稿 + 状态灯）
  late final SaveController content;

  final Duration _titleDebounce;
  Timer? _titleTimer;
  String _pendingTitle = '';
  String _lastSavedTitle = '';

  SaveStatus get status => content.status;
  String get lastError => content.lastError;

  void _bubble() => notifyListeners();

  /// 打开页面：读标题/正文，并判定是否有可恢复草稿
  Future<PageOpenResult> open() async {
    final page = await db.pageById(pageId);
    final stored = page?.content ?? '';
    final draft = await db.draftFor(pageId);
    final draftContent = draft?.content;
    final recoverable = draftContent != null && draftContent.isNotEmpty && draftContent != stored;
    if (!recoverable && draftContent != null) {
      // 草稿与主库一致（=上次正常保存后没清干净）→ 顺手清掉，不留噪声
      await db.clearDraft(pageId);
    }
    content.markSaved(stored);
    _lastSavedTitle = page?.title ?? '';
    return PageOpenResult(
      title: _lastSavedTitle,
      content: stored,
      hasRecoverableDraft: recoverable,
    );
  }

  /// 采纳草稿：把草稿内容写进正文（并清草稿），返回该内容
  Future<String> acceptDraft() async {
    final draft = await db.draftFor(pageId);
    final json = draft?.content ?? '';
    if (json.isNotEmpty) {
      await db.updatePageContent(pageId, json);
      await db.clearDraft(pageId);
      content.markSaved(json);
    }
    return json;
  }

  /// 放弃草稿（用户选择用主库版本）
  Future<void> discardDraft() async {
    await db.clearDraft(pageId);
    notifyListeners();
  }

  /// 正文变更：先走防抖（内部同时写草稿），标题变更也防抖（标题不写草稿）
  void editContent(String json) => content.editText(json);

  void editTitle(String title) {
    _pendingTitle = title;
    _titleTimer?.cancel();
    _titleTimer = Timer(_titleDebounce, () async {
      if (_pendingTitle == _lastSavedTitle) return;
      await db.renamePage(pageId, _pendingTitle);
      _lastSavedTitle = _pendingTitle;
    });
  }

  /// 立即落库（切页/关窗前调用）：正文 flush + 标题立即写
  Future<void> flush() async {
    await content.flush();
    _titleTimer?.cancel();
    if (_pendingTitle != _lastSavedTitle) {
      await db.renamePage(pageId, _pendingTitle);
      _lastSavedTitle = _pendingTitle;
    }
  }

  @override
  void dispose() {
    _titleTimer?.cancel();
    content.removeListener(_bubble);
    content.dispose();
    super.dispose();
  }
}