package app.guanfu.shell.ui

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull

/**
 * 块解析（A05）：BlockNote 的块 JSON → 可渲染模型。
 *
 * 这一层刻意**不碰 Compose**，纯 Kotlin，好处是能用 JVM 单测把每种块型都钉死
 * （渲染层只负责画，解析层负责理解 web 的数据结构——两边分开，坏数据不会画崩）。
 *
 * 数据结构的真身（web 端 BlockNote 定义，见 app/src/editor/schema.ts）：
 *  - 块：{id, type, props, content, children}
 *  - 内联：text{styles{bold,italic,underline,strike,code}} / link{href, content[]} / pageMention{props{pageId,title}}
 *  - 表格：content={type:"tableContent", rows:[{cells:[{props, content[]} | 内联数组]}]}
 *  - 代码：content 是普通内联数组（BlockNote 的 "plain" 内容）
 *  - 图片：props.url 里存的是 `asset://<附件id>`（红线 G1：库里不出现完整图片 URL）
 */
sealed interface InlineSpan {
    data class Text(
        val text: String,
        val bold: Boolean = false,
        val italic: Boolean = false,
        val underline: Boolean = false,
        val strike: Boolean = false,
        val code: Boolean = false,
        val href: String? = null,
    ) : InlineSpan

    data class PageMention(val pageId: String, val title: String) : InlineSpan
}

sealed interface BlockNode {
    val id: String
    val children: List<BlockNode>
}

data class ParagraphNode(override val id: String, val spans: List<InlineSpan>, override val children: List<BlockNode> = emptyList()) : BlockNode
data class HeadingNode(override val id: String, val level: Int, val spans: List<InlineSpan>, override val children: List<BlockNode> = emptyList()) : BlockNode
data class BulletNode(override val id: String, val spans: List<InlineSpan>, override val children: List<BlockNode> = emptyList()) : BlockNode
data class NumberedNode(override val id: String, val spans: List<InlineSpan>, override val children: List<BlockNode> = emptyList()) : BlockNode
data class CheckNode(override val id: String, val checked: Boolean, val spans: List<InlineSpan>, override val children: List<BlockNode> = emptyList()) : BlockNode
data class QuoteNode(override val id: String, val spans: List<InlineSpan>, override val children: List<BlockNode> = emptyList()) : BlockNode
data class CalloutNode(override val id: String, val emoji: String, val spans: List<InlineSpan>, override val children: List<BlockNode> = emptyList()) : BlockNode
data class CodeNode(override val id: String, val code: String, val language: String, override val children: List<BlockNode> = emptyList()) : BlockNode
data class DividerNode(override val id: String, override val children: List<BlockNode> = emptyList()) : BlockNode
data class ImageNode(override val id: String, val url: String, val caption: String?, override val children: List<BlockNode> = emptyList()) : BlockNode
data class TableNode(override val id: String, val headerRows: Int, val rows: List<List<List<InlineSpan>>>, override val children: List<BlockNode> = emptyList()) : BlockNode
data class BookmarkNode(override val id: String, val url: String, val title: String, val description: String, override val children: List<BlockNode> = emptyList()) : BlockNode
data class CollectionRefNode(override val id: String, val collectionId: String, override val children: List<BlockNode> = emptyList()) : BlockNode

/** 未知块（BlockNote 加了新块型、或数据被手改）：降级显示类型名 + 原始 JSON 可查看 */
data class UnsupportedNode(override val id: String, val type: String, val rawJson: String, override val children: List<BlockNode> = emptyList()) : BlockNode

const val ASSET_SCHEME = "asset://"

private val json = Json { ignoreUnknownKeys = true; isLenient = true }

/** 块数组 JSON → 节点列表；坏 JSON 返回空列表（界面显示「没有正文」，不崩） */
fun parseBlocks(blocksJson: String?): List<BlockNode> {
    if (blocksJson.isNullOrBlank()) return emptyList()
    val array = runCatching { json.parseToJsonElement(blocksJson) as? JsonArray }.getOrNull() ?: return emptyList()
    return array.mapNotNull { element -> (element as? JsonObject)?.let { parseBlock(it) } }
}

