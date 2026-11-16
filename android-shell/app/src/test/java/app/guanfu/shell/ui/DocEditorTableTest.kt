package app.guanfu.shell.ui

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** A08 表格块：结构读取 + 单元格改字 + 行/列增删，且不动没碰过的字段 */
class DocEditorTableTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /** 两列两行：表头「姓名/年龄」，第二行一个普通格 + 一个 tableCell 对象格（带 props + 单 run 样式） */
    private fun tableJson(contentExtra: String = ""): String = """
        [{"id":"t1","type":"table","props":{"custom":7},"content":{
          "type":"tableContent","headerRows":1,"headerCols":1,"columnWidths":[120,90]$contentExtra,
          "rows":[
            {"cells":[[{"type":"text","text":"姓名","styles":{}}],[{"type":"text","text":"年龄","styles":{}}]]},
            {"cells":[{"type":"tableCell","content":[{"type":"text","text":"张三","styles":{"bold":true}}],"props":{"textColor":"red"}},[{"type":"text","text":"18","styles":{}}]]}
          ]},"children":[]}]
    """.trimIndent()

    private fun blockOf(editor: DocEditor): JsonObject =
        json.parseToJsonElement(editor.toJson()).jsonArray[0].jsonObject

    private fun contentOf(editor: DocEditor): JsonObject = blockOf(editor)["content"]!!.jsonObject

    private fun rowsOf(editor: DocEditor): JsonArray = contentOf(editor)["rows"]!!.jsonArray

    private fun cellsOf(editor: DocEditor, row: Int): JsonArray =
        (rowsOf(editor)[row] as JsonObject)["cells"]!!.jsonArray

    private fun textOf(cell: JsonElement): String {
        val runs = when (cell) {
            is JsonObject -> cell["content"]!!.jsonArray
            else -> cell.jsonArray
        }
        return runs.joinToString("") { (it as JsonObject)["text"]?.jsonPrimitive?.content ?: "" }
    }

    @Test
    fun `读表格结构与单元格文字`() {
        val table = DocEditor(tableJson()).views().first().table!!
        assertEquals(1, table.headerRows)
        assertEquals(1, table.headerCols)
        assertEquals(2, table.columnCount)
        assertEquals(2, table.rowCount)
        assertEquals("姓名", table.rows[0][0].text)
        assertEquals("张三", table.rows[1][0].text)
        assertTrue(table.hasReadOnlyCell.not())
        assertEquals("1:1:2:2", table.shape)
    }

    @Test
    fun `改单元格保留单 run 样式与 tableCell props`() {
        val editor = DocEditor(tableJson())
        assertTrue(editor.setCellText(listOf(0), 1, 0, "李四"))

        val cell = cellsOf(editor, 1)[0] as JsonObject
        assertEquals("tableCell", cell["type"]!!.jsonPrimitive.content)
        assertEquals("red", (cell["props"] as JsonObject)["textColor"]!!.jsonPrimitive.content)
        val run = cell["content"]!!.jsonArray[0] as JsonObject
        assertEquals("李四", run["text"]!!.jsonPrimitive.content)
        assertTrue((run["styles"] as JsonObject).containsKey("bold"))
        // 没碰的格、表头行、块 props 全在
        assertEquals("18", textOf(cellsOf(editor, 1)[1]))
        assertEquals("姓名", textOf(cellsOf(editor, 0)[0]))
        assertEquals(1, contentOf(editor)["headerRows"]!!.jsonPrimitive.content.toInt())
        assertEquals("7", (blockOf(editor)["props"] as JsonObject)["custom"]!!.jsonPrimitive.content)
    }

    @Test
    fun `富单元格（多段文字）拒绝改字`() {
        val source = """
            [{"id":"t1","type":"table","props":{},"content":{"type":"tableContent","headerRows":0,"rows":[
              {"cells":[[{"type":"text","text":"加粗","styles":{"bold":true}},{"type":"text","text":"普通","styles":{}}]]}
            ]},"children":[]}]
        """.trimIndent()
        val editor = DocEditor(source)
        val before = editor.toJson()
        assertFalse(editor.setCellText(listOf(0), 0, 0, "覆盖"))
        assertEquals(before, editor.toJson())
        assertTrue(editor.views().first().table!!.hasReadOnlyCell)
    }

    @Test
    fun `空单元格可以直接写`() {
        val source = """
            [{"id":"t1","type":"table","props":{},"content":{"type":"tableContent","headerRows":0,"rows":[
              {"cells":[[]]}
            ]},"children":[]}]
        """.trimIndent()
        val editor = DocEditor(source)
        assertTrue(editor.setCellText(listOf(0), 0, 0, "新值"))
        assertEquals("新值", textOf(cellsOf(editor, 0)[0]))
    }

    @Test
    fun `越界或非表格块返回 false`() {
        val editor = DocEditor(tableJson())
        assertFalse(editor.setCellText(listOf(0), 5, 0, "x"))
        assertFalse(editor.setCellText(listOf(0), 0, 9, "x"))
        assertFalse(editor.addRow(listOf(3)))
        assertFalse(editor.deleteRow(listOf(0), 9))
    }

    @Test
    fun `末尾加行补齐列数`() {
        val editor = DocEditor(tableJson())
        assertTrue(editor.addRow(listOf(0)))
        assertEquals(3, rowsOf(editor).size)
        assertEquals(2, cellsOf(editor, 2).size)
        assertEquals("", textOf(cellsOf(editor, 2)[0]))
        assertEquals(3, editor.views().first().table!!.rowCount)
    }

    @Test
    fun `指定位置加行插在该行之后`() {
        val editor = DocEditor(tableJson())
        assertTrue(editor.addRow(listOf(0), afterRow = 0))
        assertEquals(3, rowsOf(editor).size)
        assertEquals("姓名", textOf(cellsOf(editor, 0)[0]))
        assertEquals("", textOf(cellsOf(editor, 1)[0]))
        assertEquals("张三", textOf(cellsOf(editor, 2)[0]))
    }

    @Test
    fun `删表头行时 headerRows 跟着减一`() {
        val editor = DocEditor(tableJson())
        assertTrue(editor.deleteRow(listOf(0), 0))
        assertEquals(1, rowsOf(editor).size)
        assertEquals(0, contentOf(editor)["headerRows"]!!.jsonPrimitive.content.toInt())
        assertEquals("张三", textOf(cellsOf(editor, 0)[0]))
    }

    @Test
    fun `最后一行不让删`() {
        val editor = DocEditor(tableJson())
        assertTrue(editor.deleteRow(listOf(0), 0))
        assertFalse(editor.deleteRow(listOf(0), 0))
        assertEquals(1, rowsOf(editor).size)
    }

    @Test
    fun `加列时短行一起补齐并追加列宽`() {
        val source = """
            [{"id":"t1","type":"table","props":{},"content":{"type":"tableContent","headerRows":0,"rows":[
              {"cells":[[{"type":"text","text":"A","styles":{}}]]},
              {"cells":[[{"type":"text","text":"B","styles":{}}],[{"type":"text","text":"C","styles":{}}]]}
            ]},"children":[]}]
        """.trimIndent()
        val editor = DocEditor(source)
        assertTrue(editor.addColumn(listOf(0)))
        assertEquals(3, cellsOf(editor, 0).size)
        assertEquals(3, cellsOf(editor, 1).size)
        assertEquals("A", textOf(cellsOf(editor, 0)[0]))
        assertEquals("", textOf(cellsOf(editor, 0)[1]))
        assertEquals(3, editor.views().first().table!!.columnCount)
    }

    @Test
    fun `加列同步追加 columnWidths`() {
        val editor = DocEditor(tableJson())
        assertTrue(editor.addColumn(listOf(0)))
        val widths = contentOf(editor)["columnWidths"]!!.jsonArray
        assertEquals(3, widths.size)
        assertEquals(JsonNull, widths[2])
    }

    @Test
    fun `删列同步删列宽与表头列`() {
        val editor = DocEditor(tableJson())
        assertTrue(editor.deleteColumn(listOf(0), 0))
        assertEquals(1, cellsOf(editor, 0).size)
        assertEquals(1, cellsOf(editor, 1).size)
        assertEquals("年龄", textOf(cellsOf(editor, 0)[0]))
        assertEquals("18", textOf(cellsOf(editor, 1)[0]))
        val widths = contentOf(editor)["columnWidths"]!!.jsonArray
        assertEquals(1, widths.size)
        assertEquals("90", widths[0].jsonPrimitive.content)
        assertEquals(0, contentOf(editor)["headerCols"]!!.jsonPrimitive.content.toInt())
    }

    @Test
    fun `最后一列不让删`() {
        val source = """
            [{"id":"t1","type":"table","props":{},"content":{"type":"tableContent","headerRows":0,"rows":[
              {"cells":[[{"type":"text","text":"唯一","styles":{}}]]}
            ]},"children":[]}]
        """.trimIndent()
        val editor = DocEditor(source)
        assertFalse(editor.deleteColumn(listOf(0), 0))
        assertEquals(1, cellsOf(editor, 0).size)
    }

    @Test
    fun `未触碰的字段与未知键原样保留`() {
        val editor = DocEditor(tableJson(contentExtra = ",\"futureKey\":\"keep-me\""))
        assertTrue(editor.setCellText(listOf(0), 0, 0, "改过"))
        assertTrue(editor.addRow(listOf(0)))
        assertTrue(editor.addColumn(listOf(0)))
        val content = contentOf(editor)
        assertEquals("keep-me", content["futureKey"]!!.jsonPrimitive.content)
        assertEquals("tableContent", content["type"]!!.jsonPrimitive.content)
        val block = blockOf(editor)
        assertEquals("7", (block["props"] as JsonObject)["custom"]!!.jsonPrimitive.content)
        assertEquals("t1", block["id"]!!.jsonPrimitive.content)
    }

    @Test
    fun `空表格加行时补上 headerRows`() {
        val source = """
            [{"id":"t1","type":"table","props":{},"content":{"type":"tableContent","rows":[]},"children":[]}]
        """.trimIndent()
        val editor = DocEditor(source)
        assertTrue(editor.addRow(listOf(0)))
        val content = contentOf(editor)
        assertEquals(1, content["headerRows"]!!.jsonPrimitive.content.toInt())
        assertEquals(1, cellsOf(editor, 0).size)
        assertNull(editor.views().first().table!!.rows.getOrNull(1))
    }
}
