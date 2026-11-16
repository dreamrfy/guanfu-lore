package app.guanfu.shell.ui

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
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
) {
    /** 拖拽/记录行位置时用的稳定 key */
    val pathKey: String get() = path.joinToString(".")
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

    fun toJson(): String = JsonArray(items.toList()).toString()

    /* ---------------- 内部 ---------------- */

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
