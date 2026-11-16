package app.guanfu.shell.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.guanfu.shell.db.PageEntity
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 块编辑器（A06 一期 / A07 二期）：进入编辑 / 块增删 / 类型切换 / 键盘适配 / 自动保存，
 * A07 追加：**树形缩进（→/←）**、**长按拖拽排序**、**`/` 命令面板**。
 *
 * 不自研富文本引擎（架构 §4）：每块一个输入框 + 外层 Column 滚动。
 *  - 树：views() 深度优先摊平，子块缩进渲染；父块详情不再提示"子块稍后接入"
 *  - 拖拽：长按左侧「≡」上下拖，落到哪一行就插到那一行前/后（可跨层级）
 *  - 缩进：→ 变成上一个兄弟的子块；← 从父块里提出来
 *  - `/`：输入框里以 `/` 开头时弹出块类型菜单，选中后清掉斜杠并切类型
 *  - 保存：改动后 400ms 防抖；「完成」退出前强制落一次盘
 */
@Composable
fun PageEditorView(
    page: PageEntity,
    initialBlocksJson: String?,
    onSave: suspend (blocksJson: String) -> Unit,
    onExit: () -> Unit,
) {
    val editor = remember(page.id) { DocEditor(initialBlocksJson) }
    var tick by remember { mutableIntStateOf(0) }
    var dirty by remember { mutableStateOf(false) }
    var focusId by remember { mutableStateOf<String?>(null) }
    var lastSavedAt by remember { mutableStateOf<Long?>(null) }
    var dragKey by remember { mutableStateOf<String?>(null) }
    var dragDelta by remember { mutableFloatStateOf(0f) }
    val rowBounds = remember { mutableStateMapOf<String, Rect>() }
    val scope = rememberCoroutineScope()

    // 防抖保存：每次改动重启计时，停下来 400ms 才写库
    LaunchedEffect(tick) {
        if (!dirty) return@LaunchedEffect
        delay(400)
        onSave(editor.toJson())
        dirty = false
        lastSavedAt = System.currentTimeMillis()
    }

    fun touched() {
        dirty = true
        tick += 1
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                if (lastSavedAt == null) "编辑中（改动会自动保存）" else "已自动保存",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.outline,
            )
            TextButton(onClick = {
                // 退出前先落一次盘：防抖计时还没到就被切走的话，改动会丢
                scope.launch {
                    onSave(editor.toJson())
                    onExit()
                }
            }) { Text("完成") }
        }
        HorizontalDivider()

        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(12.dp),
        ) {
            for (block in editor.views()) {
                key(block.id) {
                    EditorRow(
                        block = block,
                        dragging = dragKey == block.pathKey,
                        focusId = focusId,
                        onFocusHandled = { focusId = null },
                        onPositioned = { rowBounds[block.pathKey] = it },
                        onDragStart = { dragKey = block.pathKey; dragDelta = 0f },
                        onDrag = { dragDelta += it },
                        onDragEnd = {
                            val startY = rowBounds[block.pathKey]?.center?.y
                            val endY = startY?.plus(dragDelta)
                            if (startY != null && endY != null) {
                                val target = rowBounds.entries
                                    .filter { it.key != block.pathKey }
                                    .firstOrNull { endY in it.value.top..it.value.bottom }
                                if (target != null) {
                                    val from = block.path
                                    val to = target.key.split(".").map { it.toInt() }
                                    if (editor.moveTo(from, to, after = endY > target.value.center.y)) touched()
                                }
                            }
                            dragKey = null
                            dragDelta = 0f
                        },
                        onDragCancel = { dragKey = null; dragDelta = 0f },
                        onText = { text -> editor.setText(block.path, text); touched() },
                        onKind = { kind -> editor.setKind(block.path, kind); touched() },
                        onToggleCheck = { editor.toggleCheck(block.path); touched() },
                        onInsertAfter = {
                            focusId = editor.insertAfter(block.path)
                            touched()
                        },
                        onIndent = { if (editor.indent(block.path)) touched() },
                        onOutdent = { if (editor.outdent(block.path)) touched() },
                        onDelete = { editor.delete(block.path); touched() },
                        onCell = { row, col, text -> if (editor.setCellText(block.path, row, col, text)) touched() },
                        onAddRow = { if (editor.addRow(block.path)) touched() },
                        onAddColumn = { if (editor.addColumn(block.path)) touched() },
                        onDeleteRow = { row -> if (editor.deleteRow(block.path, row)) touched() },
                        onDeleteColumn = { col -> if (editor.deleteColumn(block.path, col)) touched() },
                    )
                }
            }
            TextButton(onClick = {
                focusId = editor.append()
                touched()
            }) { Text("+ 添加块") }
            if (editor.size == 0) {
                Text(
                    "这一页还没有正文，点上面「+ 添加块」开始写。输入 / 可以调出块类型菜单。",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.padding(8.dp),
                )
            }
        }
    }
}

