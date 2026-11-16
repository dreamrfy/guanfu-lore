package app.guanfu.shell.ui

import app.guanfu.shell.db.PageEntity
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * 反向链接（A09）：谁在正文里 @ 了本页——web `data/backlinks.ts` 的 Kotlin 复刻。
 *
 * 语义照抄 web：
 *  - 跳过本页自己；每个来源页最多出一条
 *  - 找的是**第一个**含该提及的块；嵌套子块里也算（web 的 backlinks.test 明确覆盖）
 *  - snippet 是那个块的纯文本（提及节点用 `@标题` 参与拼字），截前 120 字
 *  - 页面标题为空时显示「无标题」
 */
data class Backlink(
    val pageId: String,
    val title: String,
    val blockId: String,
    val snippet: String,
)

private const val MENTION_TYPE = "pageMention"
private const val SNIPPET_MAX = 120

private val json = Json { ignoreUnknownKeys = true; isLenient = true }

fun findBacklinks(
    targetPageId: String,
    pages: List<PageEntity>,
    docsByPage: Map<String, String>,
): List<Backlink> {
    val out = mutableListOf<Backlink>()
    for (page in pages) {
        if (page.id == targetPageId) continue
        val blocksJson = docsByPage[page.id] ?: continue
        val blocks = runCatching { json.parseToJsonElement(blocksJson) as? JsonArray }.getOrNull() ?: continue
        val hit = findBlockMentioning(blocks, targetPageId) ?: continue
        out += Backlink(
            pageId = page.id,
            title = pageTitle(page),
            blockId = hit.first,
            snippet = hit.second.take(SNIPPET_MAX),
        )
    }
    return out
}

/** 深度优先找第一个含目标提及的块，返回 (块 id, 该块纯文本) */
private fun findBlockMentioning(blocks: JsonArray, targetId: String): Pair<String, String>? {
    for (element in blocks) {
        val block = element as? JsonObject ?: continue
        if (containsMention(block["content"], targetId)) {
            val id = (block["id"] as? JsonPrimitive)?.content.orEmpty()
            return id to blockText(block)
        }
        val children = block["children"] as? JsonArray
        if (children != null) {
            findBlockMentioning(children, targetId)?.let { return it }
        }
    }
    return null
}

/** 内联内容里是否 @ 了目标页（含嵌套 content / children） */
private fun containsMention(node: kotlinx.serialization.json.JsonElement?, targetId: String): Boolean = when (node) {
    null -> false
    is JsonArray -> node.any { containsMention(it, targetId) }
    is JsonObject -> {
        val isMention = (node["type"] as? JsonPrimitive)?.content == MENTION_TYPE &&
            (((node["props"] as? JsonObject)?.get("pageId") as? JsonPrimitive)?.content == targetId)
        isMention || containsMention(node["content"], targetId) || containsMention(node["children"], targetId)
    }
    else -> false
}

/** 块里可读的文字（提及节点用 `@标题` 参与拼接），用来给界面做上下文 */
private fun blockText(block: JsonObject): String {
    val parts = mutableListOf<String>()
    fun walk(node: kotlinx.serialization.json.JsonElement?) {
        when (node) {
            null -> return
            is JsonArray -> node.forEach { walk(it) }
            is JsonObject -> {
                (node["text"] as? JsonPrimitive)?.let { parts += it.content }
                if ((node["type"] as? JsonPrimitive)?.content == MENTION_TYPE) {
                    val title = ((node["props"] as? JsonObject)?.get("title") as? JsonPrimitive)?.content
                    parts += "@" + (title?.takeIf { it.isNotBlank() } ?: "页面")
                }
                walk(node["content"])
                walk(node["children"])
            }
            else -> return
        }
    }
    walk(block["content"])
    return parts.joinToString(separator = "").trim()
}
