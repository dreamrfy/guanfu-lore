// 生成 client/lib/design/flowus_icons.dart（M1-T12）
//
// 数据源：docs/基准/图标/icons-manifest.json（实采图标清单）
// 用法：node tools/gen-flowus-icons.cjs
//
// 为什么这个脚本要**进仓库**（2026-11-10 审阅时发现）：
//   任务表 M1-T12/T14 写着「flowus_icons.dart 由 icons-manifest.json 生成」，
//   但生成器原来只躺在 E:\dev\tools\ 里、还硬编码了绝对路径 —— 换机器就生成不出来，
//   manifest 与常量表一旦对不上就没人发现（当时就漏登记了 IcCheckboxCheck）。
//   现在脚本进仓库 + 用相对路径，任何人都能重跑并复核一致性。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'docs', '基准', '图标', 'icons-manifest.json');
const OUT = path.join(ROOT, 'client', 'lib', 'design', 'flowus_icons.dart');

const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const icons = m.icons.slice().sort((a, b) => a.name.localeCompare(b.name));

const reserved = new Set([
  'abstract', 'as', 'assert', 'async', 'await', 'break', 'case', 'catch', 'class', 'const',
  'continue', 'covariant', 'default', 'deferred', 'do', 'dynamic', 'else', 'enum', 'export',
  'extends', 'extension', 'external', 'factory', 'false', 'final', 'finally', 'for', 'function',
  'get', 'hide', 'if', 'implements', 'import', 'in', 'interface', 'is', 'late', 'library', 'mixin',
  'new', 'null', 'on', 'operator', 'part', 'required', 'rethrow', 'return', 'sealed', 'set', 'show',
  'static', 'super', 'switch', 'sync', 'this', 'throw', 'true', 'try', 'typedef', 'var', 'void',
  'when', 'while', 'with', 'yield',
]);

function ident(name) {
  // IcAdd → add；IcArrowDown01 → arrowDown01
  // Lucide 那几个（Search / Store / Undo2 …）加 lu 前缀——FlowUs 自己同时有 Lucide Search 和 IcSearch，
  // 不加前缀会撞名（生成器第一次就是这么炸的）
  if (!name.startsWith('Ic')) {
    const id = 'lu' + name;
    return reserved.has(id) ? id + 'Icon' : id;
  }
  let base = name.slice(2);
  let id = base.charAt(0).toLowerCase() + base.slice(1);
  if (reserved.has(id)) id += 'Icon';
  return id;
}

const seen = new Map();
for (const i of icons) {
  const id = ident(i.name);
  if (seen.has(id)) throw new Error('标识符冲突: ' + id + ' ← ' + i.name + ' / ' + seen.get(id));
  seen.set(id, i.name);
}

// 资产目录里的每个 svg 都必须在清单里（反之亦然）——否则就是"取不到的图标 = 空白圈"
const assetDir = path.join(ROOT, 'client', 'assets', 'icons');
const assets = fs.readdirSync(assetDir).filter((f) => f.endsWith('.svg')).map((f) => path.basename(f, '.svg'));
const listed = icons.map((i) => i.name);
const missingAsset = listed.filter((n) => !assets.includes(n));
const unlistedAsset = assets.filter((n) => !listed.includes(n));
if (missingAsset.length) throw new Error('清单里有、资产目录里没有：' + missingAsset.join(', '));
if (unlistedAsset.length) throw new Error('资产目录里有、清单里没登记：' + unlistedAsset.join(', '));

const lucide = icons.filter((i) => !i.name.startsWith('Ic'));

