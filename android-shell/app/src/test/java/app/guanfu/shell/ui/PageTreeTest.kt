package app.guanfu.shell.ui

import app.guanfu.shell.db.PageEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 侧栏树 / 标签：复刻 web Sidebar.buildTree 与 pageTags 的边界（A04） */
class PageTreeTest {

    private fun page(
        id: String,
        parentId: String? = null,
        title: String = id,
        tags: String? = null,
        deletedAt: Long? = null,
        sortKey: Double = 1.0,
    ) = PageEntity(
        id = id,
        parentId = parentId,
        title = title,
        icon = null,
        coverAssetId = null,
        createdAt = 1L,
        updatedAt = 1L,
        deletedAt = deletedAt,
        sortKey = sortKey,
        tags = tags,
    )

    @Test
    fun buildTree_nestsChildrenInInputOrder() {
        val pages = listOf(
            page("b", sortKey = 2.0),
            page("a", sortKey = 1.0),
            page("a1", parentId = "a", sortKey = 3.0),
        )
        // 入参顺序即仓库顺序（ORDER BY sortKey），树不重排
        assertEquals(
            listOf("b" to 0, "a" to 0, "a1" to 1),
            buildTree(pages).map { it.id to it.depth },
        )
    }

    @Test
    fun buildTree_orphanFallsBackToTopLevel() {
        val pages = listOf(page("child", parentId = "missing-parent"))
        val tree = buildTree(pages)
        assertEquals(listOf("child"), tree.map { it.id })
        assertEquals(0, tree.single().depth)
    }

    @Test
    fun buildTree_cycleIsGuarded() {
        val pages = listOf(
            page("a", parentId = "b"),
            page("b", parentId = "a"),
        )
        // 环上的两个页面都要出现且各一次，不能死循环
        val tree = buildTree(pages)
        assertEquals(2, tree.size)
        assertEquals(tree.size, tree.map { it.id }.toSet().size)
    }

    @Test
    fun buildTree_excludesDeletedPages() {
        val pages = listOf(page("live"), page("trashed", deletedAt = 9L))
        assertEquals(listOf("live"), buildTree(pages).map { it.id })
    }

    @Test
    fun buildTree_blankTitleFallsBackToUntitled() {
        val pages = listOf(page("x", title = "  "))
        assertEquals("无标题", buildTree(pages).single().title)
    }

    @Test
    fun parseTags_handlesNullAndBrokenJson() {
        assertTrue(parseTags(null).isEmpty())
        assertTrue(parseTags("not-json").isEmpty())
        assertEquals(listOf("A", "B"), parseTags("[\"A\",\"B\"]"))
    }

    @Test
    fun tagCounts_ignoresDeletedAndSortsByCountThenName() {
        val pages = listOf(
            page("p1", tags = "[\"工作\",\"灵感\"]"),
            page("p2", tags = "[\"工作\"]"),
            page("p3", tags = "[\"灵感\",\"归档\"]", deletedAt = 5L),
        )
        assertEquals(listOf("工作" to 2, "灵感" to 1), tagCounts(pages))
    }

    @Test
    fun pagesWithTag_filtersActivePagesOnly() {
        val pages = listOf(
            page("p1", tags = "[\"工作\"]"),
            page("p2", tags = "[\"工作\"]", deletedAt = 5L),
            page("p3", tags = "[\"生活\"]"),
        )
        assertEquals(listOf("p1"), pagesWithTag(pages, "工作").map { it.id })
    }
}
