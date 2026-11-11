// 字体主题（M12-T02）：把"写死的字体栈"变成"可切换的字体包"
//
// 用户 2026-11-11 的要求：
//   「字体和图标能不能和其他的软件一样，搞成字体包？系统默认一套风格，
//   然后内置几个其他不同风格，用户喜欢什么自己切换？」
//
// 所以这里不是"换一套字体"，而是**一套可切换的字体主题**：
//   · 每套主题 = 一个 family 名 + 中文名 + 说明
//   · 选择存 `app_settings`（键 `appearance.font`）
//   · 切换后**全 App 立刻生效**（改全局字体栈 + ThemeData 的 fontFamily）
//
// 为什么每套都要**打包静态字重**（M12-T02 实测结论）：
//   Flutter 对可变字体（VF）的 `fontWeight` **无效** —— w400/w500/w600/w700
//   渲染出来粗细一模一样（w700 只是被横向拉宽的变形）。
//   证据：docs/基准/证据/M12-T01/可变字体vs静态字重对比.png
//   → 内置字体的每一档都必须打包成静态实例。
//
// ⚠️ 系统字体的"假粗体"：微软雅黑没有 500 档，Flutter 会合成假粗体（发虚）。
//   Noto Sans SC 有真 wght → 观感更干净。这也是把 Noto 作为默认档的原因。

/// 系统兜底字体链（**不含任何 FlowUs 私有字体**）。
///
/// 原栈是 `my-quote, PingFang SC, Microsoft YaHei, ...`，
/// my-quote 是 FlowUs 私有字体、且我们从未打包过它 → 去掉。
const String kSystemFontStack =
    '"PingFang SC", "Microsoft YaHei", "Segoe UI", "Helvetica Neue", '
    'Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"';

/// 一套字体主题
class FontTheme {
  const FontTheme({
    required this.id,
    required this.label,
    required this.family,
    required this.note,
    this.bundled = false,
  });

  /// 存储用的 id（写进 app_settings）
  final String id;

  /// 设置页显示的名字
  final String label;

  /// Flutter 的 fontFamily（**空串 = 纯系统栈**）
  final String family;

  /// 一句话说明（设置页里给用户看）
  final String note;

  /// 是否是我们打包进来的（系统字体为 false）
  final bool bundled;

  /// 完整字体栈：主题字体优先，后面接系统兜底
  String get stack => family.isEmpty ? kSystemFontStack : '"$family", $kSystemFontStack';
}

/// 内置字体主题表
///
/// 顺序 = 设置页里的显示顺序。
/// **不要**在这里加 FlowUs 的私有字体（my-quote 等）。
abstract final class FontThemes {
  /// 默认档：Noto Sans SC（Google 开源 OFL，打包在客户端里）
  ///
  /// 选它做默认的理由：
  ///   · 中文覆盖完整（30445 字形，比微软雅黑还多；子集后含 GB2312 全集 6763 汉字）
  ///   · **有真字重**（w400/w500/w600），不会出现雅黑的"假粗体"发虚
  ///   · 跨机器一致（不依赖系统装没装）
  static const FontTheme notoSansSc = FontTheme(
    id: 'noto-sans-sc',
    label: '思源黑体（Noto Sans SC）',
    family: 'NotoSansSC',
    note: '开源 OFL · 真字重不糊 · 各机器一致（推荐）',
    bundled: true,
  );

  /// 系统默认：微软雅黑（= FlowUs 在 Windows 上的实际观感）
  static const FontTheme systemYaHei = FontTheme(
    id: 'system-yahei',
    label: '系统默认（微软雅黑）',
    family: '',
    note: '不打包任何字体 · 与 FlowUs 在 Windows 上观感一致',
  );

  /// 系统等线：比雅黑更轻
  static const FontTheme systemDengXian = FontTheme(
    id: 'system-dengxian',
    label: '等线（DengXian）',
    family: 'DengXian',
    note: 'Windows 自带 · 比雅黑更轻',
  );

  /// 系统楷体：手写感
  static const FontTheme systemKaiTi = FontTheme(
    id: 'system-kaiti',
    label: '楷体（KaiTi）',
    family: 'KaiTi',
    note: 'Windows 自带 · 手写风格',
  );

  /// 系统宋体：阅读长文舒服
  static const FontTheme systemSimSun = FontTheme(
    id: 'system-simsun',
    label: '宋体（SimSun）',
    family: 'SimSun',
    note: 'Windows 自带 · 长文阅读舒服',
  );

  /// 霞鹜文楷（若系统装了）：开源 OFL 的楷体
  static const FontTheme lxgwWenKai = FontTheme(
    id: 'lxgw-wenkai',
    label: '霞鹜文楷（LXGW WenKai）',
    family: 'LXGW WenKai',
    note: '开源 OFL · 需系统已安装该字体',
  );

  /// 全部主题（设置页按这个顺序显示）
  static const List<FontTheme> all = [
    notoSansSc,
    systemYaHei,
    systemDengXian,
    systemKaiTi,
    systemSimSun,
    lxgwWenKai,
  ];

  /// 按 id 找主题；找不到返回默认（notoSansSc）
  static FontTheme byId(String? id) {
    if (id == null) return notoSansSc;
    for (final t in all) {
      if (t.id == id) return t;
    }
    return notoSansSc;
  }
}

/// 应用设置里存字体选择的键
const String kFontSettingKey = 'appearance.font';
