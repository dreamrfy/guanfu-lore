# 采集工具 · flowus-cap

真 FlowUs 的基准采集工具。**所有数值都必须来自这里，不许目测。**

- **版本化源码**：本目录（仓库内，跟着提交走）
- **运行环境**：`E:\dev\tools\flowus-cap\`（node_modules 里有 `playwright-core`，以及浏览器配置目录 `profile/`）
- **产物目录**：`E:\dev\tmp\flowus-cap\capture\<名字>\`；要长期留存的再复制到 `docs/基准/证据/<模块>-<任务>/`

> 为什么分两处：node_modules 和浏览器登录态不进仓库，脚本本身要进仓库（否则换个会话就找不到工具了）。
> 跑的时候用工具区的环境、跑本目录的脚本即可（两者文件名一致，改动后记得同步）。

## 用法

```bash
# 在 E:\dev\tools\flowus-cap 下执行（那里有依赖）
node capture.mjs <名字> [选项]
```

| 选项 | 说明 |
| --- | --- |
| `--url <地址>` | 采集前先导航到这个地址 |
| `--out <目录>` | 输出目录（默认 `E:\dev\tmp\flowus-cap\capture\<名字>`） |
| `--tag <选择器>` | 只采集该选择器子树（默认整个 body） |
| `--full` | 额外输出整页长截图 |
| `--click <文本>` | 采集前点击文本完全匹配的元素 |
| `--scope <选择器>` | `--click` 的搜索范围（默认全页） |
| `--nth <数字>` | `--click` 命中第几个（默认 0） |
| `--wait <毫秒>` | 导航/点击后的等待时间（默认 3000） |
| `--max <数字>` | 最多导出多少元素（默认 1500，超出会标 `truncated`） |
| `--no-text` | 只采几何与样式，**不采任何文字**（`own` / `txt` 一律置空） |
| `--mask <选择器>` | 截图前把该子树文字变透明（**布局分毫不动**），用于截图里不暴露私人内容 |

### 例子

```bash
# 采一屏：点到侧栏第一个「无标题」页面（侧栏项的选择器）
node capture.mjs shell-sample --click "无标题" --scope '[data-test-id="aside-item-toc"]' --nth 0 --full

# 采一屏：只取几何 + 遮字截图（不把页面文字带进仓库）
node capture.mjs frame --click "归档历史材料" --scope '[data-test-id="aside-item-toc"]' --no-text --mask ".main-panel" --full

# 跨视口量布局（响应式规则用这个，别只看一个宽度）
node measure-responsive.mjs

# 挨个点开侧栏页面，报告每页正文长度（用来找空白页）
node find-blank.mjs
```

## 隐私与禁区

- **默认会采集页面文字**（`own` / `txt`）。只要几何就加 `--no-text`；截图不想暴露内容就加 `--mask`。
- 采集禁区：真 FlowUs 的「配置」页面 —— 脚本内置拒绝（退出码 2）。
- 截图里的私人内容**会随证据提交进仓库**。仓库是私有的，但仍建议：能遮就遮（`--mask`）、能不带文字就不带（`--no-text`）。`M0-T01` 的证据是早期未遮字版本，含用户个人笔记正文，如需替换可重采。

## 产物格式

| 文件 | 内容 |
| --- | --- |
| `meta.json` | 页面标题/地址、视口尺寸与 DPR、屏幕尺寸、整页滚动尺寸、元素数、token 数、采集时间 |
| `page.png` | 视口截图 |
| `full.png` | 整页长截图（仅 `--full`） |
| `elements.json` | **核心**。每个可见元素的：DOM 路径、标签、`data-test-id`、role、aria-label、class、文字（`own` 直接文字 / `txt` 含子节点）、矩形（x/y/w/h）、以及计算样式（字体族/字号/字重/行高/字距/颜色/背景/内外边距/圆角/边框/display/position/gap/overflow/阴影/不透明度/z-index） |
| `tokens.json` | CSS 自定义属性（`--xxx`）的声明数与解析值 |
| `fonts.json` | 页面里 `@font-face` 的字体清单与加载状态 |
| `scrollbars.json` | 文档与各滚动容器的 `offsetWidth / clientWidth / scrollHeight` 及 `scrollbarW`（据此判断滚动条是否占布局宽度） |

## 硬约束

1. **采集禁区**：脚本内置拦截 —— 真 FlowUs 的「配置」页面（`c579c282-…` / 标题为「配置」）**直接拒绝采集并退出码 2**。要采别的页面，先 `--url` 或 `--click` 切走。
2. 采前先确认通道活着：`curl -s --max-time 5 http://127.0.0.1:9222/json/version`；没反应就 `cmd //c browser.cmd`。
3. 登录态在独立配置目录里（30 天有效）。**停在登录页时不要自己点登录**，需要用户给验证码。
4. 用完不要硬杀进程，用 `node close-browser.mjs` 优雅关闭（保证 cookie 落盘）。

## 已知限制（实测发现，写规格时要避开）

- **CSS 自定义属性很少**：实测首页只有 3 个（`--loadingIcon` 等，都是图标 URL）。FlowUs 的配色体系是**编译进 Tailwind 工具类**的（`bg-aside`、`text-t1`、`border-grey7`…），所以 **调色板要靠 `elements.json` 里「class + 计算样式」反推**，不能指望 `tokens.json`。
- `txt` 会被截断到 80 字；要看全文得看该元素的子节点或 `own`。
- 只统计**可见**元素（`display:none`、`visibility:hidden`、零尺寸会跳过）。要看隐藏态得先让它显示出来再采。
- 视口尺寸取决于窗口大小，采集时窗口是多大就是多大（实测最大化的窗口是 1920×945，DPR 1）。
