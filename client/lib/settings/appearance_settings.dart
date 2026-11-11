// 外观设置的运行时加载与保存（M12-T02 / M12-T03）
//
// 职责：
//   · 启动时从 `app_settings` 读上次选的字体/图标主题，应用上去
//   · 用户切换时：改全局状态 + 立刻落库（重开还在）
//
// ⚠️ 与 M2R 的"壳子"教训对照：这里每个动作都**真的改**：
//   字体 → 改全局字体栈（所有 TextStyle 都跟着变）
//   图标 → 改全局图标主题（所有 FlowUsSvgIcon 都跟着换资产路径）
//   两者都写进 `app_settings`，不是内存变量。

import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

import '../data/database.dart';
import '../design/font_themes.dart';
import '../design/icon_themes.dart';
import '../design/tokens.dart';

/// 外观设置（字体 + 图标）
class AppearanceSettings {
  const AppearanceSettings({required this.font, required this.icon});

  final FontTheme font;
  final IconThemeSet icon;
}

/// 从库里读外观设置并应用
Future<AppearanceSettings> loadAppearance(AppDatabase db) async {
  final fontId = await db.settingValue(kFontSettingKey);
  final iconId = await db.settingValue(kIconSettingKey);

  final font = FontThemes.byId(fontId);
  final icon = IconThemeSets.byId(iconId);

  // 应用（改全局状态）
  FlowUsTypography.fontFamily = font.stack;
  setIconTheme(icon);

  // ⚠️ 映射表**异步**加载，不在启动路径里 await：
  //   `rootBundle.loadString` 在 `flutter test` 里会挂起（等 asset bundle），
  //   await 它会把整个启动流程卡死 → 草稿恢复横幅之类的都出不来。
  //   映射表只是"少数图标改名"的优化，先用同名直取（绝大多数情况也对）。
  unawaited(_loadNameMapLater());

  return AppearanceSettings(font: font, icon: icon);
}

/// 换字体主题并落库
Future<void> saveFontTheme(AppDatabase db, FontTheme theme) async {
  FlowUsTypography.fontFamily = theme.stack;
  await db.setSettingValue(kFontSettingKey, theme.id);
}

/// 换图标主题并落库
Future<void> saveIconTheme(AppDatabase db, IconThemeSet theme) async {
  setIconTheme(theme);
  await db.setSettingValue(kIconSettingKey, theme.id);
}

/// 后台加载映射表（失败就退回"同名直取"）
Future<void> _loadNameMapLater() async {
  try {
    currentIconNameMap = await loadIconNameMap();
  } catch (_) {
    currentIconNameMap = IconNameMap.empty;
  }
}

/// 加载图标名映射表（`client/assets/icons/icon-map.json`）。
///
/// 加载失败不致命 —— 退回"同名直取"，绝大多数情况也对。
Future<IconNameMap> loadIconNameMap() async {
  try {
    final raw = await rootBundle.loadString('assets/icons/icon-map.json');
    final json = jsonDecode(raw);
    if (json is! Map) return IconNameMap.empty;
    final map = <String, Map<String, String>>{};
    json.forEach((k, v) {
      if (v is Map) {
        map['$k'] = {
          for (final e in v.entries) '${e.key}': '${e.value}',
        };
      }
    });
    return IconNameMap(map);
  } catch (e) {
    return IconNameMap.empty;
  }
}
