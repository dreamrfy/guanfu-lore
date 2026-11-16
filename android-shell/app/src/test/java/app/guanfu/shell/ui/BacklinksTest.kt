package app.guanfu.shell.ui

import app.guanfu.shell.db.PageEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** A09 反向链接：谁在正文里 @ 了本页（对齐 web data/backlinks.ts 语义） */
class BacklinksTest {

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

    private fun mention(pageId: String, title: String) =
        """{"type":"pageMention","props":{"pageId":"$pageId","title":"$title"}}"""

    /** 段落：text + 可选的额外内联节点（逗号由这里补，调用方不用管） */
    private fun paragraph(id: String, text: String, extraNode: String? = null): String {
        val nodes = buildList {
            add("""{"type":"text","text":"$text","styles":{}}""")
            if (extraNode != null) add(extraNode)
        }
        return """{"id":"$id","type":"paragraph","props":{},"content":[${nodes.joinToString(",")}],"children":[]}"""
    }

    private fun doc(vararg blocks: String) = blocks.joinToString(prefix = "[", postfix = "]", separator = ",")

    @Test
    fun `找到提到目标页的来源页并给出上下文`() {
        val pages = listOf(page("p1", "会议记录"), page("p2", "设计稿"), page("p3", "随笔"))
        val docs = mapOf(
            "p1" to doc(paragraph("b1", "参考 ", mention("p2", "设计稿"))),
            "p3" to doc(paragraph("b9", "无关内容")),
        )
        val links = findBacklinks("p2", pages, docs)
        assertEquals(1, links.size)
        assertEquals("p1", links[0].pageId)
        assertEquals("会议记录", links[0].title)
        assertEquals("b1", links[0].blockId)
        assertEquals("参考 @设计稿", links[0].snippet)
    }

    @Test
    fun `跳过本页自己`() {
        val pages = listOf(page("p2", "设计稿"))
        val docs = mapOf("p2" to doc(paragraph("b1", "自引用 ", mention("p2", "设计稿"))))
        assertTrue(findBacklinks("p2", pages, docs).isEmpty())
    }

    @Test
    fun `嵌套子块里的提及也算`() {
        val nested = """{"id":"b1","type":"bulletListItem","props":{},"content":[{"type":"text","text":"父块","styles":{}}],""" +
            """"children":[${paragraph("b2", "子块 ", mention("p2", "设计稿"))}]}"""
        val links = findBacklinks("p2", listOf(page("p1", "来源")), mapOf("p1" to doc(nested)))
        assertEquals(1, links.size)
        assertEquals("b2", links[0].blockId)
        assertEquals("子块 @设计稿", links[0].snippet)
    }

    @Test
    fun `每页只出一条且 snippet 截断到 120 字`() {
        val long = "长".repeat(200)
        val docs = mapOf(
            "p1" to doc(
                paragraph("b1", long, mention("p2", "设计稿")),
                paragraph("b2", "再次提到 ", mention("p2", "设计稿")),
            ),
        )
        val links = findBacklinks("p2", listOf(page("p1", "来源")), docs)
        assertEquals(1, links.size)
        assertEquals("b1", links[0].blockId)
        assertEquals(120, links[0].snippet.length)
    }

    @Test
    fun `没有正文或坏 JSON 的页面安全跳过`() {
        val docs = mapOf("p1" to "{不是 JSON", "p2" to "")
        val links = findBacklinks("p9", listOf(page("p1", "A"), page("p2", "B"), page("p3", "C")), docs)
        assertTrue(links.isEmpty())
    }

    @Test
    fun `提及别的页面不算`() {
        val docs = mapOf("p1" to doc(paragraph("b1", "提到 ", mention("pX", "别的页"))))
        assertTrue(findBacklinks("p2", listOf(page("p1", "来源")), docs).isEmpty())
    }

    @Test
    fun `标题为空时回退到无标题`() {
        val docs = mapOf("p1" to doc(paragraph("b1", "见 ", mention("p2", "设计稿"))))
        val links = findBacklinks("p2", listOf(page("p1", "   ")), docs)
        assertEquals("无标题", links[0].title)
    }
}
