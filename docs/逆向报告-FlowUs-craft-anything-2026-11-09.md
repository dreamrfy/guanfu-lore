# Investigation report

**Question:** FlowUs 的技术形态（框架/打包/编辑器内核）与交互实现（侧栏新建、空页类型选择、斜杠菜单、块菜单、多维表）在代码层是如何组织的？

**Purpose:** interoperability——为 Flutter 知识库 App 按真实行业惯例重做交互提供依据

**Done when:** 产出 FlowUs 技术形态与交互实现证据报告，并与实拍分析逐项对照

## What we looked at

- FlowUs (A folder)
- D:\软件\常用软件类\笔记\FlowUs（Electron 壳）
- https://flowus.cn/ 的 Web 包（flowus-4fed8556.js / tiptap-6b16f5c1.js / index-3eda9002.js）

## What we found

### FlowUs Windows 客户端是 Electron 应用：主进程 out/main/index.js、preload out/preload/index.js、渲染层为单一大包 out/renderer/assets/index-O3Ch5CaT.js；渲染层用 React + Radix UI 原语（Dialog/DropdownMenu/DismissableLayer）+ @dnd-kit 拖拽库；主页指向 https://flowus.cn/。

- **Confidence:** Seen it (observed)
- **Evidence:**
  - `ev_7f96850d64baa0220af5afa8c170138ebb398e36d82e5a4c6e1c16e86a80de22` — Electron app app.asar 2.1.1: 5 source files, 26 IPC channel(s) (13 paired), 1 window(s), 0 endpoint(s), 0 route(s). (path=D:\软件\常用软件类\笔记\FlowUs\resources\app.asar, module=out/main/index.js (main))

### FlowUs Windows 客户端是薄壳设计：本地渲染包仅 830KB 且不含任何界面文案（实测「待办列表」「按回车开始编辑」「基础块」「多维表」均为 0 命中），配合 webview-preload.js 与 8 处 webview 引用，证实编辑器与主界面由 webview 远程加载 https://flowus.cn/ 提供——静态分析桌面端只能拿到外壳（标签页/下载/设置），交互实现只能在网页代码或安卓端找。

- **Confidence:** Seen it (observed)
- **Evidence:**
  - `ev_5fbaa943391dfe936f7beb9d3acef76ed8a3abfd0e8631026aade31430e3e1e2` — Extracted 4699 files (115577539 bytes) from app.asar into C:\Users\12589\AppData\Local\Temp\craft-anything-extract-a9441bce3b18de49. (path=C:\Users\12589\AppData\Local\Temp\craft-anything-extract-a9441bce3b18de49 (output folder))

### FlowUs 编辑器内核是 Tiptap（基于 ProseMirror）：首页 HTML 加载 assets/tiptap-6b16f5c1.js（含 22 处 tiptap、4 处 prosemirror 标识），主包 index-3eda9002.js 中 56 处引用 tiptap——即 FlowUs 也是「成熟开源编辑器内核 + 自写块扩展/UI 层」架构，不是手写编辑器引擎。

- **Confidence:** Seen it (observed)
- **Evidence:**
  - `ev_643861b407d3c3da771dde627d030aa9f458e4711d322ad8b024085e5738de1b` — Recovered 3 input(s) into E:\dev\tmp\flowus-web\restored: 3 pretty-printed, 0 bundle module file(s), 0 original source(s) from maps. (path=E:\dev\tmp\flowus-web\restored)

### 斜杠菜单分组与项清单（i18n menu_list）确认：六大组「基础块/媒体/嵌入/行内元素/布局/高级块」；基础块含 标题1-4、简单表格、项目/编号/折叠列表、分割线、引述文字、着重文字、代码片段、数学公式、思维导图、折叠标题1-4；媒体 图片/网页书签/视频/音频/文件/文件夹；嵌入 网页/文件/文件夹；行内元素 日期/引用页面/页面/公式/成员/Emoji；布局 左/右分栏与 2-5 列分栏；高级块 模板/同步块/广告块/数据图表；另有多维表族（表格/看板/画廊/目录/时间轴/收集表/日历 嵌入版 + 页面版）与引用多维表。

