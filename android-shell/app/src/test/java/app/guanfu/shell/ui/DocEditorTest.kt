package app.guanfu.shell.ui

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** 正文编辑模型（A06）：改过的按规矩改、没碰的一个字节不动 */
class DocEditorTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private var counter = 0
    private fun editor(json: String?) = DocEditor(json) { "new-${++counter}" }

    private fun doc(vararg blocks: String) = blocks.joinToString(prefix = "[", postfix = "]", separator = ",")

    private fun paragraph(id: String, text: String, styles: String = "{}") =
        """{"id":"$id","type":"paragraph","props":{},"content":[{"type":"text","text":"$text","styles":$styles}],"children":[]}"""

    @Test
    fun setText_updatesTextAndKeepsStyles() {
        val e = editor(doc(paragraph("b1", "旧", """{"code":true}""")))
        assertTrue(e.setText(0, "新"))
        val block = json.parseToJsonElement(e.toJson()).jsonArray[0].jsonObject
        assertEquals("新", block["content"]!!.jsonArray[0].jsonObject["text"]!!.jsonPrimitive.content)
        // 原样式原样保留（整块行内代码改字后还是行内代码）
        assertEquals(true, block["content"]!!.jsonArray[0].jsonObject["styles"]!!.jsonObject["code"]!!.jsonPrimitive.content.toBoolean())
    }

    @Test
    fun setText_refusesRichInlineBlock() {
        val rich = """{"id":"b1","type":"paragraph","props":{},"content":[
            {"type":"text","text":"加粗","styles":{"bold":true}},{"type":"text","text":"普通","styles":{}}],"children":[]}"""
        val e = editor(doc(rich))
        val view = e.view(0)
        assertFalse(view.editable)
        assertTrue(view.hint!!.contains("A07"))
        assertFalse(e.setText(0, "改"))
        // 拒绝之后内容必须还是原来的
        assertTrue(e.toJson().contains("加粗"))
    }

    @Test
    fun setText_refusesLinkAndMention() {
        val link = """{"id":"b1","type":"paragraph","props":{},"content":[{"type":"link","href":"https://a.com","content":[{"type":"text","text":"链接","styles":{}}]}],"children":[]}"""
        val mention = """{"id":"b2","type":"paragraph","props":{},"content":[{"type":"pageMention","props":{"pageId":"p2","title":"页"}}],"children":[]}"""
        assertFalse(editor(doc(link)).view(0).editable)
        assertFalse(editor(doc(mention)).view(0).editable)
    }

    @Test
    fun setText_allowsEmptyAndPlainBlocks() {
        assertTrue(editor(doc(paragraph("b1", ""))).view(0).editable)
        assertTrue(editor(doc(paragraph("b1", "普通文本"))).view(0).editable)
        assertTrue(editor("[]") .append().isNotEmpty())
    }

    @Test
    fun setKind_switchesTypeAndProps() {
        val e = editor(doc(paragraph("b1", "标题文本")))
        e.setKind(0, BlockKind.Heading2)
        val block = json.parseToJsonElement(e.toJson()).jsonArray[0].jsonObject
        assertEquals("heading", block["type"]!!.jsonPrimitive.content)
        assertEquals(2, block["props"]!!.jsonObject["level"]!!.jsonPrimitive.int)
        // 正文不丢
        assertEquals("标题文本", block["content"]!!.jsonArray[0].jsonObject["text"]!!.jsonPrimitive.content)
        assertEquals(BlockKind.Heading2, e.view(0).kind)
    }

    @Test
    fun toggleCheck_flipsChecked() {
        val check = """{"id":"c1","type":"checkListItem","props":{"checked":false},"content":[{"type":"text","text":"待办","styles":{}}],"children":[]}"""
        val e = editor(doc(check))
        assertFalse(e.view(0).checked)
        e.toggleCheck(0)
        assertTrue(e.view(0).checked)
        assertTrue(e.toJson().contains("\"checked\":true"))
    }

    @Test
    fun insertAfter_and_append_placeNewBlocksCorrectly() {
        val e = editor(doc(paragraph("b1", "一"), paragraph("b2", "二")))
        val newId = e.insertAfter(0)
        assertEquals(3, e.size)
        assertEquals(newId, e.view(1).id)
        assertEquals("一", e.view(0).text)
        assertEquals("二", e.view(2).text)
        e.append(BlockKind.Heading1)
        assertEquals(BlockKind.Heading1, e.view(3).kind)
    }

    @Test
    fun delete_removesBlock() {
        val e = editor(doc(paragraph("b1", "一"), paragraph("b2", "二")))
        assertTrue(e.delete(0))
        assertEquals(1, e.size)
        assertEquals("二", e.view(0).text)
        assertFalse(e.delete(5))
    }

    @Test
    fun untouchedFieldsSurviveRoundTrip() {
        val exotic = """{"id":"x","type":"someFutureBlock","props":{"answer":42,"nested":{"a":[1,2]}},"content":[],"children":[{"id":"kid","type":"paragraph","props":{},"content":[{"type":"text","text":"子","styles":{}}],"children":[]}],"futureKey":"keep me"}"""
        val e = editor(doc(exotic, paragraph("b2", "二")))
        e.setText(1, "改过的")
        val text = e.toJson()
        assertTrue(text.contains("\"futureKey\""))
        assertTrue(text.contains("keep me"))
        assertTrue(text.contains("\"answer\":42"))
        assertTrue(text.contains("\"kid\""))
        assertNull(e.view(0).kind)
        assertFalse(e.view(0).editable)
    }

    @Test
    fun brokenJsonYieldsEmptyEditableDoc() {
        val e = editor("{not json")
        assertEquals(0, e.size)
        e.append()
        assertEquals(1, e.size)
        assertEquals("paragraph", e.view(0).type)
        assertTrue(e.view(0).editable)
    }

    @Test
    fun childBlocksAreReportedAndNotDestroyed() {
        val parent = """{"id":"p","type":"bulletListItem","props":{},"content":[{"type":"text","text":"父","styles":{}}],"children":[{"id":"c","type":"paragraph","props":{},"content":[{"type":"text","text":"子","styles":{}}],"children":[]}]}"""
        val e = editor(doc(parent))
        assertTrue(e.view(0).hasChildren)
        e.setText(0, "父改")
        val block = json.parseToJsonElement(e.toJson()).jsonArray[0].jsonObject
        assertEquals(1, (block["children"] as JsonArray).size)
    }

    @Test
    fun dividerIsNotEditableButSwitchableAway() {
        val e = editor(doc("""{"id":"d","type":"divider","props":{},"content":[],"children":[]}"""))
        assertEquals(BlockKind.Divider, e.view(0).kind)
        assertFalse(e.view(0).editable)
        e.setKind(0, BlockKind.Paragraph)
        assertEquals(BlockKind.Paragraph, e.view(0).kind)
        assertTrue(e.view(0).editable)
    }
}
