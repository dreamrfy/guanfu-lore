# A08 表格块 · 验收证据（2026-11-16）

目标：安卓端表格块的**查看 + 编辑**（单元格编辑、行列增删），数据结构与 web 端 BlockNote
`tableContent` 完全一致（headerRows / headerCols / columnWidths / rows[].cells）。

## 一、怎么造出带表格的页面

web 端的表格块由 BlockNote 默认 schema 生成，app 里没有「插入表格」入口，安卓端 A08 也不新建
表格块（只编辑已有的）。所以本轮用 **直接写 Room 库** 的方式喂种子数据，避免依赖网络。

`seed.sql`（本目录）做三件事：删旧种子 → 插页面 `page-a08-table`（标题「A08 表格验收」，
sortKey 1.0，tags `["A08","表格"]`）→ 插 docs 三块：heading / table / paragraph。

表格种子刻意做成「能验证保真」的形态：

- `headerRows: 1`、`headerCols: 1`、`columnWidths: [120, 90]`
- 第 2 行第 1 格是**对象形态单元格**（非裸数组）：
  `{"type":"tableCell","content":[{type:"text",text:"张三",styles:{bold:true}}],"props":{"textColor":"red"}}`
  —— 用来验证「改字保留单 run 样式」与「tableCell props 不被吞」
- 表格下方留一个普通段落，验证表格编辑不会污染别的块

执行方式（设备侧带 sqlite3，无需拉库）：

```sh
adb -s emulator-5554 push ops/tmp/a08_seed.sql /data/local/tmp/a08_seed.sql
adb -s emulator-5554 shell "cat /data/local/tmp/a08_seed.sql | run-as app.guanfu.shell sh -c 'cat > databases/a08_seed.sql'"
adb -s emulator-5554 shell "run-as app.guanfu.shell sh -c 'sqlite3 databases/guanfu.db < databases/a08_seed.sql'"
```

> 注意：`/data/local/tmp` 是 0771（others 只有 x），app uid 读不了，必须先由 shell uid `cat` 再管道进
> `run-as`。另外脚本里的引号交给设备上的 `sh` 解析，不要在 PowerShell 层拼引号（会被吃掉）。

## 二、模拟器实测路径（模拟器 emulator-5554 / AVD test1 / Android 14）

1. **查看模式**：表格按行渲染，表头行加粗，`张三` 因 styles.bold 加粗。
2. **进编辑**：点右上「编辑」→ 表格块渲染为编辑器：
   - 左上类型位显示 `▦` 且**不给类型菜单**（防止把 `tableContent` 切成 paragraph 毁掉整张表）
   - 每列顶部一个 `✕`（删列）、每行行首一个 `✕`（删行）、单元格为单行输入框
   - 底部 `＋ 行` / `＋ 列`
3. **改单元格**：点 `张三` 中间输入 `_ok` → 变成 `张_ok三`，**加粗仍然保留**（单 run 样式沿用）
   → `02-单元格编辑-保留加粗.png`
4. **加行**：`＋ 行` → 底部新增空行（占位「表头 / 空」），输入 `Wang`
5. **加列**：`＋ 列` → 变成 3 列，新列全空 → `03-加行加列.png`
6. **删行**：行首 `✕` 删掉「李四」行 → 4 行变 3 行（表头 / 张_ok三 / Wang）
7. **删列**：第 3 列顶部 `✕` → 回到 2 列 → `04-删行删列.png`
8. **完成**：点「完成」强制落盘，回查看模式，表格与段落都正确 → `05-查看模式-编辑后.png`
9. `logcat -s AndroidRuntime:E` 与 `logcat -b crash` 均无输出（0 FATAL）

## 三、库内取证（编辑后从设备读 Room `docs.blocks`）

```json
[{"id":"b-h1","type":"heading","props":{"level":1},"content":[{"type":"text","text":"A08 表格验收","styles":{}}],"children":[]},
 {"id":"b-t1","type":"table","props":{},"content":{"type":"tableContent","headerRows":1,"headerCols":1,"columnWidths":[120,90],"rows":[
   {"cells":[[{"type":"text","text":"姓名","styles":{}}],[{"type":"text","text":"年龄","styles":{}}]]},
   {"cells":[{"type":"tableCell","content":[{"type":"text","text":"张_ok三","styles":{"bold":true}}],"props":{"textColor":"red"}},[{"type":"text","text":"18","styles":{}}]]},
   {"cells":[[{"type":"text","text":"Wang","styles":{}}],[]]}]},"children":[]},
 {"id":"b-p1","type":"paragraph","props":{},"content":[{"type":"text","text":"表格下方的普通段落（验证编辑表格不影响其他块）","styles":{}}],"children":[]}]
```

逐条对照：

- `张_ok三` 保住了 `styles:{bold:true}`、单元格保住了 `props:{"textColor":"red"}`，且仍为
  `{type:"tableCell",content,props}` 对象形态 —— 改字只换 content，不动外层形状。
- `headerRows:1` / `headerCols:1` / `columnWidths:[120,90]`：加列时 append 了 `JsonNull`、
  删列时同步 removeAt，来回一趟后列宽数组**逐元素复原**，没有越删越短。
- 加出来的行 `[[{Wang}],[]]`：第 2 格是空数组（合法空 inline content），渲染为空。
- 表格块 `props:{}`、heading / paragraph 两块**逐字节未变** —— 未触碰的块与未知键都保真。
- `docs.updatedAt` 已刷新（11-16 08:59），`outbox` 有 2 条待推送 —— 走的是 A06 的 PageSaver 通道。

## 四、单测

`DocEditorTableTest` 15 条（`android-shell/app/src/test/java/app/guanfu/shell/ui/DocEditorTableTest.kt`）：
读结构 / 改格保样式与 props / 富格（多 run 或链接）拒绝改写 / 空格可写 / 越界返回 false /
末尾加行 / 指定位置加行 / 删表头行同步减 headerRows / 最后一行拒绝删 / 加列补齐短行 /
加列同步 columnWidths 追加 JsonNull / 删列同步列宽与 headerCols / 最后一列拒绝删 /
未触碰字段与 futureKey 保真 / 空表加行补 headerRows。

全量 `testDebugUnitTest` 96 条：A08 新增 15 条全绿；`ClipRealServiceTest`（真云 HTTP 连通性）
在机器负载高时会超时，单独重跑即过，与本任务无关。

## 五、本轮未覆盖（明说，不含糊）

- 单元格内富文本编辑（加粗/链接/提及）仍只读，只支持「空 / 单个 text run」的单元格改字
- 列宽拖拽调整、单元格合并、行列表头切换（设为表头/取消表头）
- 表格块的新建（`＋块` 里没有「表格」类型）与从 web 端粘贴表格
- 多维表（database 块）的编辑 —— 归 A08 之外的后续任务，目前只读