- **Confidence:** Seen it (observed)
- **Evidence:**
  - `ev_643861b407d3c3da771dde627d030aa9f458e4711d322ad8b024085e5738de1b` — Recovered 3 input(s) into E:\dev\tmp\flowus-web\restored: 3 pretty-printed, 0 bundle module file(s), 0 original source(s) from maps. (path=E:\dev\tmp\flowus-web\restored)

### 空页面结构（page_placeholder 文案）：提示行 =「按回车开始编辑」+「，或从下方选择页面类型」，另有「AI 写作」「模板」「，或从下方选择模板应用」——空页是「提示行 + 页面类型选择器」而非弹窗；块右键菜单文案（editor.menu）：添加块/创建副本/复制并移动到页面/转换为多维表/转换为简单表格/复制块链接/在上方插入/在下方插入/在右侧添加分栏/搜索并复制到页面。

- **Confidence:** Seen it (observed)
- **Evidence:**
  - `ev_643861b407d3c3da771dde627d030aa9f458e4711d322ad8b024085e5738de1b` — Recovered 3 input(s) into E:\dev\tmp\flowus-web\restored: 3 pretty-printed, 0 bundle module file(s), 0 original source(s) from maps. (path=E:\dev\tmp\flowus-web\restored)

### 侧栏新建入口文案（drive 组）：新建页面 / 新建多维表 / 新建文件夹 / 新建思维导图 / 上传文件夹——即悬停「+」弹出的菜单包含这五项，与实拍一致；另存在设置项「新建页面使用右侧面板」「新建页面宽度/字体及布局」等偏好设置。

- **Confidence:** Seen it (observed)
- **Evidence:**
  - `ev_643861b407d3c3da771dde627d030aa9f458e4711d322ad8b024085e5738de1b` — Recovered 3 input(s) into E:\dev\tmp\flowus-web\restored: 3 pretty-printed, 0 bundle module file(s), 0 original source(s) from maps. (path=E:\dev\tmp\flowus-web\restored)

## Open questions

_None outstanding._

## How this was done

- **Mode:** Deep (the original's code and files could be read)
- **Engines:** builtin
- **Limitations:**
  - 62 IPC call(s) use a channel name computed at run time; they are not in the channel map.
  - Archives inside the archive are written as files, not unpacked; run core_archive_extract on them.
  - Disk images (DMG), installers (PKG/MSI) and compressed tarballs are listed as single files, not opened.
  - Only rewrites that provably keep meaning are applied; local variable names stay minified.
  - Rollup/Vite production chunks merge modules into one scope; they are pretty-printed but not split.
  - Static reading only: code built at run time (eval, computed requires, remote content) is invisible; IPC pairs need literal channel names.

## Evidence ledger

- `ev_2f840f18b96ed1e851b056b25dddbbb9258d4f5268201bb7b80a7f52a4786b00` **core_archive_show** — app.asar (asar) holds 4699 files in 4971 entries; 0 nested container(s). (Seen it)
- `ev_7f96850d64baa0220af5afa8c170138ebb398e36d82e5a4c6e1c16e86a80de22` **js_app_map** — Electron app app.asar 2.1.1: 5 source files, 26 IPC channel(s) (13 paired), 1 window(s), 0 endpoint(s), 0 route(s). (Worked it out)
- `ev_5fbaa943391dfe936f7beb9d3acef76ed8a3abfd0e8631026aade31430e3e1e2` **core_archive_extract** — Extracted 4699 files (115577539 bytes) from app.asar into C:\Users\12589\AppData\Local\Temp\craft-anything-extract-a9441bce3b18de49. (Seen it)
- `ev_643861b407d3c3da771dde627d030aa9f458e4711d322ad8b024085e5738de1b` **js_sources_restore** — Recovered 3 input(s) into E:\dev\tmp\flowus-web\restored: 3 pretty-printed, 0 bundle module file(s), 0 original source(s) from maps. (Worked it out)

