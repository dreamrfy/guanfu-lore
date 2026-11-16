package app.guanfu.shell.ui

import androidx.compose.foundation.background
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.guanfu.shell.db.PageEntity
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 块编辑器一期（A06）：进入编辑 / 块增删 / 类型切换 / 键盘适配 / 自动保存。
 *
 * 刻意**不自研富文本引擎**（架构 §4）：每块一个输入框 + 外层 Column 滚动。
 *  - 增：每块下方的「+」（在其后插入）与末尾「+ 添加块」（追加）
 *  - 删：「✕」
 *  - 类型：左侧 glyph 按钮弹出菜单（正文/标题 1-3/无序/有序/待办/引用/代码/分割线）
 *  - 键盘：Activity 已设 adjustResize，这里再加 imePadding，光标行不会被输入法顶住
 *  - 保存：改动后 400ms 防抖，交给 PageSaver 写库 + 出同步箱（web setBlocks 同语义）
 *
 * `/` 命令面板、拖拽排序、富行内编辑（加粗/链接）属于 A07；这类块在编辑器里保持只读并提示原因，
 * 不用「编辑一次就把样式抹掉」的方式换功能。
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
    val scope = rememberCoroutineScope()

    // 防抖保存：每次改动重启计时，停下来 400ms 才写库（对齐 web 的 300ms 节流思路）
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
                        focusId = focusId,
                        onFocusHandled = { focusId = null },
                        onText = { text -> editor.setText(block.index, text); touched() },
                        onKind = { kind -> editor.setKind(block.index, kind); touched() },
                        onToggleCheck = { editor.toggleCheck(block.index); touched() },
                        onInsertAfter = {
                            focusId = editor.insertAfter(block.index)
                            touched()
                        },
                        onDelete = { editor.delete(block.index); touched() },
                    )
                }
            }
            TextButton(onClick = {
                focusId = editor.append()
                touched()
            }) { Text("+ 添加块") }
            if (editor.size == 0) {
                Text(
                    "这一页还没有正文，点上面「+ 添加块」开始写。",
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
    focusId: String?,
    onFocusHandled: () -> Unit,
    onText: (String) -> Unit,
    onKind: (BlockKind) -> Unit,
    onToggleCheck: () -> Unit,
    onInsertAfter: () -> Unit,
    onDelete: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    var text by remember(block.id) { mutableStateOf(block.text) }
    val focusRequester = remember(block.id) { FocusRequester() }

    LaunchedEffect(focusId, block.id) {
        if (focusId == block.id && block.editable) {
            focusRequester.requestFocus()
            onFocusHandled()
        }
    }

    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Box {
                TextButton(onClick = { menuOpen = true }, modifier = Modifier.width(56.dp)) {
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

            if (block.kind == BlockKind.Check) {
                Checkbox(checked = block.checked, onCheckedChange = { onToggleCheck() })
            }

            if (block.editable) {
                val textStyle = when (block.kind) {
                    BlockKind.Heading1 -> TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    BlockKind.Heading2 -> TextStyle(fontSize = 19.sp, fontWeight = FontWeight.Bold)
                    BlockKind.Heading3 -> TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                    BlockKind.Code -> TextStyle(fontFamily = FontFamily.Monospace, fontSize = 13.sp)
                    BlockKind.Quote -> TextStyle(fontSize = 15.sp, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic)
                    else -> TextStyle(fontSize = 15.sp)
                }
                BasicTextField(
                    value = text,
                    onValueChange = {
                        text = it
                        onText(it)
                    },
                    textStyle = textStyle.copy(color = MaterialTheme.colorScheme.onSurface),
                    modifier = Modifier
                        .weight(1f)
                        .focusRequester(focusRequester)
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(vertical = 10.dp, horizontal = 4.dp),
                    decorationBox = { inner ->
                        if (text.isEmpty()) {
                            Text(
                                "（空块，点这里输入）",
                                fontSize = textStyle.fontSize,
                                color = MaterialTheme.colorScheme.outline,
                            )
                        }
                        inner()
                    },
                )
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

        Row(Modifier.padding(start = 56.dp)) {
            TextButton(onClick = onInsertAfter) {
                Text("+", fontSize = 15.sp, color = MaterialTheme.colorScheme.outline)
            }
            if (block.hasChildren) {
                Text(
                    "（含子块，子块编辑在 A07 接入）",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.padding(top = 14.dp),
                )
            }
        }
    }
}
