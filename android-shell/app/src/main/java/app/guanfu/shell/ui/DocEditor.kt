package app.guanfu.shell.ui

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import java.util.UUID

/**
 * 正文编辑模型（A06 建 / A07 扩成树）：**在原始 JSON 上原地改**，不重建整篇文档。
 *
 * 为什么这么做：web 端才是块结构的权威，安卓只保证「改过的块按规矩改、没碰的块一个字节不动」
 * （未知块、自定义 props、children、未来新字段都不能被我们抹掉）。所以：
 *  - 每个块仍是原样的 JsonObject，改动只落在 type/props/content/children 这几个键上
 *  - toJson() 直接序列化回去，未改动的块与原来逐字节一致
 *
 * A07 起用 **path（每层索引组成的列表）** 定位块，支持树形编辑：
 *  - indent：变成上一个兄弟的子块；outdent：从父块里提出来，成为父块的下一个兄弟
 *  - moveTo：把块搬到另一个块的前/后（拖拽排序用；禁止拖进自己的子树）
 *  - delete：有子块时把子块提升为同级，**不做整棵子树静默删除**
 *
 * 行内样式红线（A06 起沿用）：只有「空内容」或「单个纯文本 run（可带 code 样式）」的块可编辑文本；
 * 含加粗/链接/多段混排的块只读并提示——宁可让用户看到「暂时不能改」，也不静默丢样式。
 */

/** 认得的、且正文就写在 content 里的块型（其余块型只读） */
private val EDITABLE_TYPES = setOf(
    "paragraph", "heading", "bulletListItem", "numberedListItem",
    "checkListItem", "quote", "codeBlock", "callout",
)

/** 能接收「@页面提及」的块型（A09）：正文是 inline 的那些；代码块不收，表格/图片本就没有 inline */
private val MENTION_HOST_TYPES = EDITABLE_TYPES - "codeBlock"

enum class BlockKind(val wire: String, val label: String, val glyph: String, val level: Int = 0) {
    Paragraph("paragraph", "正文", "¶"),
    Heading1("heading", "标题 1", "H1", level = 1),
    Heading2("heading", "标题 2", "H2", level = 2),
    Heading3("heading", "标题 3", "H3", level = 3),
    Bullet("bulletListItem", "无序列表", "•"),
    Numbered("numberedListItem", "有序列表", "1."),
    Check("checkListItem", "待办", "☑"),
    Quote("quote", "引用", "❝"),
    Code("codeBlock", "代码", "</>"),
    Divider("divider", "分割线", "—"),
}

/** 编辑界面需要的一个块视图；path 是树里的位置（根层 [0]、[1]…，子块 [0,0]…） */
data class EditBlock(
    val path: List<Int>,
    val depth: Int,
    val id: String,
    val type: String,
    /** 能在「类型」菜单里对上的种类；未知块为 null（只读） */
    val kind: BlockKind?,
    val text: String,
    val checked: Boolean,
    /** 本块能否改文字；false 时只读渲染并显示 hint */
    val editable: Boolean,
    val hint: String?,
    val hasChildren: Boolean,
    /** 只读渲染用（不可编辑的块直接画出来，用户仍能看见内容） */
    val node: BlockNode?,
    /** 表格块的行列视图（A08）；非表格为 null */
    val table: TableView? = null,
) {
    /** 拖拽/记录行位置时用的稳定 key */
    val pathKey: String get() = path.joinToString(".")
}

/**
 * 表格块里一个单元格的展示态（A08）。
 * editable=false 表示单元格里是链接/提及/多段混排，只读显示，不静默改掉。
 */
data class TableCellView(
    val text: String,
    val editable: Boolean,
)

