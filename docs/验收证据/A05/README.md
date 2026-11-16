# A05 验收证据 · 页面查看器（块渲染只读）

日期：2026-11-16 ｜ 执行：主会话 ｜ 设备：模拟器 `emulator-5554`（Android 14 / API 34）
APK：`android-shell/app/build/outputs/apk/debug/app-debug.apk`（11:3x 版）

## 交付内容

- **`ui/BlockParser.kt`**（纯 Kotlin，可 JVM 单测）：BlockNote 块 JSON → 可渲染模型
  - 块：paragraph / heading(level) / bulletListItem / numberedListItem / checkListItem(checked) /
    quote / callout(emoji) / codeBlock(language) / divider / image(url,caption) / table(headerRows,rows) /
    bookmark(url,title,description) / collectionBlock(collectionId) / 未知块（类型 + 原始 JSON）
  - 内联：text(styles: bold/italic/underline/strike/code/href) / link(href) / pageMention(pageId,title)
  - 图片 `asset://<id>` 解析（红线 G1：库里只存附件编号）
- **`ui/BlockRenderer.kt`**（Compose）：按块型绘制，嵌套子块缩进递归；有序列表按同级序号；
  待办勾选态带删除线；引用左侧竖线；callout 底色卡片；代码块等宽 + 横向滚动；表格带表头与边框；
  图片优先从 Room `assets` 表解码位图，缺附件时显示占位（A11 接附件同步）；
  未知块降级为「［不支持的块：type］」，点击展开/收起原始 JSON
- **页面详情接入**：`MainScreen.PageDetail` 由占位改为「元信息 → 块渲染 → 子页列表」，整页可滚动

## 冒烟方式

沿用 A03/A04 的设备内取证：sqlite3 直接向 Room `docs` 表写入一份覆盖全部块型的 BlockNote JSON
（`block-seed.sql` 原样留在本目录），启动后打开「设计稿要点」逐块检查。

## 冒烟结果（设备实测）

| 块型 | 结果 | 证据 |
| --- | --- | --- |
| 段落 + 加粗/斜体/删除线/行内代码/链接/页面提及 | 文本与样式、@会议记录 均正确显示 | `01-块渲染-上半屏.png` |
| 一级/二级标题 | 字号/字重分层正确 | 同上 |
| 无序/有序（1. 2.）/待办（☑ 带删除线、☐） | 标记与勾选态正确 | 同上 |
| 引用 / callout / 代码块（kotlin 标签 + 等宽） | 样式正确 | 同上 |
| 图片（asset:// 缺附件） | 占位文案 + 图注 | 同上 |
| 表格（1 行表头 + 数据行） | 表头加粗、边框与列对齐 | `02-块渲染-表格与书签.png` |
| 书签 / 多维表块 | 书签卡片（标题/描述/URL）；多维表占位（A08） | 同上 |
| 未知块 someFutureBlock | 降级提示，点击展开原始 JSON、再点收起 | `03-未知块-展开原始JSON.png` |

全流程 logcat：**0 条 FATAL**。

## JVM 单测

`./gradlew testDebugUnitTest`：**59/59 全绿**
（新增 `BlockParserTest` 12 条：样式/链接/标题级别/待办态/引用·无序·有序·分割线/代码/图片 asset 引用/
表格表头与单元格/callout·书签·多维表/页面提及/未知块降级/嵌套子块/坏 JSON 兜底）

## 冒烟逮到并修掉的真 bug（1 个）

**Kotlin elvis 优先级踩坑**：布尔读取原写成

```kotlin
p?.booleanOrNull ?: p?.content == "true"
```

Kotlin 里 `?:` 的优先级**高于** `==`，这句被解析成 `(a ?: b) == "true"`，
于是所有 `bold` / `checked` 永远是 `false`（页面能显示，只是样式全丢——最难发现的那类）。
单测在提交前逮住；改成显式分支并写进注释防复发。

## 仍未覆盖（不得当作已完成）

- 页面提及（@）**不可点击跳转**：按任务拆分归 A09 双链
- 图片只认本地 `assets` 表；远程图片下载/补缺归 A11
- 多维表块只显示占位；表格视图归 A08
- 视频/音频/文件块暂按未知块降级（web 端也极少用；真遇到再补）
- 编辑器（A06/A07）不在本任务范围：本页为纯只读
