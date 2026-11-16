package app.guanfu.shell.ui

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** A07 树形编辑：缩进/反缩进/拖拽移动/删除提升子块 */
class DocEditorTreeTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private fun block(id: String, text: String = id, children: String = "[]") =
        """{"id":"$id","type":"paragraph","props":{},"content":[{"type":"text","text":"$text","styles":{}}],"children":$children}"""

    private fun editor(vararg blocks: String): DocEditor {
        var counter = 0
        return DocEditor(blocks.joinToString(prefix = "[", postfix = "]")) { "new-${++counter}" }
    }

    private fun ids(e: DocEditor): List<String> = e.views().map { it.id }
    private fun jsonIds(e: DocEditor): List<String> =
        json.parseToJsonElement(e.toJson()).jsonArray.map { it.jsonObject["id"]!!.jsonPrimitive.content }

    @Test
    fun indent_makesBlockChildOfPreviousSibling() {
        val e = editor(block("a"), block("b"), block("c"))
        assertTrue(e.indent(listOf(1)))
        assertEquals(listOf("a", "b", "c"), ids(e))
        assertEquals(listOf(0, 1, 0), e.views().map { it.depth })
        // JSON 里 b 必须真的进了 a 的 children
        val a = json.parseToJsonElement(e.toJson()).jsonArray[0].jsonObject
        assertEquals("b", (a["children"] as JsonArray)[0].jsonObject["id"]!!.jsonPrimitive.content)
        assertEquals(2, e.size)
    }

    @Test
    fun indent_firstSiblingIsRefused() {
        val e = editor(block("a"), block("b"))
        assertFalse(e.indent(listOf(0)))
        assertEquals(listOf("a", "b"), ids(e))
    }

    @Test
    fun outdent_promotesChildToSiblingAfterParent() {
        val e = editor(block("a", children = "[${block("b")}]"), block("c"))
        assertEquals(listOf("a", "b", "c"), ids(e))
        assertTrue(e.outdent(listOf(0, 0)))
        assertEquals(listOf("a", "b", "c"), jsonIds(e))
        assertEquals(listOf(0, 0, 0), e.views().map { it.depth })
    }

    @Test
    fun outdent_atRootIsRefused() {
        val e = editor(block("a"))
        assertFalse(e.outdent(listOf(0)))
    }

    @Test
    fun moveTo_reordersWithinSameParent() {
        val e = editor(block("a"), block("b"), block("c"))
        assertTrue(e.moveTo(listOf(2), listOf(0), after = false))
        assertEquals(listOf("c", "a", "b"), ids(e))
        assertTrue(e.moveTo(listOf(1), listOf(2), after = true))
        assertEquals(listOf("c", "b", "a"), ids(e))
    }

    @Test
    fun moveTo_refusesOwnSubtree() {
        val e = editor(block("a", children = "[${block("b")}]"))
        assertFalse(e.moveTo(listOf(0), listOf(0, 0), after = true))
        assertFalse(e.moveTo(listOf(0), listOf(0), after = false))
        // 结构没被破坏
        assertEquals(listOf("a", "b"), ids(e))
    }

    @Test
    fun moveTo_canCrossParents() {
        val e = editor(block("a", children = "[${block("x")}]"), block("b"))
        assertTrue(e.moveTo(listOf(0, 0), listOf(1), after = true))
        assertEquals(listOf("a", "b", "x"), ids(e))
        assertEquals(listOf(0, 0, 0), e.views().map { it.depth })
    }

    @Test
    fun delete_parentPromotesChildrenInsteadOfDroppingThem() {
        val e = editor(block("a", children = "[${block("b")},${block("c")}]"), block("d"))
        assertTrue(e.delete(listOf(0)))
        assertEquals(listOf("b", "c", "d"), jsonIds(e))
        // 子块内容也要还在
        assertTrue(e.toJson().contains("\"text\":\"c\""))
    }

    @Test
    fun setText_worksOnNestedPath() {
        val e = editor(block("a", children = "[${block("b", "旧")}]"))
        assertTrue(e.setText(listOf(0, 0), "新"))
        val a = json.parseToJsonElement(e.toJson()).jsonArray[0].jsonObject
        val b = (a["children"] as JsonArray)[0].jsonObject
        assertEquals("新", (b["content"] as JsonArray)[0].jsonObject["text"]!!.jsonPrimitive.content)
    }

    @Test
    fun untouchedUnknownFieldsAndChildrenSurviveTreeEdits() {
        val exotic = """{"id":"x","type":"someFutureBlock","props":{"answer":42},"content":[],"futureKey":"keep","children":[${block("kid")}]}"""
        val e = editor(block("a"), exotic)
        assertTrue(e.moveTo(listOf(1), listOf(0), after = true))
        val text = e.toJson()
        assertTrue(text.contains("futureKey"))
        assertTrue(text.contains("\"answer\":42"))
        assertTrue(text.contains("\"kid\""))
    }
}