fun parseBlock(block: JsonObject): BlockNode? {
    val type = block.str("type") ?: return null
    val id = block.str("id") ?: ""
    val props = block["props"] as? JsonObject ?: JsonObject(emptyMap())
    val children = (block["children"] as? JsonArray)?.mapNotNull { (it as? JsonObject)?.let(::parseBlock) } ?: emptyList()

    return when (type) {
        "paragraph" -> ParagraphNode(id, parseInline(block["content"]), children)
        "heading" -> HeadingNode(id, (props["level"] as? JsonPrimitive)?.intOrNull ?: 1, parseInline(block["content"]), children)
        "bulletListItem" -> BulletNode(id, parseInline(block["content"]), children)
        "numberedListItem" -> NumberedNode(id, parseInline(block["content"]), children)
        "checkListItem" -> CheckNode(id, props.bool("checked"), parseInline(block["content"]), children)
        "quote" -> QuoteNode(id, parseInline(block["content"]), children)
        "divider" -> DividerNode(id, children)
        "codeBlock" -> CodeNode(id, plainText(block["content"]), props.str("language").orEmpty(), children)
        "image" -> ImageNode(id, props.str("url").orEmpty(), props.str("caption")?.takeIf { it.isNotBlank() }, children)
        "callout" -> CalloutNode(id, props.str("emoji") ?: "💡", parseInline(block["content"]), children)
        "bookmark" -> BookmarkNode(
            id,
            props.str("url").orEmpty(),
            props.str("title").orEmpty(),
            props.str("description").orEmpty(),
            children,
        )
        "collectionBlock" -> CollectionRefNode(id, props.str("collectionId").orEmpty(), children)
        "table" -> parseTable(id, block["content"], children)
        else -> UnsupportedNode(id, type, block.toString(), children)
    }
}

private fun parseTable(id: String, content: JsonElement?, children: List<BlockNode>): BlockNode {
    val table = content as? JsonObject ?: return TableNode(id, 1, emptyList(), children)
    val headerRows = (table["headerRows"] as? JsonPrimitive)?.intOrNull ?: 1
    val rows = (table["rows"] as? JsonArray)?.map { row ->
        val cells = (row as? JsonObject)?.get("cells") as? JsonArray ?: JsonArray(emptyList())
        cells.map { cell ->
            when (cell) {
                is JsonArray -> parseInline(cell)
                is JsonObject -> parseInline(cell["content"])
                else -> emptyList()
            }
        }
    } ?: emptyList()
    return TableNode(id, headerRows, rows, children)
}

/** 内联内容：数组；也容忍 BlockNote 的「字符串简写」 */
fun parseInline(content: JsonElement?): List<InlineSpan> = when (content) {
    null -> emptyList()
    is JsonPrimitive -> if (content.isString && content.content.isNotEmpty()) {
        listOf(InlineSpan.Text(content.content))
    } else {
        emptyList()
    }
    is JsonArray -> content.flatMap { parseInlineItem(it) }
    else -> emptyList()
}

private fun parseInlineItem(element: JsonElement): List<InlineSpan> {
    val obj = element as? JsonObject ?: return emptyList()
    return when (obj.str("type")) {
        "text" -> {
            val styles = obj["styles"] as? JsonObject ?: JsonObject(emptyMap())
            listOf(
                InlineSpan.Text(
                    text = obj.str("text").orEmpty(),
                    bold = styles.bool("bold"),
                    italic = styles.bool("italic"),
                    underline = styles.bool("underline"),
                    strike = styles.bool("strike"),
                    code = styles.bool("code"),
                    href = obj.str("href"),
                ),
            )
        }
        // 链接：href 在外层，内容是被包住的一段文本
        "link" -> parseInline(obj["content"]).map { span ->
            if (span is InlineSpan.Text) span.copy(href = obj.str("href")) else span
        }
        "pageMention" -> {
            val props = obj["props"] as? JsonObject ?: JsonObject(emptyMap())
            listOf(InlineSpan.PageMention(props.str("pageId").orEmpty(), props.str("title").orEmpty()))
        }
        else -> emptyList()
    }
}

/** 纯文本（代码块用；也给别的调用方兜底） */
fun plainText(content: JsonElement?): String = when (content) {
    null -> ""
    is JsonPrimitive -> content.content
    is JsonArray -> content.joinToString(separator = "") { element ->
        when (element) {
            is JsonPrimitive -> element.content
            is JsonObject -> element.str("text").orEmpty()
            else -> ""
        }
    }
    else -> ""
}

fun inlineText(spans: List<InlineSpan>): String = spans.joinToString(separator = "") { span ->
    when (span) {
        is InlineSpan.Text -> span.text
        is InlineSpan.PageMention -> "@" + span.title.ifBlank { "页面" }
    }
}

/** `asset://<id>` → 附件 id；不是附件引用（外链/空）返回 null */
fun assetIdOf(url: String): String? =
    if (url.startsWith(ASSET_SCHEME)) url.removePrefix(ASSET_SCHEME).takeIf { it.isNotBlank() } else null

private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.content

/**
 * 布尔 props/styles：先按 JSON 布尔取，再容忍 "true" 字符串写法。
 * 注意别写成 `p?.booleanOrNull ?: p?.content == "true"`——Kotlin 里 elvis 的优先级**高于**
 * `==`，那句会被解析成 `(a ?: b) == "true"`，永远 false（A05 真踩过一次，单测逮住）。
 */
private fun JsonObject.bool(key: String): Boolean {
    val primitive = this[key] as? JsonPrimitive ?: return false
    return primitive.booleanOrNull ?: (primitive.content == "true")
}
