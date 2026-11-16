# A09 双链 · 验收证据（2026-11-16）

目标：`@` / `[[` 插入**页面提及**、查看模式点提及跳页、页尾**「引用了本页」反链面板**，
语义对齐 web（`app/src/editor/blocks/pageMention.tsx` + `app/src/data/backlinks.ts` + `Backlinks.tsx`）。

## 一、对齐 web 的三条硬约定

1. **节点形状**：`{"type":"pageMention","props":{"pageId":"…","title":"…"}}`，**没有 `content` 键**
   （web 的 inline spec 是 `content: "none"`），标题只是展示快照，pageId 才是打开依据。
2. **只加不改**：插入提及是往块 `content` 数组末尾追加一个节点，已有 runs 的样式、未知字段、
   `children` 一个字节都不动 —— 与 A06/A07/A08 的「未触碰即保真」同一条红线。
3. **反链口径**（`findBacklinks`）：跳过本页；每个来源页最多一条；嵌套子块里的提及也算；
   snippet = 命中块的纯文本（提及节点以 `@标题` 参与拼字），截前 120 字。

## 二、实现落点

| 文件 | 内容 |
| --- | --- |
| `ui/DocEditor.kt` | `appendMention(path, pageId, title)`：表格/分割线/图片/代码块等拒收（正文不在 content 里的块型） |
| `ui/PageEditor.kt` | `@` / `[[` 触发候选页菜单：行首或空白之后才触发（邮箱里的 `@` 不弹）、关键词 ≤24 字；选中后**先清掉触发符**再插入 |
| `ui/BlockRenderer.kt` | `LocalPageOpener`（CompositionLocal）+ `SpansText`：给提及加 `StringAnnotation("mention", pageId)`，点按按字符偏移命中，命中就跳页 |
| `ui/Backlinks.kt` | `findBacklinks()` 纯 Kotlin 复刻 web 扫描逻辑（可 JVM 单测） |
| `ui/MainScreen.kt` | 正文只读渲染外面包 `LocalPageOpener`；页尾渲染「引用了本页 N」+ 来源页与 snippet，点击跳到来源页 |

## 三、模拟器实测（emulator-5554 / Android 14）

1. 打开「会议记录」→「编辑」→ 光标放到标题块末尾 → 输入 `@`
   → 弹出候选页菜单（截图 `01-提及候选菜单.png`，列出 A08 表格验收 / A03 同步冒烟页 / 项目笔记 /
   设计稿要点 / 会议记录 / 孤儿页 / 8px 标题命中页）
2. 选「@设计稿要点」→ 触发符被清掉，块文本变为 `A07 @设计稿要点`（截图 `02-插入提及后编辑态.png`），
   顶部显示「已自动保存」
3. 点「完成」→ 查看模式里 `@设计稿要点` 以蓝色显示（截图 `03-查看模式-提及可点.png`），
   同一屏底部可见反链面板「引用了本页 1 / 📄 设计稿要点 / 正文含…提及：@会议记录」
   （这条来自 A05 种下的旧数据，说明面板对历史数据同样有效）
4. **点正文里的 `@设计稿要点`** → 直接跳到设计稿要点页（验证点击命中）
5. 在设计稿要点页滚到底 → 反链面板出现新来源「📄 会议记录 / A07 @设计稿要点」
   （截图 `04-反链面板-新增来源.png`），即刚才那次插入被正确反向索引
6. `logcat -s AndroidRuntime:E` 无输出（0 FATAL）

## 四、库内取证（编辑后从设备读 `docs.blocks`，pageId = p-child-2 会议记录）

```json
[{"id":"b39ecfbaa2c25","type":"checkListItem","props":{"checked":false},
  "content":[{"type":"text","text":"NewBlockA06","styles":{}}],"children":[]},
 {"id":"bfc951232eb3a","type":"heading","props":{"level":2},
  "content":[{"type":"text","text":"A07 ","styles":{}},
             {"type":"pageMention","props":{"pageId":"p-child-1","title":"设计稿要点"}}],
  "children":[{"id":"b0","type":"paragraph","props":{},
               "content":[{"type":"text","text":"会议记录：下/周完成块编辑器与附件同A06EDIT步。","styles":{}}],"children":[]}]}]
```

逐条对照：原 `A07 ` run 的文本与 `styles` 未变；新节点正是 web 的 pageMention 形状（**无 content 键**）；
heading 的 `children` 里那段正文也原样健在；`outbox` 有 2 条待推送（走 A06 的 PageSaver 通道）。

## 五、单测

- `BacklinksTest` 7 条：找到来源页与上下文 / 跳过本页 / 嵌套子块命中 / 每页一条 + snippet 120 字截断 /
  坏 JSON 与空正文安全跳过 / 提及别的页不算 / 空标题回退「无标题」
- `DocEditorMentionTest` 5 条：追加保留原文字与样式 + 节点形状（无 content 键）/ 空段落可插 /
  表格·分割线·图片与越界路径拒绝 / 子块路径插入且父块不变 / 插入后块文本含 `@标题`
- 全量 `testDebugUnitTest` **108 条**：A09 新增 12 条全绿

## 六、本轮未覆盖（明说）

- `[[` 与 `@` 走同一条插入路径（没有做「`[[` 才允许反向跳转」的差异化语义）
- 表格单元格里的提及：渲染成蓝色但**不可点**（表格渲染没接 `LocalPageOpener`）
- 反链只扫本机库（跨设备靠同步后自然出现），被提及页面被删后没有「链接已失效」提示
- 点反链条目是「换页」而不是「跳到正文那一块并高亮」（web 侧也仅是打开页；定位高亮留给后续）
