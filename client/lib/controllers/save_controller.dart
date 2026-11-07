import 'dart:async';

import 'package:flutter/foundation.dart';

import '../data/save_state.dart';

/// 保存控制器：编辑缓冲 → 防抖 → 落盘 → 状态通知。
/// 写入函数外部注入（真库/假库/故障注入都从这进），便于测试。
class SaveController extends ChangeNotifier {
  SaveController({
    required this._write,
    this.draftWrite,
    this.draftClear,
    this.debounce = const Duration(milliseconds: 800),
  });

  final Future<void> Function(String content) _write;

  /// 崩溃恢复草稿钩子（P1-T05）：键击即时写草稿；主库落盘成功即清除。
  final Future<void> Function(String content)? draftWrite;
  final Future<void> Function()? draftClear;

  final Duration debounce;
  Future<void> _draftQueue = Future.value();

  String _buffer = '';
  String _lastSaved = '';
  bool _dirty = false;
  bool _writeFailed = false;
  bool _conflict = false;
  Timer? _timer;
  String _lastError = '';

  SaveStatus get status =>
      deriveSaveStatus(dirty: _dirty, writeFailed: _writeFailed, conflict: _conflict);

  String get lastError => _lastError;
  bool get hasConflict => _conflict;
  bool get isDirty => _dirty;

  /// 程序化载入内容后调用：基准对齐，防止「打开即写」的幽灵保存（rev 不该空跳）。
  void markSaved(String content) {
    _lastSaved = content;
    _dirty = false;
    _writeFailed = false;
    notifyListeners();
  }

  /// 编辑入口：标脏 + 重置失败标记 + 重新计时 + 草稿即时落（不进防抖）。
  void editText(String text) {
    _buffer = text;
    _dirty = true;
    _writeFailed = false;
    _lastError = '';
    _schedule();
    final dw = draftWrite;
    if (dw != null) {
      // 串行排队，防乱序：后到的编辑总是后写
      _draftQueue = _draftQueue.then((_) async {
        try {
          await dw(_buffer);
        } catch (_) {
          // 草稿失败不影响主流程（主库仍有防抖写入）
        }
      });
    }
    notifyListeners();
  }

  /// 立即落盘（防抖到期或退出页面时调用）。
  Future<void> flush() async {
    _timer?.cancel();
    _timer = null;
    if (!_dirty) return;
    if (_buffer == _lastSaved) {
      // 内容与已保存基准一致（如键盘组合事件造成的空变化）：不写、不跳版本号
      _dirty = false;
      notifyListeners();
      return;
    }
    try {
      await _write(_buffer);
      _dirty = false;
      _writeFailed = false;
      _lastSaved = _buffer;
      final dc = draftClear;
      if (dc != null) {
        _draftQueue = _draftQueue.then((_) async {
          try {
            await dc();
          } catch (_) {}
        });
      }
    } catch (e) {
      _writeFailed = true;
      _lastError = e.toString();
    }
    notifyListeners();
  }

  /// 冲突位由同步层（P7）设置。
  void setConflict(bool value) {
    _conflict = value;
    notifyListeners();
  }

  void disposeTimer() {
    _timer?.cancel();
    _timer = null;
  }

  void _schedule() {
    _timer?.cancel();
    _timer = Timer(debounce, () {
      flush();
    });
  }
}
