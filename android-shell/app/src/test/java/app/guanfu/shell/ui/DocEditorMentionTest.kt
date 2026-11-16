package app.guanfu.shell.ui

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** A09 在正文里插入 @页面提及：只加不改，节点形状对齐 web 的 pageMention spec */
class DocEditorMentionTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private fun editor(vararg blocks: String) = DocEditor(
        blocks.joinToString(prefix = "[", postfix = "]", separator = ","),
    ) { "new-id" }

    private fun paragraph(id: String, text: String, styles: String = "{}") =
        """{"id":"$id","type":"paragraph","props":{},"content":[{"type":"text","text":"$text","styles":$styles}],"children":[]}"""

    @Test
    fun `追加提及时保留原有文字与样式`() {
        val e = editor(paragraph("b1", "参考 ", """{"bold":true}"""))
        assertTrue(e.appendMention(listOf(0), "p2", "设计稿"))

        val content = json.parseToJsonElement(e.toJson()).jsonArray[0].jsonObject["content"]!!.jsonArray
        assertEquals(2, content.size)
        // 原 run 一字未动（连加粗样式都在）
        assertEquals("参考 ", content[0].jsonObject["text"]!!.jsonPrimitive.content)
        assertEquals("true", content[0].jsonObject["styles"]!!.jsonObject["bold"]!!.jsonPrimitive.content)
        // 新节点形状 = web 的 pageMention spec：只有 type 与 props（无 content 键）
        val node = content[1].jsonObject
        assertEquals("pageMention", node["type"]!!.jsonPrimitive.content)
        assertEquals("p2", node["props"]!!.jsonObject["pageId"]!!.jsonPrimitive.content)
        assertEquals("设计稿", node["props"]!!.jsonObject["title"]!!.jsonPrimitive.content)
        assertFalse(node.containsKey("content"))
    }

    @Test
    fun `空段落也能直接插入提及`() {
        val e = editor(paragraph("b1", ""))
        assertTrue(e.appendMention(listOf(0), "p3", "随笔"))
        val content = json.parseToJsonElement(e.toJson()).jsonArray[0].jsonObject["content"]!!.jsonArray
        assertEquals(2, content.size)
        assertEquals("pageMention", content[1].jsonObject["type"]!!.jsonPrimitive.content)
    }

    @Test
    fun `表格与分割线等块拒绝插入提及`() {
        val table = """{"id":"t","type":"table","props":{},"content":{"type":"tableContent","headerRows":0,"rows":[]},"children":[]}"""
        val divider = """{"id":"d","type":"divider","props":{},"content":[],"children":[]}"""
        val image = """{"id":"i","type":"image","props":{"url":"asset://a"},"content":[],"children":[]}"""
        val e = editor(table, divider, image)
        assertFalse(e.appendMention(listOf(0), "p2", "设计稿"))
        assertFalse(e.appendMention(listOf(1), "p2", "设计稿"))
        assertFalse(e.appendMention(listOf(2), "p2", "设计稿"))
        assertFalse(e.appendMention(listOf(9), "p2", "设计稿"))
    }

    @Test
    fun `子块路径上也能插入提及且父块不变`() {
        val parent = """{"id":"b1","type":"bulletListItem","props":{},"content":[{"type":"text","text":"父","styles":{}}],""" +
            """"children":[${paragraph("b2", "子 ")}]}"""
        val e = editor(parent)
        assertTrue(e.appendMention(listOf(0, 0), "p2", "设计稿"))

        val block = json.parseToJsonElement(e.toJson()).jsonArray[0].jsonObject
        assertEquals("父", block["content"]!!.jsonArray[0].jsonObject["text"]!!.jsonPrimitive.content)
        val child = block["children"]!!.jsonArray[0].jsonObject
        assertEquals(2, child["content"]!!.jsonArray.size)
        assertEquals("pageMention", child["content"]!!.jsonArray[1].jsonObject["type"]!!.jsonPrimitive.content)
    }

    @Test
    fun `插入提及后块文本包含 @标题`() {
        val e = editor(paragraph("b1", "见 "))
        e.appendMention(listOf(0), "p2", "设计稿")
        assertEquals("见 @设计稿", e.view(0).text)
    }
}
