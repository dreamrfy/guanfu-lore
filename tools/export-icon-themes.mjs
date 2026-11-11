// 导出图标主题资产（M12-T03）
//
// 用途：把三个开源图标库的 SVG 导出到 `client/assets/icons/<主题>/`，并生成名字映射表。
//
// 为什么需要这个脚本（而不是直接引 pub 包）：
//   · 我们已经有现成的渲染管线（`SvgPicture.asset` + `ColorFilter.mode(srcIn)`），
//     换成 SVG 文件**不用改任何渲染代码**；
//   · 纯本地资源，不依赖运行时网络；
//   · 一个图标主题一个目录，用户切换时只是换资产路径。
//
// 用法：
//   node tools/export-icon-themes.mjs [--map <映射表.json>] [--src <素材根目录>]
//
// 默认素材根目录：E:/dev/tmp/icon-research/ext
//   · mingcute/mingcute-icons-main/packages/svg/core-filled/*.svg
//   · phosphor/core-main/assets/{fill,duotone}/*.svg
//   · lucide/lucide-main/icons/*.svg
//
// 映射表（可选）：`tools/icon-map.json`，格式
//   { "IcAdd": { "mingcute": "add.svg", "phosphor": "plus.svg", "lucide": "plus.svg" } }
//   缺省时**同名直取**（三个库的命名大部分一致）。

import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const OUT_ICONS = path.join(REPO, 'client', 'assets', 'icons');

const args = process.argv.slice(2);
function argOf(name, dflt) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}
const SRC_ROOT = argOf('--src', 'E:/dev/tmp/icon-research/ext');
const MAP_FILE = path.join(REPO, 'tools', 'icon-map.json');

/** 三个主题的（源目录, 目标目录名） */
const THEMES = [
  {
    id: 'mingcute',
    src: path.join(SRC_ROOT, 'mingcute/mingcute-icons-main/packages/svg/core-filled'),
    note: 'Apache-2.0',
  },
  {
    id: 'phosphor',
    // 用 fill 风格（填充式，接近原自研图标观感）
    src: path.join(SRC_ROOT, 'phosphor/core-main/assets/fill'),
    note: 'MIT',
  },
  {
    id: 'lucide',
    src: path.join(SRC_ROOT, 'lucide/lucide-main/icons'),
    note: 'ISC',
  },
];

// 现有清单（决定要导出哪些图标）
const MANIFEST = path.join(REPO, 'docs', '基准', '图标', 'icons-manifest.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const wanted = manifest.icons.map((i) => i.name);

console.log('要导出的图标数:', wanted.length);

// 读映射表（可选）
let map = {};
if (fs.existsSync(MAP_FILE)) {
  map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
  console.log('映射表条目:', Object.keys(map).length);
} else {
  console.log('没有映射表 → 同名直取');
}

// 现有 legacy 目录（FlowUs 自研）→ 移到 legacy/ 子目录
const legacyDir = path.join(OUT_ICONS, 'legacy');
if (!fs.existsSync(legacyDir)) {
  const loose = fs
    .readdirSync(OUT_ICONS)
    .filter((f) => f.endsWith('.svg'))
    .map((f) => path.join(OUT_ICONS, f));
  if (loose.length) {
    fs.mkdirSync(legacyDir, { recursive: true });
    for (const f of loose) {
      fs.renameSync(f, path.join(legacyDir, path.basename(f)));
    }
    console.log('原自研图标已移到 legacy/（', loose.length, '个）');
  }
}

const resolvedMap = {};
const missing = [];

for (const theme of THEMES) {
  if (!fs.existsSync(theme.src)) {
    console.error('! 源目录不存在，跳过:', theme.src);
    continue;
  }
  const destDir = path.join(OUT_ICONS, theme.id);
  fs.mkdirSync(destDir, { recursive: true });

  const available = new Set(fs.readdirSync(theme.src).filter((f) => f.endsWith('.svg')));
  let copied = 0;

  for (const name of wanted) {
    const mapped = map[name];
    const fileName = mapped
      ? mapped[theme.id] || `${name}.svg`
      : `${name}.svg`;
    const src = path.join(theme.src, fileName);

    if (!available.has(fileName)) {
      missing.push(`${theme.id}/${name} ← ${fileName}`);
      continue;
    }
    // ⚠️ **不要加 pointer-events="none"**（试过，会让整段 SVG 不渲染 —— 图标直接消失）。
    //
    // ⚠️ 必须把 `currentColor` 换成真实颜色：
    //    开源库（MingCute/Phosphor/Lucide）的 SVG 用 `fill="currentColor"` / `stroke="currentColor"`，
    //    这是**浏览器 CSS 语义**；flutter_svg 不解析 CSS class，解析到 currentColor 时
    //    没有颜色上下文 → 路径透明 → **图标看不见**（实测侧栏/工具条图标全空）。
    //    我们靠 ColorFilter(srcIn) 上色，所以这里给一个纯黑占位色即可（会被 ColorFilter 覆盖）。
    let svg = fs.readFileSync(src, 'utf8');
    svg = svg.replace(/currentColor/g, '#000000');
    fs.writeFileSync(path.join(destDir, `${name}.svg`), svg, 'utf8');
    copied++;
    if (mapped && mapped[theme.id] !== `${name}.svg`) {
      (resolvedMap[name] ??= {})[theme.id] = fileName;
    }
  }
  console.log(`  ${theme.id}: 导出 ${copied}/${wanted.length}（${theme.note}）`);
}

// 写映射表到客户端（运行时按它找文件）
const clientMap = path.join(OUT_ICONS, 'icon-map.json');
fs.writeFileSync(clientMap, JSON.stringify(resolvedMap, null, 2), 'utf8');
console.log('映射表已写:', clientMap, `(${Object.keys(resolvedMap).length} 条需要改名)`);

if (missing.length) {
  console.log('\n缺映射的图标（' + missing.length + ' 个）:');
  for (const m of missing.slice(0, 40)) console.log('  -', m);
  if (missing.length > 40) console.log(`  ... 还有 ${missing.length - 40} 个`);
}