const lines = [];
lines.push('// 真 FlowUs 的图标（M1-T12）——**由 docs/基准/图标/icons-manifest.json 自动生成，不要手改名字**。');
lines.push('//');
lines.push(`// 来源：M0-T15 从真 FlowUs 的 [data-icon] 属性收割 57 个 + M0-T18 从数据库界面补 35 个，`);
lines.push(`// 共 ${icons.length} 个；SVG 原文已随仓库放在 \`client/assets/icons/\`（pubspec 已登记），统一用 flutter_svg 渲染。`);
lines.push('//');
lines.push('// 重新生成：`node tools/gen-flowus-icons.cjs`（脚本会核对清单与资产目录一一对应，对不上就报错）');
lines.push('//');
lines.push('// 两个坑：');
lines.push('//   1. 这套图标**混了两家**：FlowUs 自研 Ic* 是**填充式**（viewBox 20×20，靠 fill-current 上色）；');
lines.push(`//      Lucide 那 ${lucide.length} 个是**描边式**（viewBox 24×24，stroke=currentColor）。`);
lines.push('//      两家用同一个 ColorFilter(srcIn) 上色都能对，但**不要**把描边图标当填充图标改 viewBox。');
lines.push('//   2. 渲染尺寸是**按位置定的**（16 与 20 是主力），');
lines.push('//      所以这里不把尺寸写死，由调用方传（默认 16）。');
lines.push('');
lines.push("import 'package:flutter/material.dart';");
lines.push("import 'package:flutter_svg/flutter_svg.dart';");
lines.push('');
lines.push('/// 图标文件名常量（= assets/icons/ 下的文件名，不含扩展名）');
lines.push('abstract final class FlowUsIc {');
for (const i of icons) {
  const id = ident(i.name);
  lines.push(`  static const String ${id} = '${i.name}';`);
}
lines.push('');
lines.push(`  /// 全部图标名（${icons.length} 个，按名字排序）`);
lines.push('  static const List<String> all = [');
for (const i of icons) lines.push(`    '${i.name}',`);
lines.push('  ];');
lines.push('}');
lines.push('');
lines.push('/// 渲染一个真 FlowUs 图标');
lines.push('///');
lines.push('/// - [name] 用 [FlowUsIc] 里的常量，别手写字符串（少一个字母就是一个空白圈）');
lines.push('/// - [size] 实测值：16（29 个）/ 20（25 个）/ 12（2 个）/ 14（1 个）');
lines.push('/// - [color] 用 ColorFilter(srcIn) 上色，填充式与描边式都适用');
lines.push('class FlowUsSvgIcon extends StatelessWidget {');
lines.push('  const FlowUsSvgIcon(this.name, {super.key, this.size = 16, this.color, this.tint = true});');
lines.push('');
lines.push('  final String name;');
lines.push('  final double size;');
lines.push('  final Color? color;');
lines.push('');
lines.push('  /// 是否用单色覆盖（默认 true）。**自带多色/渐变的图标必须传 false**——');
lines.push('  /// ColorFilter(srcIn) 会把渐变压成一个纯色（AI 渐变圆脸就是这么变成蓝圆片的）');
lines.push('  final bool tint;');
lines.push('');
lines.push('  @override');
lines.push('  Widget build(BuildContext context) {');
lines.push('    // 不给 color 时**跟随外层 IconTheme**（和 Material Icon 的行为一致）——');
lines.push('    // 否则 SVG 会用自身的 currentColor/黑色，在浅色侧栏里显得又黑又粗（M1-T13 并排对照时发现的）');
lines.push('    final effective = tint ? (color ?? IconTheme.of(context).color) : null;');
lines.push('    return SvgPicture.asset(');
lines.push("      'assets/icons/\$name.svg',");
lines.push('      width: size,');
lines.push('      height: size,');
lines.push('      colorFilter: effective == null ? null : ColorFilter.mode(effective, BlendMode.srcIn),');
lines.push('      // 图标就是图标：不让它跟随系统字体缩放变形');
lines.push('      allowDrawingOutsideViewBox: true,');
lines.push('    );');
lines.push('  }');
lines.push('}');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'));
console.log('已生成', OUT, '| 图标数', icons.length, '| Lucide', lucide.map((i) => i.name).join(','));