@Composable
private fun EditorRow(
    block: EditBlock,
    dragging: Boolean,
    focusId: String?,
    onFocusHandled: () -> Unit,
    onPositioned: (Rect) -> Unit,
    onDragStart: () -> Unit,
    onDrag: (Float) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
    onText: (String) -> Unit,
    onKind: (BlockKind) -> Unit,
    onToggleCheck: () -> Unit,
    onInsertAfter: () -> Unit,
    onIndent: () -> Unit,
    onOutdent: () -> Unit,
    onDelete: () -> Unit,
    onCell: (row: Int, col: Int, text: String) -> Unit,
    onAddRow: () -> Unit,
    onAddColumn: () -> Unit,
    onDeleteRow: (row: Int) -> Unit,
    onDeleteColumn: (col: Int) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    var slashOpen by remember { mutableStateOf(false) }
    var text by remember(block.id) { mutableStateOf(block.text) }
    val focusRequester = remember(block.id) { FocusRequester() }

    LaunchedEffect(focusId, block.id) {
        if (focusId == block.id && block.editable) {
            focusRequester.requestFocus()
            onFocusHandled()
        }
    }

    Column(
        Modifier
            .fillMaxWidth()
            .padding(start = (block.depth * 16).dp)
            .background(if (dragging) MaterialTheme.colorScheme.secondaryContainer else androidx.compose.ui.graphics.Color.Transparent)
            .onGloballyPositioned { onPositioned(it.boundsInWindow()) },
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            // 长按拖拽手柄
            Text(
                "≡",
                fontSize = 15.sp,
                color = MaterialTheme.colorScheme.outline,
                modifier = Modifier
                    .width(28.dp)
                    .padding(top = 12.dp)
                    .pointerInput(block.pathKey) {
                        detectDragGesturesAfterLongPress(
                            onDragStart = { onDragStart() },
                            onDrag = { change, amount ->
                                change.consume()
                                onDrag(amount.y)
                            },
                            onDragEnd = { onDragEnd() },
                            onDragCancel = { onDragCancel() },
                        )
                    },
            )

            if (block.table == null) {
                Box {
                    TextButton(onClick = { menuOpen = true }, modifier = Modifier.width(52.dp)) {
                        Text(block.kind?.glyph ?: "?", fontSize = 13.sp)
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        for (kind in BlockKind.entries) {
                            DropdownMenuItem(
                                text = { Text("${kind.glyph}  ${kind.label}") },
                                onClick = {
                                    onKind(kind)
                                    menuOpen = false
                                },
                            )
                        }
                    }
                }
            } else {
                // 表格块不给类型菜单：把 tableContent 改成 paragraph 会把整张表压成一行字
                Box(Modifier.width(52.dp).padding(top = 12.dp)) {
                    Text("▦", fontSize = 13.sp, color = MaterialTheme.colorScheme.outline)
                }
            }

            if (block.kind == BlockKind.Check) {
                Checkbox(checked = block.checked, onCheckedChange = { onToggleCheck() })
            }

            val table = block.table
            if (table != null) {
                TableEditor(
                    table = table,
                    onCell = onCell,
                    onAddRow = onAddRow,
                    onAddColumn = onAddColumn,
                    onDeleteRow = onDeleteRow,
                    onDeleteColumn = onDeleteColumn,
                )
            } else if (block.editable) {
                val textStyle = when (block.kind) {
                    BlockKind.Heading1 -> TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    BlockKind.Heading2 -> TextStyle(fontSize = 19.sp, fontWeight = FontWeight.Bold)
                    BlockKind.Heading3 -> TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                    BlockKind.Code -> TextStyle(fontFamily = FontFamily.Monospace, fontSize = 13.sp)
                    BlockKind.Quote -> TextStyle(fontSize = 15.sp, fontStyle = FontStyle.Italic)
                    else -> TextStyle(fontSize = 15.sp)
                }
                Box(Modifier.weight(1f)) {
                    BasicTextField(
                        value = text,
                        onValueChange = {
                            text = it
                            onText(it)
                            // `/` 命令面板：以斜杠开头时弹出，删掉斜杠就收起
                            slashOpen = it.startsWith("/")
                        },
                        textStyle = textStyle.copy(color = MaterialTheme.colorScheme.onSurface),
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(focusRequester)
                            .background(MaterialTheme.colorScheme.surface)
                            .padding(vertical = 10.dp, horizontal = 4.dp),
                        decorationBox = { inner ->
                            if (text.isEmpty()) {
                                Text(
                                    "输入内容，或 / 调出块类型",
                                    fontSize = textStyle.fontSize,
                                    color = MaterialTheme.colorScheme.outline,
                                )
                            }
                            inner()
                        },
                    )
                    DropdownMenu(expanded = slashOpen, onDismissRequest = { slashOpen = false }) {
                        for (kind in BlockKind.entries) {
                            DropdownMenuItem(
                                text = { Text("${kind.glyph}  ${kind.label}") },
                                onClick = {
                                    // 清掉斜杠再切类型，避免把 "/" 留在正文里
                                    text = ""
                                    onText("")
                                    onKind(kind)
                                    slashOpen = false
                                },
                            )
                        }
                    }
                }
            } else {
                Column(Modifier.weight(1f).padding(vertical = 6.dp)) {
                    block.node?.let { SingleBlockView(it) }
                    block.hint?.let {
                        Text(
                            it,
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.outline,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
            }

            TextButton(onClick = onDelete, modifier = Modifier.width(44.dp)) {
                Text("✕", fontSize = 13.sp, color = MaterialTheme.colorScheme.outline)
            }
        }

        Row(Modifier.padding(start = 28.dp)) {
            TextButton(onClick = onInsertAfter) {
                Text("+", fontSize = 15.sp, color = MaterialTheme.colorScheme.outline)
            }
            TextButton(onClick = onIndent, enabled = block.path.lastOrNull() != 0) {
                Text("→", fontSize = 14.sp, color = MaterialTheme.colorScheme.outline)
            }
            TextButton(onClick = onOutdent, enabled = block.depth > 0) {
                Text("←", fontSize = 14.sp, color = MaterialTheme.colorScheme.outline)
            }
            if (block.hasChildren) {
                Text(
                    "含子块（长按 ≡ 拖拽；→/← 调整层级）",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.padding(top = 14.dp),
                )
            }
        }
    }
}

/**
 * 表格编辑器（A08）：每格一个输入框；行首 ✕ 删行，顶部每列 ✕ 删列，底部「＋ 行 / ＋ 列」。
 * 只改文字与行列结构，未涉及的 JSON 字段（props / columnWidths / 未知字段）由 DocEditor 原样保留。
 */
@Composable
private fun TableEditor(
    table: TableView,
    onCell: (row: Int, col: Int, text: String) -> Unit,
    onAddRow: () -> Unit,
    onAddColumn: () -> Unit,
    onDeleteRow: (row: Int) -> Unit,
    onDeleteColumn: (col: Int) -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(top = 4.dp)) {
        if (table.columnCount > 1) {
            Row(Modifier.fillMaxWidth().padding(start = 28.dp)) {
                for (col in 0 until table.columnCount) {
                    Text(
                        "✕",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.outline,
                        modifier = Modifier
                            .weight(1f)
                            .clickable { onDeleteColumn(col) }
                            .padding(vertical = 6.dp),
                    )
                }
                // 对齐行首的删行按钮栏
                Box(Modifier.width(28.dp))
            }
        }

        for (rowIndex in 0 until table.rowCount) {
            val row = table.rows[rowIndex]
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (table.rowCount > 1) "✕" else " ",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.outline,
                    modifier = Modifier
                        .width(28.dp)
                        .clickable(enabled = table.rowCount > 1) { onDeleteRow(rowIndex) }
                        .padding(vertical = 12.dp),
                )
                for (col in 0 until table.columnCount) {
                    val cell = row.getOrNull(col) ?: TableCellView("", true)
                    key(table.shape, rowIndex, col) {
                        TableCellField(
                            cell = cell,
                            header = rowIndex < table.headerRows || col < table.headerCols,
                            modifier = Modifier.weight(1f),
                            onChange = { onCell(rowIndex, col, it) },
                        )
                    }
                }
                // 右侧留白，跟顶部列删除行对齐
                Box(Modifier.width(28.dp))
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onAddRow) { Text("＋ 行", fontSize = 13.sp) }
            TextButton(onClick = onAddColumn) { Text("＋ 列", fontSize = 13.sp) }
            if (table.hasReadOnlyCell) {
                Text(
                    "含链接或样式的单元格：只读",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
        }
    }
}

/** 一格：可编辑的画输入框，不可编辑的直接显示文字（并标出为什么不能改的理由在表格底部） */
@Composable
private fun TableCellField(
    cell: TableCellView,
    header: Boolean,
    modifier: Modifier = Modifier,
    onChange: (String) -> Unit,
) {
    var text by remember(cell.text) { mutableStateOf(cell.text) }
    val style = TextStyle(
        fontSize = 13.sp,
        fontWeight = if (header) FontWeight.Bold else FontWeight.Normal,
        color = MaterialTheme.colorScheme.onSurface,
    )
    Box(
        modifier
            .padding(1.dp)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f))
            .padding(horizontal = 6.dp, vertical = 9.dp),
    ) {
        if (cell.editable) {
            BasicTextField(
                value = text,
                onValueChange = {
                    text = it
                    onChange(it)
                },
                singleLine = true,
                textStyle = style,
                modifier = Modifier.fillMaxWidth(),
                decorationBox = { inner ->
                    if (text.isEmpty()) {
                        Text(
                            if (header) "表头" else "空",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.outlineVariant,
                        )
                    }
                    inner()
                },
            )
        } else {
            Text(cell.text.ifEmpty { "…" }, style = style)
        }
    }
}