/** 表格块的行列视图；shape 一变就说明结构变了，界面上的单元格输入态要重建 */
data class TableView(
    val headerRows: Int,
    val headerCols: Int,
    val columnCount: Int,
    val rows: List<List<TableCellView>>,
) {
    val rowCount: Int get() = rows.size
    val hasReadOnlyCell: Boolean get() = rows.any { row -> row.any { !it.editable } }
    val shape: String get() = "$headerRows:$headerCols:${rows.size}:$columnCount"
}

class DocEditor(
    blocksJson: String?,
    private val newId: () -> String = { "b" + UUID.randomUUID().toString().replace("-", "").take(12) },
) {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val items: MutableList<JsonObject> = run {
        val array = runCatching { json.parseToJsonElement(blocksJson.orEmpty()) as? JsonArray }.getOrNull()
        (array?.mapNotNull { it as? JsonObject } ?: emptyList()).toMutableList()
    }

    /** 根层块数（编辑器底部「空页」判断用） */
    val size: Int get() = items.size

    /** 深度优先摊平：父块后面紧跟它的子块 */
    fun views(): List<EditBlock> {
        val out = mutableListOf<EditBlock>()
        fun walk(list: List<JsonObject>, parentPath: List<Int>, depth: Int) {
            list.forEachIndexed { index, block ->
                val path = parentPath + index
                out += viewOf(block, path, depth)
                val children = childrenOf(block)
                if (children.isNotEmpty()) walk(children, path, depth + 1)
            }
        }
        walk(items, emptyList(), 0)
        return out
    }

    /** 兼容 A06 的测试/旧调用：按根层 index 取视图 */
    fun view(index: Int): EditBlock = viewOf(items[index], listOf(index), 0)

    fun setText(path: List<Int>, text: String): Boolean {
        val block = blockAt(path) ?: return false
        if (!checkEditable(block.str("type").orEmpty(), block["content"]).first) return false
        val styles = singleRunStyles(block["content"])
        update(path) { it.with("content", JsonArray(listOf(textRun(text, styles)))) }
        return true
    }

    fun setText(index: Int, text: String): Boolean = setText(listOf(index), text)

    /** 切类型：保留正文与 children，只改 type/props */
    fun setKind(path: List<Int>, kind: BlockKind) {
        val block = blockAt(path) ?: return
        val props = when (kind) {
            BlockKind.Heading1, BlockKind.Heading2, BlockKind.Heading3 ->
                JsonObject(mapOf("level" to JsonPrimitive(kind.level)))
            BlockKind.Check -> JsonObject(mapOf("checked" to JsonPrimitive((block["props"] as? JsonObject)?.bool("checked") ?: false)))
            BlockKind.Code -> JsonObject(mapOf("language" to JsonPrimitive((block["props"] as? JsonObject)?.str("language").orEmpty())))
            else -> JsonObject(emptyMap())
        }
        update(path) { it.with("type", JsonPrimitive(kind.wire)).with("props", props) }
    }

    fun setKind(index: Int, kind: BlockKind) = setKind(listOf(index), kind)

    fun toggleCheck(path: List<Int>) {
        val block = blockAt(path) ?: return
        val props = block["props"] as? JsonObject ?: JsonObject(emptyMap())
        update(path) { it.with("props", props.with("checked", JsonPrimitive(!props.bool("checked")))) }
    }

    fun toggleCheck(index: Int) = toggleCheck(listOf(index))

    /** 在 path 之后插入一个空块（同级），返回新块 id */
    fun insertAfter(path: List<Int>, kind: BlockKind = BlockKind.Paragraph): String {
        if (path.isEmpty()) return append(kind)
        val parentPath = path.dropLast(1)
        val siblings = siblingsAt(parentPath).toMutableList()
        val block = newBlock(kind)
        siblings.add((path.last() + 1).coerceIn(0, siblings.size), block)
        setSiblings(parentPath, siblings)
        return block.str("id").orEmpty()
    }

    fun insertAfter(index: Int, kind: BlockKind = BlockKind.Paragraph): String = insertAfter(listOf(index), kind)

    /** 追加到根层末尾（编辑器底的「+ 添加块」） */
    fun append(kind: BlockKind = BlockKind.Paragraph): String {
        val block = newBlock(kind)
        items.add(block)
        return block.str("id").orEmpty()
    }

    /**
     * 删除块。有子块时把子块提升为同级（不静默丢内容）。
     */
    fun delete(path: List<Int>): Boolean {
        if (path.isEmpty()) return false
        val parentPath = path.dropLast(1)
        val siblings = siblingsAt(parentPath).toMutableList()
        val index = path.last()
        val block = siblings.getOrNull(index) ?: return false
        siblings.removeAt(index)
        val children = childrenOf(block)
        if (children.isNotEmpty()) siblings.addAll(index.coerceAtMost(siblings.size), children)
        setSiblings(parentPath, siblings)
        return true
    }

    fun delete(index: Int): Boolean = delete(listOf(index))

    /** 缩进：变成上一个兄弟的子块（同级第一个不能缩进） */
    fun indent(path: List<Int>): Boolean {
        if (path.isEmpty() || path.last() == 0) return false
        val parentPath = path.dropLast(1)
        val siblings = siblingsAt(parentPath).toMutableList()
        val index = path.last()
        val block = siblings.getOrNull(index) ?: return false
        val previous = siblings[index - 1]
        siblings.removeAt(index)
        val children = childrenOf(previous).toMutableList().apply { add(block) }
        siblings[index - 1] = previous.with("children", JsonArray(children))
        setSiblings(parentPath, siblings)
        return true
    }

    fun indent(index: Int): Boolean = indent(listOf(index))

    /** 反缩进：从父块里提出来，插到父块后面（根层不能反缩进） */
    fun outdent(path: List<Int>): Boolean {
        if (path.size < 2) return false
        val parentPath = path.dropLast(1)
        val grandPath = parentPath.dropLast(1)
        val parentIndex = parentPath.last()

        val siblings = siblingsAt(parentPath).toMutableList()
        val block = siblings.getOrNull(path.last()) ?: return false
        siblings.removeAt(path.last())
        setSiblings(parentPath, siblings)

        val grand = siblingsAt(grandPath).toMutableList()
        grand.add((parentIndex + 1).coerceIn(0, grand.size), block)
        setSiblings(grandPath, grand)
        return true
    }

    /**
     * 拖拽落点：把 fromPath 的块搬到 targetPath 的块前/后（同级或跨父级都行）。
     * 拒绝：搬到自己身上、搬进自己的子树（否则会形成环/丢块）。
     */
    fun moveTo(fromPath: List<Int>, targetPath: List<Int>, after: Boolean): Boolean {
        if (fromPath.isEmpty() || targetPath.isEmpty()) return false
        if (fromPath == targetPath) return false
        if (targetPath.size > fromPath.size && targetPath.take(fromPath.size) == fromPath) return false

        // 先取出源块（同时从源位置删除）
        val sourceParent = fromPath.dropLast(1)
        val source = siblingsAt(sourceParent).toMutableList()
        val moving = source.getOrNull(fromPath.last()) ?: return false
        source.removeAt(fromPath.last())
        setSiblings(sourceParent, source)

        // 目标路径可能因删除而左移（同一父级、且源在目标之前）
        var target = targetPath
        if (sourceParent == target.dropLast(1) && fromPath.last() < target.last()) {
            target = target.dropLast(1) + (target.last() - 1)
        }

        val destParent = target.dropLast(1)
        val dest = siblingsAt(destParent).toMutableList()
        val insertAt = (target.last() + if (after) 1 else 0).coerceIn(0, dest.size)
        dest.add(insertAt, moving)
        setSiblings(destParent, dest)
        return true
    }

    /* ---------------- 表格（A08） ----------------
     * 结构以 BlockNote 的 tableContent 为准：
     *   content = { type:"tableContent", headerRows, headerCols?, columnWidths?, rows:[{cells:[…]}] }
     * 每个 cell 可能是 InlineContent[] 简写，也可能是 { type:"tableCell", content, props }。
     * 所有操作只改「文字 / 行列结构」，未触碰的行、cells 对象里的 props、columnWidths 原样保留。
     */

    /**
     * 改单元格文字。
     * 只有「空单元格」或「单个纯文本 run（可带样式）」才允许改；链接/提及/多段样式一律拒绝，
     * 免得把单元格里的结构悄悄压平。
     */
    fun setCellText(path: List<Int>, row: Int, col: Int, text: String): Boolean {
        val block = blockAt(path) ?: return false
        val table = block["content"] as? JsonObject ?: return false
        val cells = ((table["rows"] as? JsonArray)?.getOrNull(row) as? JsonObject)?.get("cells") as? JsonArray ?: return false
        val cell = cells.getOrNull(col) ?: return false
        if (!cellEditable(cell)) return false

        val run = textRun(text, cellStyles(cell))
        val newCell: JsonElement =
            if (cell is JsonObject) cell.with("content", JsonArray(listOf(run))) else JsonArray(listOf(run))
        update(path) { current ->
            val content = current["content"] as? JsonObject ?: return@update current
            val rows = content["rows"] as? JsonArray ?: return@update current
            val liveRow = rows.getOrNull(row) as? JsonObject ?: return@update current
            val liveCells = liveRow["cells"] as? JsonArray ?: return@update current
            current.with(
                "content",
                content.with("rows", rows.replaceAt(row, liveRow.with("cells", liveCells.replaceAt(col, newCell)))),
            )
        }
        return true
    }

    /** 在 afterRow 之后插一个空行（null = 追加到末尾）；空表格按 1 列建行 */
    fun addRow(path: List<Int>, afterRow: Int? = null): Boolean {
        val block = blockAt(path) ?: return false
        val table = block["content"] as? JsonObject ?: return false
        val size = (table["rows"] as? JsonArray)?.size ?: 0
        val at = (afterRow?.plus(1) ?: size).coerceIn(0, size)
        update(path) { current ->
            val content = current["content"] as? JsonObject ?: return@update current
            val rows = content["rows"] as? JsonArray ?: JsonArray(emptyList())
            val emptyCells = JsonArray(List(columnCount(content).coerceAtLeast(1)) { JsonArray(emptyList()) })
            val next = rows.toMutableList().apply {
                add(at.coerceIn(0, rows.size), JsonObject(mapOf("cells" to emptyCells)))
            }
            val withHeader = if (content.containsKey("headerRows")) content else content.with("headerRows", JsonPrimitive(1))
            current.with("content", withHeader.with("rows", JsonArray(next)))
        }
        return true
    }

    /** 删一行；删到表头行时 headerRows 跟着减 1（至少剩一行才让删） */
    fun deleteRow(path: List<Int>, row: Int): Boolean {
        val block = blockAt(path) ?: return false
        val table = block["content"] as? JsonObject ?: return false
        val rows = table["rows"] as? JsonArray ?: return false
        if (rows.size <= 1 || row !in rows.indices) return false
        update(path) { current ->
            val content = current["content"] as? JsonObject ?: return@update current
            val liveRows = content["rows"] as? JsonArray ?: return@update current
            if (liveRows.size <= 1 || row !in liveRows.indices) return@update current
            var updated = content.with("rows", JsonArray(liveRows.toMutableList().apply { removeAt(row) }))
            if (updated.containsKey("headerRows")) {
                val headerRows = updated.int("headerRows")
                if (row < headerRows) updated = updated.with("headerRows", JsonPrimitive(headerRows - 1))
            }
            current.with("content", updated)
        }
        return true
    }

    /** 末尾加一列：短行先补空单元格再补新列，保证每行列数一致；columnWidths 同步追加 */
    fun addColumn(path: List<Int>): Boolean {
        val block = blockAt(path) ?: return false
        val table = block["content"] as? JsonObject ?: return false
        update(path) { current ->
            val content = current["content"] as? JsonObject ?: return@update current
            val liveRows = content["rows"] as? JsonArray ?: JsonArray(emptyList())
            val target = columnCount(content) + 1
            val next = JsonArray(
                liveRows.map { row ->
                    val obj = row as? JsonObject ?: return@map row
                    val cells = (obj["cells"] as? JsonArray)?.toMutableList() ?: mutableListOf()
                    while (cells.size < target - 1) cells.add(JsonArray(emptyList()))
                    cells.add(JsonArray(emptyList()))
                    obj.with("cells", JsonArray(cells))
                },
            )
            var updated = content.with("rows", next)
            val widths = content["columnWidths"] as? JsonArray
            if (widths != null) updated = updated.with("columnWidths", JsonArray(widths.toList() + JsonNull))
            current.with("content", updated)
        }
        return true
    }

    /** 删一列：每行删同一位置；删到表头列时 headerCols 跟着减 1，columnWidths 同步删（至少剩一列） */
    fun deleteColumn(path: List<Int>, col: Int): Boolean {
        val block = blockAt(path) ?: return false
        val table = block["content"] as? JsonObject ?: return false
        if (col < 0 || columnCount(table) <= 1) return false
        update(path) { current ->
            val content = current["content"] as? JsonObject ?: return@update current
            if (columnCount(content) <= 1) return@update current
            val liveRows = content["rows"] as? JsonArray ?: JsonArray(emptyList())
            val next = JsonArray(
                liveRows.map { row ->
                    val obj = row as? JsonObject ?: return@map row
                    val cells = (obj["cells"] as? JsonArray)?.toMutableList() ?: return@map row
                    if (col in cells.indices) cells.removeAt(col)
                    obj.with("cells", JsonArray(cells))
                },
            )
            var updated = content.with("rows", next)
            if (updated.containsKey("headerCols")) {
                val headerCols = updated.int("headerCols")
                if (col < headerCols) updated = updated.with("headerCols", JsonPrimitive(headerCols - 1))
            }
            val widths = content["columnWidths"] as? JsonArray
            if (widths != null && col in widths.indices) {
                updated = updated.with("columnWidths", JsonArray(widths.toMutableList().apply { removeAt(col) }))
            }
            current.with("content", updated)
        }
        return true
    }

    /**
     * 在块正文末尾追加一个「@页面提及」（A09）。
     * 只加不改：已有的 runs、样式、未知字段原样保留；只有正文在 content 里的块型接受提及
     * （代码块、表格、图片等直接拒绝）。
     * 节点形状对齐 web 的 pageMention spec：{type:"pageMention", props:{pageId,title}}（无 content 键）。
     */
    fun appendMention(path: List<Int>, pageId: String, title: String): Boolean {
        val block = blockAt(path) ?: return false
        if (block.str("type").orEmpty() !in MENTION_HOST_TYPES) return false
        val existing = block["content"] as? JsonArray ?: JsonArray(emptyList())
        val mention = JsonObject(
            mapOf(
                "type" to JsonPrimitive("pageMention"),
                "props" to JsonObject(
                    mapOf(
                        "pageId" to JsonPrimitive(pageId),
                        "title" to JsonPrimitive(title),
                    ),
                ),
            ),
        )
        update(path) { it.with("content", JsonArray(existing + mention)) }
        return true
    }

    fun toJson(): String = JsonArray(items.toList()).toString()

    /* ---------------- 内部 ---------------- */

    /* ---- 表格读取辅助（A08） ---- */

    private fun readTableView(block: JsonObject): TableView {
        val table = block["content"] as? JsonObject ?: return TableView(0, 0, 0, emptyList())
        val headerRows = table.int("headerRows")
        val headerCols = table.int("headerCols")
        val cols = columnCount(table)
        val rows = (table["rows"] as? JsonArray).orEmpty().mapNotNull { row ->
            (row as? JsonObject)?.let { obj ->
                val cells = (obj["cells"] as? JsonArray) ?: JsonArray(emptyList())
                (0 until cols).map { index ->
                    val cell = cells.getOrNull(index)
                    TableCellView(text = cellText(cell), editable = cellEditable(cell))
                }
            }
        }
        return TableView(headerRows, headerCols, cols, rows)
    }

    /** 单元格的字面内容：{type:"tableCell",content:[…]} 取 content，普通数组直接用 */
    private fun cellContent(cell: JsonElement?): JsonElement? = when (cell) {
        is JsonObject -> cell["content"]
        else -> cell
    }

    private fun cellText(cell: JsonElement?): String = inlineText(parseInline(cellContent(cell)))

    /** 空单元格或单 run 纯文本才可编辑；链接/提及/多段样式只读（不静默丢样式） */
    private fun cellEditable(cell: JsonElement?): Boolean {
        val spans = parseInline(cellContent(cell))
        return spans.size <= 1 && spans.all { it is InlineSpan.Text }
    }

    private fun cellStyles(cell: JsonElement?): JsonObject = singleRunStyles(cellContent(cell))

    /** 列宽：行里的最大单元格数，和 columnWidths 取大（两者可能不同步） */
    private fun columnCount(table: JsonObject): Int {
        val fromRows = (table["rows"] as? JsonArray)?.maxOfOrNull { row ->
            ((row as? JsonObject)?.get("cells") as? JsonArray)?.size ?: 0
        } ?: 0
        val fromWidths = (table["columnWidths"] as? JsonArray)?.size ?: 0
        return maxOf(fromRows, fromWidths)
    }

    private fun JsonObject.int(key: String): Int = (this[key] as? JsonPrimitive)?.intOrNull ?: 0

    private fun JsonArray.replaceAt(index: Int, element: JsonElement): JsonArray =
        JsonArray(toMutableList().apply { if (index in indices) this[index] = element })

    private fun viewOf(block: JsonObject, path: List<Int>, depth: Int): EditBlock {
        val type = block.str("type").orEmpty()
        val props = block["props"] as? JsonObject ?: JsonObject(emptyMap())
        val children = childrenOf(block).size
        val spans = parseInline(block["content"])
        val editability = checkEditable(type, block["content"])
        return EditBlock(
            path = path,
            depth = depth,
            id = block.str("id").orEmpty(),
            type = type,
            kind = kindOf(type, props),
            text = inlineText(spans),
            checked = props.bool("checked"),
            editable = editability.first,
            hint = editability.second,
            hasChildren = children > 0,
            node = parseBlock(block),
            table = if (type == "table") readTableView(block) else null,
        )
    }

    private fun childrenOf(block: JsonObject): List<JsonObject> =
        (block["children"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()

    private fun blockAt(path: List<Int>): JsonObject? {
        var list: List<JsonObject> = items
        var block: JsonObject? = null
        for (index in path) {
            block = list.getOrNull(index) ?: return null
            list = childrenOf(block)
        }
        return block
    }

    private fun update(path: List<Int>, transform: (JsonObject) -> JsonObject) {
        if (path.isEmpty()) return
        items.replaceAt(path, 0, transform)
    }

    private fun MutableList<JsonObject>.replaceAt(path: List<Int>, depth: Int, transform: (JsonObject) -> JsonObject) {
        val index = path[depth]
        val block = this[index]
        if (depth == path.lastIndex) {
            this[index] = transform(block)
            return
        }
        val children = childrenOf(block).toMutableList()
        children.replaceAt(path, depth + 1, transform)
        this[index] = block.with("children", JsonArray(children))
    }

    private fun siblingsAt(parentPath: List<Int>): List<JsonObject> {
        if (parentPath.isEmpty()) return items
        val parent = blockAt(parentPath) ?: return emptyList()
        return childrenOf(parent)
    }

    private fun setSiblings(parentPath: List<Int>, siblings: List<JsonObject>) {
        if (parentPath.isEmpty()) {
            items.clear()
            items.addAll(siblings)
            return
        }
        update(parentPath) { it.with("children", JsonArray(siblings)) }
    }

    private fun newBlock(kind: BlockKind): JsonObject = JsonObject(
        mapOf(
            "id" to JsonPrimitive(newId()),
            "type" to JsonPrimitive(kind.wire),
            "props" to when (kind) {
                BlockKind.Heading1, BlockKind.Heading2, BlockKind.Heading3 -> JsonObject(mapOf("level" to JsonPrimitive(kind.level)))
                BlockKind.Check -> JsonObject(mapOf("checked" to JsonPrimitive(false)))
                BlockKind.Code -> JsonObject(mapOf("language" to JsonPrimitive("")))
                else -> JsonObject(emptyMap())
            },
            "content" to if (kind == BlockKind.Divider) JsonArray(emptyList()) else JsonArray(listOf(textRun("", JsonObject(emptyMap())))),
            "children" to JsonArray(emptyList()),
        ),
    )

    private fun textRun(text: String, styles: JsonObject): JsonObject = JsonObject(
        mapOf(
            "type" to JsonPrimitive("text"),
            "text" to JsonPrimitive(text),
            "styles" to styles,
        ),
    )

    /** 空的或「单个纯文本 run」才可编辑；第二个返回值是不可编辑的原因 */
    private fun checkEditable(type: String, content: JsonElement?): Pair<Boolean, String?> {
        if (type !in EDITABLE_TYPES) {
            if (type == "divider") return false to "分割线没有文字"
            return false to "这个块型（$type）的编辑在后续任务接入"
        }
        val runs = parseInline(content)
        if (runs.isEmpty()) return true to null
        if (runs.size > 1) return false to "这个块含多段行内样式/链接，富文本编辑在后续任务接入（先保持原样）"
        val only = runs.single()
        if (only !is InlineSpan.Text) return false to "这个块含页面提及，编辑在 A09 接入"
        if (only.href != null) return false to "这个块是链接文本，富文本编辑在后续任务接入"
        val rich = only.bold || only.italic || only.underline || only.strike
        if (rich) return false to "这个块含加粗/斜体等样式，富文本编辑在后续任务接入"
        return true to null
    }

    /** 单 run 的样式原样保留（比如整块「行内代码」的段落，改字后仍是行内代码） */
    private fun singleRunStyles(content: JsonElement?): JsonObject {
        val obj = (content as? JsonArray)?.firstOrNull() as? JsonObject
        return obj?.get("styles") as? JsonObject ?: JsonObject(emptyMap())
    }

    private fun kindOf(type: String, props: JsonObject): BlockKind? = when (type) {
        "paragraph" -> BlockKind.Paragraph
        "heading" -> when (props["level"]?.toString()) {
            "2" -> BlockKind.Heading2
            "3" -> BlockKind.Heading3
            else -> BlockKind.Heading1
        }
        "bulletListItem" -> BlockKind.Bullet
        "numberedListItem" -> BlockKind.Numbered
        "checkListItem" -> BlockKind.Check
        "quote" -> BlockKind.Quote
        "codeBlock" -> BlockKind.Code
        "divider" -> BlockKind.Divider
        else -> null
    }

    private fun JsonObject.with(key: String, value: JsonElement): JsonObject =
        JsonObject(toMutableMap().apply { put(key, value) })

    private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.content

    private fun JsonObject.bool(key: String): Boolean {
        val primitive = this[key] as? JsonPrimitive ?: return false
        return primitive.content == "true"
    }
}
