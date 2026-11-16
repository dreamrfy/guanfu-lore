package app.guanfu.shell.ui

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.UUID

/**
 * 正文编辑模型（A06）：**在原始 JSON 上原地改**，不重建整篇文档。
 *
 * 为什么这么做：web 端才是块结构的权威，安卓只保证「改过的块按规矩改、没碰的块一个字节不动」
 * （未知块、自定义 props、children、未来新字段都不能被我们抹掉）。所以：
 *  - 每个块仍是原样的 JsonObject，改动只落在 type/props/content 这几个键上
 *  - toJson() 直接序列化回去，未改动的块与原来逐字节一致
 *
 * 行内样式的红线（A06 一期）：只有「空内容」或「单个纯文本 run（可带 code 样式）」的块才可编辑文本。
 * 含加粗/链接/多段混排的块保持只读并给出提示——宁可让用户看到「这个块暂时不能改」，
 * 也不能让「编辑一次就把加粗和链接改没了」这种静默数据丢失发生（富行内编辑归 A07+）。
 */

/** 认得的、且正文就写在 content 里的块型（其余块型 A06 只读） */
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

/** 编辑界面需要的一个块视图（index 会随增删变化，UI 用 id 做 key） */
data class EditBlock(
    val index: Int,
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
)

class DocEditor(
    blocksJson: String?,
    private val newId: () -> String = { "b" + UUID.randomUUID().toString().replace("-", "").take(12) },
) {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val items: MutableList<JsonObject> = run {
        val array = runCatching { json.parseToJsonElement(blocksJson.orEmpty()) as? JsonArray }.getOrNull()
        (array?.mapNotNull { it as? JsonObject } ?: emptyList()).toMutableList()
    }

    val size: Int get() = items.size

    fun views(): List<EditBlock> = items.indices.map { view(it) }

    fun view(index: Int): EditBlock {
        val block = items[index]
        val type = block.str("type").orEmpty()
        val props = block["props"] as? JsonObject ?: JsonObject(emptyMap())
        val children = (block["children"] as? JsonArray)?.size ?: 0
        val spans = parseInline(block["content"])
        val editability = checkEditable(type, block["content"])
        return EditBlock(
            index = index,
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

    /** 改文字；不可编辑的块返回 false（UI 侧本就不会给它输入框） */
    fun setText(index: Int, text: String): Boolean {
        val block = items[index]
        if (!checkEditable(block.str("type").orEmpty(), block["content"]).first) return false
        val styles = singleRunStyles(block["content"])
        items[index] = block.with("content", JsonArray(listOf(textRun(text, styles))))
        return true
    }

    /** 切类型：保留正文与 children，只改 type/props */
    fun setKind(index: Int, kind: BlockKind) {
        val block = items[index]
        val props = when (kind) {
            BlockKind.Heading1, BlockKind.Heading2, BlockKind.Heading3 ->
                JsonObject(mapOf("level" to JsonPrimitive(kind.level)))
            BlockKind.Check -> JsonObject(mapOf("checked" to JsonPrimitive(block["props"]?.let { (it as? JsonObject)?.bool("checked") } ?: false)))
            BlockKind.Code -> JsonObject(mapOf("language" to JsonPrimitive((block["props"] as? JsonObject)?.str("language").orEmpty())))
            BlockKind.Divider -> JsonObject(emptyMap())
            else -> JsonObject(emptyMap())
        }
        items[index] = block.with("type", JsonPrimitive(kind.wire)).with("props", props)
    }

    fun toggleCheck(index: Int) {
        val block = items[index]
        val props = block["props"] as? JsonObject ?: JsonObject(emptyMap())
        items[index] = block.with("props", props.with("checked", JsonPrimitive(!props.bool("checked"))))
    }

    /** 在 index 之后插入一个空块，返回新块 id */
    fun insertAfter(index: Int, kind: BlockKind = BlockKind.Paragraph): String {
        val block = newBlock(kind)
        items.add((index + 1).coerceIn(0, items.size), block)
        return block.str("id").orEmpty()
    }

    /** 追加到末尾（编辑器底的「+ 添加块」） */
    fun append(kind: BlockKind = BlockKind.Paragraph): String = insertAfter(items.size - 1, kind)

    fun delete(index: Int): Boolean {
        if (index !in items.indices) return false
        items.removeAt(index)
        return true
    }

    fun toJson(): String = JsonArray(items.toList()).toString()

    /* ---------------- 内部 ---------------- */

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
        // 先看块型认不认得：不认识的块（含 image/table/bookmark/collectionBlock 这些
        // 结构不在 content 里的）一律只读——写回去我们没把握，宁可不让改
        if (type !in EDITABLE_TYPES) {
            if (type == "divider") return false to "分割线没有文字"
            return false to "这个块型（$type）的编辑在后续任务接入"
        }
        val runs = parseInline(content)
        if (runs.isEmpty()) return true to null
        if (runs.size > 1) return false to "这个块含多段行内样式/链接，编辑在 A07 接入（先保持原样）"
        val only = runs.single()
        if (only !is InlineSpan.Text) return false to "这个块含页面提及，编辑在 A09 接入"
        if (only.href != null) return false to "这个块是链接文本，编辑在 A07 接入"
        val rich = only.bold || only.italic || only.underline || only.strike
        if (rich) return false to "这个块含加粗/斜体等样式，编辑在 A07 接入"
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
