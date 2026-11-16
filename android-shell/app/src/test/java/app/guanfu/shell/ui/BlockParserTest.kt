package app.guanfu.shell.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** 块解析：把 web 端 BlockNote 的每种块型钉死在单测里（A05） */
class BlockParserTest {

    @Test
    fun parseBlocks_handlesParagraphWithStylesAndLink() {
        val json = """
            [{"id":"b1","type":"paragraph","props":{},"content":[
              {"type":"text","text":"加粗","styles":{"bold":true}},
              {"type":"text","text":"普通","styles":{}},
              {"type":"link","href":"https://example.com","content":[{"type":"text","text":"链接","styles":{}}]}
            ],"children":[]}]
        """.trimIndent()
        val node = parseBlocks(json).single() as ParagraphNode
        assertEquals(3, node.spans.size)
        assertTrue((node.spans[0] as InlineSpan.Text).bold)
        assertEquals("https://example.com", (node.spans[2] as InlineSpan.Text).href)
        assertEquals("加粗普通链接", inlineText(node.spans))
    }

    @Test
    fun parseBlocks_headingLevelDefaultsToOne() {
        val json = """[{"id":"h","type":"heading","props":{"level":2},"content":[{"type":"text","text":"标题","styles":{}}]}]"""
        assertEquals(2, (parseBlocks(json).single() as HeadingNode).level)
    }

    @Test
    fun parseBlocks_checkListKeepsCheckedState() {
        val json = """
            [{"id":"c1","type":"checkListItem","props":{"checked":true},"content":[{"type":"text","text":"做完了","styles":{}}]},
             {"id":"c2","type":"checkListItem","props":{"checked":false},"content":[{"type":"text","text":"没做","styles":{}}]}]
        """.trimIndent()
        val nodes = parseBlocks(json)
        assertTrue((nodes[0] as CheckNode).checked)
        assertTrue(!(nodes[1] as CheckNode).checked)
    }

    @Test
    fun parseBlocks_quoteBulletNumberedDivider() {
        val json = """
            [{"id":"q","type":"quote","content":[{"type":"text","text":"引用","styles":{}}]},
             {"id":"b","type":"bulletListItem","content":[{"type":"text","text":"项","styles":{}}]},
             {"id":"n","type":"numberedListItem","content":[{"type":"text","text":"序","styles":{}}]},
             {"id":"d","type":"divider"}]
        """.trimIndent()
        val nodes = parseBlocks(json)
        assertEquals(4, nodes.size)
        assertTrue(nodes[0] is QuoteNode)
        assertTrue(nodes[1] is BulletNode)
        assertTrue(nodes[2] is NumberedNode)
        assertTrue(nodes[3] is DividerNode)
    }

    @Test
    fun parseBlocks_codeBlockUsesPlainContent() {
        val json = """[{"id":"c","type":"codeBlock","props":{"language":"kotlin"},"content":[{"type":"text","text":"val x = 1","styles":{}}]}]"""
        val node = parseBlocks(json).single() as CodeNode
        assertEquals("kotlin", node.language)
        assertEquals("val x = 1", node.code)
    }

    @Test
    fun parseBlocks_imageKeepsAssetRefAndCaption() {
        val json = """[{"id":"i","type":"image","props":{"url":"asset://a-1","caption":"截图"},"content":[]}]"""
        val node = parseBlocks(json).single() as ImageNode
        assertEquals("a-1", assetIdOf(node.url))
        assertEquals("截图", node.caption)
        assertNull(assetIdOf("https://example.com/x.png"))
    }

    @Test
    fun parseBlocks_tableReadsHeaderRowsAndCells() {
        val json = """
            [{"id":"t","type":"table","props":{},"content":{"type":"tableContent","columnWidths":[null,null],"headerRows":1,
              "rows":[
                {"cells":[{"type":"tableCell","props":{},"content":[{"type":"text","text":"名称","styles":{}}]},
                          {"type":"tableCell","props":{},"content":[{"type":"text","text":"数量","styles":{}}]}]},
                {"cells":[{"type":"tableCell","props":{},"content":[{"type":"text","text":"苹果","styles":{}}]},
                          {"type":"tableCell","props":{},"content":[{"type":"text","text":"2","styles":{}}]}]}
              ]}}]
        """.trimIndent()
        val node = parseBlocks(json).single() as TableNode
        assertEquals(1, node.headerRows)
        assertEquals(2, node.rows.size)
        assertEquals("名称", inlineText(node.rows[0][0]))
        assertEquals("2", inlineText(node.rows[1][1]))
    }

    @Test
    fun parseBlocks_calloutBookmarkCollectionBlock() {
        val json = """
            [{"id":"k","type":"callout","props":{"emoji":"⚠️"},"content":[{"type":"text","text":"注意","styles":{}}]},
             {"id":"bm","type":"bookmark","props":{"url":"https://a.com","title":"标题","description":"描述"}},
             {"id":"cb","type":"collectionBlock","props":{"collectionId":"col-1"}}]
        """.trimIndent()
        val nodes = parseBlocks(json)
        assertEquals("⚠️", (nodes[0] as CalloutNode).emoji)
        assertEquals("标题", (nodes[1] as BookmarkNode).title)
        assertEquals("col-1", (nodes[2] as CollectionRefNode).collectionId)
    }

    @Test
    fun parseBlocks_pageMentionInline() {
        val json = """[{"id":"p","type":"paragraph","content":[{"type":"text","text":"见 "},{"type":"pageMention","props":{"pageId":"p2","title":"目标页"}}]}]"""
        val node = parseBlocks(json).single() as ParagraphNode
        assertEquals("见 @目标页", inlineText(node.spans))
        assertEquals("p2", (node.spans[1] as InlineSpan.PageMention).pageId)
    }

    @Test
    fun parseBlocks_unknownTypeDegradesWithRawJson() {
        val json = """[{"id":"x","type":"someFutureBlock","props":{"a":1},"content":[]}]"""
        val node = parseBlocks(json).single() as UnsupportedNode
        assertEquals("someFutureBlock", node.type)
        assertTrue(node.rawJson.contains("\"a\""))
    }

    @Test
    fun parseBlocks_nestedChildrenAreKept() {
        val json = """
            [{"id":"b1","type":"bulletListItem","content":[{"type":"text","text":"父","styles":{}}],
              "children":[{"id":"b2","type":"paragraph","content":[{"type":"text","text":"子","styles":{}}],"children":[]}]}]
        """.trimIndent()
        val node = parseBlocks(json).single()
        assertEquals("子", inlineText((node.children.single() as ParagraphNode).spans))
    }

    @Test
    fun parseBlocks_brokenOrEmptyJsonReturnsEmpty() {
        assertTrue(parseBlocks("not-json").isEmpty())
        assertTrue(parseBlocks(null).isEmpty())
        assertTrue(parseBlocks("[]").isEmpty())
    }
}
