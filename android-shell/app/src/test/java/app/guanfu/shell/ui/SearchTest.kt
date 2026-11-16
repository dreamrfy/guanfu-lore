package app.guanfu.shell.ui

import app.guanfu.shell.db.PageEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 全文搜索：复刻 web data/search.ts 的标题优先 / 单页 5 条 / 片段位置（A04） */
class SearchTest {

    private fun page(id: String, title: String) = PageEntity(
        id = id,
        parentId = null,
        title = title,
        icon = null,
        coverAssetId = null,
        createdAt = 1L,
        updatedAt = 1L,
        deletedAt = null,
        sortKey = 1.0,
        tags = null,
    )

    private fun blocks(vararg texts: String): String =
        texts.mapIndexed { index, text ->
            """{"id":"b$index","type":"paragraph","props":{},"content":[{"type":"text","text":"$text","styles":{}}],"children":[]}"""
        }.joinToString(prefix = "[", postfix = "]")

    @Test
    fun extractBlocksText_pullsTextAndNestedChildren() {
        val json = """
            [
              {"id":"b1","type":"paragraph","content":[{"type":"text","text":"外层文字"}],
               "children":[{"id":"b2","type":"bulletListItem","content":[{"type":"text","text":"子块文字"}],"children":[]}]},
              {"id":"b3","type":"paragraph","content":[],"children":[]}
            ]
        """.trimIndent()
        assertEquals(
            listOf("b1" to "外层文字", "b2" to "子块文字"),
            extractBlocksText(json).map { it.blockId to it.text },
        )
    }

    @Test
    fun extractBlocksText_brokenJsonReturnsEmpty() {
        assertTrue(extractBlocksText("{not json").isEmpty())
        assertTrue(extractBlocksText("{}").isEmpty())
    }

    @Test
    fun searchAll_titleHitComesFirst() {
        val pages = listOf(
            page("body", "普通页"),
            page("title", "关键词在标题"),
        )
        val docs = mapOf("body" to blocks("正文里也有关键词"))
        val groups = searchAll(pages, docs, "关键词")
        assertEquals(listOf("title", "body"), groups.map { it.pageId })
        assertEquals("", groups.first().hits.first().blockId)
        assertEquals("b0", groups.last().hits.first().blockId)
    }

    @Test
    fun searchAll_snippetHasHighlightPosition() {
        val text = "开头".repeat(30) + "关键词" + "结尾".repeat(30)
        val groups = searchAll(listOf(page("p", "标题")), mapOf("p" to blocks(text)), "关键词")
        val hit = groups.single().hits.single()
        val highlighted = hit.snippet.substring(hit.start, hit.end)
        assertEquals("关键词", highlighted)
        assertTrue(hit.snippet.startsWith("…"))
        assertTrue(hit.snippet.endsWith("…"))
    }

    @Test
    fun searchAll_limitsHitsPerPageToFive() {
        val blocksJson = blocks("词", "词", "词", "词", "词", "词", "词")
        val hitCount = searchAll(listOf(page("p", "标题")), mapOf("p" to blocksJson), "词")
            .single().hits.size
        assertEquals(5, hitCount)
    }

    @Test
    fun searchAll_emptyQueryReturnsNothing() {
        assertTrue(searchAll(listOf(page("p", "标题")), emptyMap(), "   ").isEmpty())
    }

    @Test
    fun searchAll_isCaseInsensitive() {
        val groups = searchAll(listOf(page("p", "Hello World")), emptyMap(), "hello")
        assertEquals("p", groups.single().pageId)
    }
}
