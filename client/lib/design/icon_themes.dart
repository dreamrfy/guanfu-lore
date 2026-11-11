// 图标主题（M12-T03）：把"写死的一套图标"变成"可切换的图标组"
//
// 用户 2026-11-11：「字体和图标能不能和其他的软件一样，搞成字体包、图标组？
// 系统默认一套风格，然后内置几个其他不同风格，用户喜欢什么自己切换？」
//
// 三档（用户 11-11 已拍板）：
//   · 填充·明快 = **MingCute**（Apache-2.0，2263 个填充式，24×24）
//   · 描边·清爽 = **Lucide**（ISC，描边式）
//   · 双色·沉稳 = **Phosphor duotone**（MIT）
//   · （过渡档）FlowUs 自研 96 个 —— **授权已弃用**，只作对照，要逐步撤下
//
// 关键设计：**渲染管线不变**
//   三个库的 SVG 都是 `fill="currentColor"` 或 `stroke="currentColor"`，
//   所以现有的 `SvgPicture.asset` + `ColorFilter.mode(srcIn)` 不用改一行，
//   只是**换个资产路径**。
//
// ⚠️ 网格差异：MingCute/Lucide 是 24×24，FlowUs 自研是 20×20，
//    Phosphor fill 是 256×256（缩放后无影响）→ 尺寸由调用方传，不用改。

/// 一套图标主题
class IconThemeSet {
  const IconThemeSet({
    required this.id,
    required this.label,
    required this.note,
    required this.dir,
    this.deprecated = false,
  });

  /// 存储用的 id（写进 app_settings）
  final String id;

  /// 设置页显示的名字
  final String label;

  /// 一句话说明
  final String note;

  /// 资产目录名（`assets/icons/<dir>/<名字>.svg`）
  final String dir;

  /// 是否是**授权已弃用**的（FlowUs 自研）—— UI 上要标出来
  final bool deprecated;

  /// 完整资产路径
  String assetPath(String name) => 'assets/icons/$dir/$name.svg';
}

/// 内置图标主题表
abstract final class IconThemeSets {
  /// 填充·明快（MingCute，Apache-2.0）—— 默认档
  static const IconThemeSet mingcute = IconThemeSet(
    id: 'mingcute',
    label: '填充·明快（MingCute）',
    note: 'Apache-2.0 · 2263 个填充图标 · 24×24',
    dir: 'mingcute',
  );

  /// 描边·清爽（Lucide，ISC）
  static const IconThemeSet lucide = IconThemeSet(
    id: 'lucide',
    label: '描边·清爽（Lucide）',
    note: 'ISC · 轻量描边风 · 24×24',
    dir: 'lucide',
  );

  /// 双色·沉稳（Phosphor duotone，MIT）
  static const IconThemeSet phosphor = IconThemeSet(
    id: 'phosphor',
    label: '双色·沉稳（Phosphor）',
    note: 'MIT · 与 FlowUs 观感差异最大 · 可商用免署名',
    dir: 'phosphor',
  );

  /// FlowUs 自研（**授权已弃用**，仅作对照/过渡）
  static const IconThemeSet flowusLegacy = IconThemeSet(
    id: 'flowus-legacy',
    label: '原版（FlowUs 自研）',
    note: '⚠️ 授权已弃用，仅作对照，不建议长期使用',
    dir: 'legacy',
    deprecated: true,
  );

  /// 全部主题（设置页按这个顺序显示）
  static const List<IconThemeSet> all = [mingcute, lucide, phosphor, flowusLegacy];

  /// 按 id 找主题；找不到返回默认（mingcute）
  static IconThemeSet byId(String? id) {
    if (id == null) return mingcute;
    for (final t in all) {
      if (t.id == id) return t;
    }
    return mingcute;
  }
}

/// 应用设置里存图标选择的键
const String kIconSettingKey = 'appearance.icon';

/// 图标名 → 各主题下的实际文件名。
///
/// ⚠️ 绝大多数图标**同名**（因为我们按语义命名的），只有少数需要映射
///    —— 映射表在 `client/assets/icons/icon-map.json`（由 tools 脚本生成）。
///
/// 为什么需要映射表：三个库的命名习惯不完全一致
///   （例：删除 → MingCute `delete.svg` / Phosphor `trash.svg` / Lucide `trash-2.svg`）。
class IconNameMap {
  const IconNameMap(this.map);

  /// 图标名 → {主题id: 目标文件名}
  final Map<String, Map<String, String>> map;

  /// 取某主题下的实际文件名；没有映射就用原名（同名最常见）
  String resolve(String iconName, String themeId) {
    final per = map[iconName];
    if (per == null) return iconName;
    return per[themeId] ?? iconName;
  }

  static const IconNameMap empty = IconNameMap({});
}

// ---------------------------------------------------------------------------
// 全局当前主题（M12-T03）
// ---------------------------------------------------------------------------

/// **当前生效的图标主题**（全局；启动时按设置读入，切换时改写）。
///
/// 为什么用全局变量而不是层层往下传：
///   图标出现在界面的各个角落（侧栏、菜单、工具条…），层层传参会污染所有 API。
///   主题本来就是"整个 App 的外观设置"，全局更合适。
IconThemeSet currentIconTheme = IconThemeSets.mingcute;

/// **当前生效的图标名映射表**（各主题下的实际文件名）。
///
/// 由 `client/assets/icons/icon-map.json` 在启动时加载；
/// 加载失败时用 [IconNameMap.empty]（同名直取，多数情况也对）。
IconNameMap currentIconNameMap = IconNameMap.empty;

/// 设置当前图标主题（切换时调）
void setIconTheme(IconThemeSet theme, {IconNameMap? nameMap}) {
  currentIconTheme = theme;
  if (nameMap != null) currentIconNameMap = nameMap;
}
