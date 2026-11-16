package app.guanfu.shell.ui

import app.guanfu.shell.db.PageEntity
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * 全文搜索（A04）：web `data/search.ts` 的 Kotlin 复刻。
 *
 * 语义照抄 web（个人知识库量级下扫内存足够，换真搜索引擎时只改这一层）：
 *  - 标题命中排最前，正文按块命中，单页最多 5 条（避免长文刷屏）
 *  - 结果总上限 40 页
 *  - 片段前后各留 36 字符，命中位置带 start/end 给界面加亮
 */
data class PlainText(val blockId: String, val text: String)

data class SearchHit(
    val pageId: String,
    val title: String,
    val blockId: String,
    val snippet: String,
    val start: Int,
    val end: Int,
)

data class SearchGroup(val pageId: String, val title: String, val hits: List<SearchHit>)

private const val SNIPPET_PAD = 36
private const val MAX_HITS_PER_PAGE = 5
private const val DEFAULT_LIMIT = 40

private val json = Json { ignoreUnknownKeys = true; isLenient = true }

/** 从 BlockNote 块 JSON 里按块抽纯文本（含嵌套子块、链接文字；块 id 用于定位） */
fun extractBlocksText(blocksJson: String): List<PlainText> {
    val root = runCatching { json.parseToJsonElement(blocksJson) as? JsonArray }.getOrNull()
        ?: return emptyList()
    val out = mutableListOf<PlainText>()

    fun textOf(node: JsonElement?): String = when (node) {
        null -> ""
        is JsonPrimitive -> if (node.isString) node.content else ""
        is JsonArray -> node.joinToString(separator = "") { textOf(it) }
        is JsonObject -> {
            val direct = node["text"] as? JsonPrimitive
            if (direct?.isString == true) direct.content else textOf(node["content"])
        }
    }

    fun walk(list: JsonArray) {
        for (element in list) {
            val block = element as? JsonObject ?: continue
            val blockId = (block["id"] as? JsonPrimitive)?.content ?: ""
            val text = textOf(block["content"])
            if (blockId.isNotEmpty() && text.isNotBlank()) out += PlainText(blockId, text)
            (block["children"] as? JsonArray)?.let { walk(it) }
        }
    }

    walk(root)
    return out
}

private data class Snippet(val snippet: String, val start: Int, val end: Int)

private fun makeSnippet(text: String, at: Int, len: Int): Snippet {
    val from = (at - SNIPPET_PAD).coerceAtLeast(0)
    val to = (at + len + SNIPPET_PAD).coerceAtMost(text.length)
    val prefix = if (from > 0) "…" else ""
    val suffix = if (to < text.length) "…" else ""
    val snippet = prefix + text.substring(from, to) + suffix
    val start = prefix.length + (at - from)
    return Snippet(snippet, start, start + len)
}

fun searchAll(
    pages: List<PageEntity>,
    docsByPage: Map<String, String>,
    query: String,
    limit: Int = DEFAULT_LIMIT,
): List<SearchGroup> {
    val q = query.trim().lowercase()
    if (q.isEmpty()) return emptyList()

    val groups = mutableListOf<SearchGroup>()
    for (page in pages) {
        val title = pageTitle(page)
        val hits = mutableListOf<SearchHit>()

        val titleAt = title.lowercase().indexOf(q)
        if (titleAt >= 0) {
            val s = makeSnippet(title, titleAt, q.length)
            hits += SearchHit(page.id, title, "", s.snippet, s.start, s.end)
        }

        docsByPage[page.id]?.let { blocks ->
            for (plain in extractBlocksText(blocks)) {
                val at = plain.text.lowercase().indexOf(q)
                if (at < 0) continue
                val s = makeSnippet(plain.text, at, q.length)
                hits += SearchHit(page.id, title, plain.blockId, s.snippet, s.start, s.end)
                if (hits.size >= MAX_HITS_PER_PAGE) break
            }
        }

        if (hits.isNotEmpty()) groups += SearchGroup(page.id, title, hits)
        if (groups.size >= limit) break
    }

    // 标题命中的页排前面（web searchAll 末尾同语义）
    return groups.sortedByDescending { if (it.hits.first().blockId.isEmpty()) 1 else 0 }
}
