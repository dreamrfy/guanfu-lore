// 本地化字符串排序（中文按拼音、英文不区分大小写、数字按数值）
//
// 为什么要专门写一个：
//   Dart 的 `String.compareTo` 按 **Unicode 码位**排，对中文用户是**没意义**的
//   ——"磷石膏" 会排在 "正极材料" 前面（磷 U+78F3 > 正 U+6B63），
//   用户看到的是一列乱序的中文。
//
// 实现（Windows）：
//   调 `shlwapi.dll` 的 `StrCmpLogicalW`（Vista+，shell 一直用着的逻辑比较）：
//   · 中文按**拼音**（磷 lin < 正 zheng ✓）
//   · 数字按**数值**（"文章10" > "文章9" ✓）
//   · 英文不区分大小写
//   —— 这正是 Windows 资源管理器排列表时的行为，用户熟悉。
//
// 其它平台：回退到码位序（不崩即可；真机是 Windows 桌面优先）。
//
// ⚠️ FFI 只在 Windows 可用；Web 端不能调 kernel32 → 用条件导入隔离。

import 'dart:ffi' as ffi;
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;

/// 比较两个字符串：<0 表示 a 在前，>0 表示 b 在前，0 表示相等
int compareLocalized(String a, String b) {
  if (a == b) return 0;
  if (kIsWeb) return a.compareTo(b);
  // ⚠️ 用 **Platform.isWindows** 而不是 `defaultTargetPlatform`：
  //    后者在 `flutter test` 环境里是 android（测试跑在宿主机上），
  //    判成非 Windows 就会静默回退到码位序 —— 排序看着"能跑"但中文是乱序。
  if (Platform.isWindows) {
    final r = _windowsLogicalCompare(a, b);
    if (r != null) return r;
  }
  return a.compareTo(b);
}

// ---------------------------------------------------------------- Windows FFI

typedef _StrCmpLogicalWC = ffi.Int32 Function(ffi.Pointer<ffi.Uint16> s1, ffi.Pointer<ffi.Uint16> s2);
typedef _StrCmpLogicalWD = int Function(ffi.Pointer<ffi.Uint16> s1, ffi.Pointer<ffi.Uint16> s2);

typedef _MallocC = ffi.Pointer<ffi.Void> Function(ffi.IntPtr size, ffi.IntPtr alignment);
typedef _MallocD = ffi.Pointer<ffi.Void> Function(int size, int alignment);
typedef _FreeC = ffi.Void Function(ffi.Pointer<ffi.Void> p);
typedef _FreeD = void Function(ffi.Pointer<ffi.Void> p);

class _WinApi {
  _WinApi(this.cmp, this.malloc, this.free);
  final _StrCmpLogicalWD cmp;
  final _MallocD malloc;
  final _FreeD free;
}

_WinApi? _api;

_WinApi? _loadWinApi() {
  if (_api != null) return _api;
  if (kIsWeb || !Platform.isWindows) return null;
  try {
    final shlwapi = ffi.DynamicLibrary.open('shlwapi.dll');
    final process = ffi.DynamicLibrary.process();
    _api = _WinApi(
      shlwapi.lookupFunction<_StrCmpLogicalWC, _StrCmpLogicalWD>('StrCmpLogicalW'),
      process.lookupFunction<_MallocC, _MallocD>('malloc'),
      process.lookupFunction<_FreeC, _FreeD>('free'),
    );
    return _api;
  } catch (_) {
    return null;
  }
}

int? _windowsLogicalCompare(String a, String b) {
  final api = _loadWinApi();
  if (api == null) return null;
  final pa = _toUtf16(api, a);
  final pb = _toUtf16(api, b);
  try {
    return api.cmp(pa, pb);
  } catch (_) {
    return null;
  } finally {
    api.free(pa.cast<ffi.Void>());
    api.free(pb.cast<ffi.Void>());
  }
}

ffi.Pointer<ffi.Uint16> _toUtf16(_WinApi api, String s) {
  final units = s.codeUnits;
  final p = api.malloc((units.length + 1) * 2, 8).cast<ffi.Uint16>();
  for (var i = 0; i < units.length; i++) {
    p[i] = units[i];
  }
  p[units.length] = 0;
  return p;
}
