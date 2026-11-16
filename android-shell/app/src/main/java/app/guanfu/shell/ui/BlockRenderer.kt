package app.guanfu.shell.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.guanfu.shell.db.AppDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 块渲染（A05）：把 BlockParser 出来的节点画成 Compose 树（只读）。
 *
 * 覆盖 web 端已有块型：段落/三级标题/无序/有序/待办/引用/着重文字(callout)/代码/分割线/
 * 图片/表格/书签/多维表块/页面提及；未知块降级成「[不支持的块]」并能展开看原始 JSON
 * （与 web 的兼容策略一致：不认识也要能看见内容，不能整页打不开）。
 *
 * 图片：块里存的是 `asset://<附件id>`（红线 G1）。附件本体在 Room 的 assets 表里就直接画，
 * 没有就显示占位——真正的「按需补图」是 A11 的活。
 * 页面提及：A05 只把 @标题 画出来（颜色区分），点击跳转归 A09 双链。
 */
@Composable
fun BlockListView(blocks: List<BlockNode>, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth()) {
        var numbered = 0
        for (node in blocks) {
            numbered = if (node is NumberedNode) numbered + 1 else 0
            BlockView(node, numbered, 0)
        }
    }
}

/** 单块只读渲染（A06 编辑器里给"不可编辑的块"用：内容照旧能看见） */
@Composable
fun SingleBlockView(node: BlockNode) {
    BlockView(node, numberedIndex = 1, depth = 0)
}

@Composable
private fun BlockView(node: BlockNode, numberedIndex: Int, depth: Int) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(start = (depth * 16).dp),
    ) {
        when (node) {
            is ParagraphNode -> BlockText(node.spans.textOrPlaceholder())
            is HeadingNode -> Heading(node.level, node.spans)
            is BulletNode -> MarkerRow("•", node.spans)
            is NumberedNode -> MarkerRow("$numberedIndex.", node.spans)
            is CheckNode -> CheckRow(node)
            is QuoteNode -> QuoteRow(node.spans)
            is CalloutNode -> Callout(node)
            is CodeNode -> CodeBlock(node)
            is DividerNode -> HorizontalDivider(Modifier.padding(vertical = 8.dp))
            is ImageNode -> ImageBlock(node)
            is TableNode -> TableBlock(node)
            is BookmarkNode -> BookmarkCard(node)
            is CollectionRefNode -> CollectionRefCard(node)
            is UnsupportedNode -> UnsupportedBlock(node)
        }

        if (node.children.isNotEmpty()) {
            var childNumber = 0
            for (child in node.children) {
                childNumber = if (child is NumberedNode) childNumber + 1 else 0
                BlockView(child, childNumber, depth + 1)
            }
        }
    }
}

/* ---------------- 各类块 ---------------- */

@Composable
private fun BlockText(spans: List<InlineSpan>, modifier: Modifier = Modifier, color: Color? = null) {
    if (spans.isEmpty()) {
        Spacer(Modifier.height(8.dp))
        return
    }
    SpansText(
        spans = spans,
        modifier = modifier,
        fontSize = 15.sp,
        lineHeight = 24.sp,
        color = color ?: MaterialTheme.colorScheme.onSurface,
    )
}

/**
 * 「@页面提及」点击（A09）：渲染层不想要回调时就退化成普通文本。
 * 用 CompositionLocal 传回调，省得把 onOpenPage 一路穿过十来个块渲染函数。
 */
val LocalPageOpener = compositionLocalOf<((String) -> Unit)?> { null }

/** 带内联样式的文本；若处在 [LocalPageOpener] 里，点中提到的那段文字会打开对应页面 */
@Composable
private fun SpansText(
    spans: List<InlineSpan>,
    modifier: Modifier = Modifier,
    fontSize: TextUnit,
    lineHeight: TextUnit? = null,
    fontWeight: FontWeight? = null,
    fontStyle: FontStyle? = null,
    color: Color? = null,
    textDecoration: TextDecoration? = null,
) {
    val annotated = spans.toAnnotated()
    val opener = LocalPageOpener.current
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    Text(
        text = annotated,
        modifier = modifier
            .then(
                if (opener == null) {
                    Modifier
                } else {
                    Modifier.pointerInput(annotated) {
                        detectTapGestures { position ->
                            val result = layout ?: return@detectTapGestures
                            val offset = result.getOffsetForPosition(position)
                            annotated.getStringAnnotations("mention", offset, offset)
                                .firstOrNull()
                                ?.let { opener(it.item) }
                        }
                    }
                },
            ),
        fontSize = fontSize,
        lineHeight = lineHeight ?: TextUnit.Unspecified,
        fontWeight = fontWeight,
        fontStyle = fontStyle,
        color = color ?: Color.Unspecified,
        textDecoration = textDecoration,
        onTextLayout = { layout = it },
    )
}

@Composable
private fun Heading(level: Int, spans: List<InlineSpan>) {
    val (size, weight) = when (level) {
        1 -> 24.sp to FontWeight.Bold
        2 -> 20.sp to FontWeight.Bold
        else -> 17.sp to FontWeight.SemiBold
    }
    SpansText(
        spans = spans,
        modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
        fontSize = size,
        fontWeight = weight,
    )
}

@Composable
private fun MarkerRow(marker: String, spans: List<InlineSpan>) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.Top) {
        Text(marker, fontSize = 15.sp, color = MaterialTheme.colorScheme.primary, modifier = Modifier.width(24.dp))
        BlockText(spans, Modifier.weight(1f))
    }
}

@Composable
private fun CheckRow(node: CheckNode) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.Top) {
        Text(if (node.checked) "☑" else "☐", fontSize = 15.sp, modifier = Modifier.width(24.dp))
        SpansText(
            spans = node.spans,
            modifier = Modifier.weight(1f),
            fontSize = 15.sp,
            lineHeight = 24.sp,
            textDecoration = if (node.checked) TextDecoration.LineThrough else null,
            color = if (node.checked) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun QuoteRow(spans: List<InlineSpan>) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.Top) {
        Box(
            Modifier
                .width(3.dp)
                .height(24.dp)
                .background(MaterialTheme.colorScheme.primary),
        )
        Spacer(Modifier.width(10.dp))
        SpansText(
            spans = spans,
            modifier = Modifier.weight(1f),
            fontSize = 15.sp,
            lineHeight = 24.sp,
            fontStyle = FontStyle.Italic,
            color = MaterialTheme.colorScheme.outline,
        )
    }
}

@Composable
private fun Callout(node: CalloutNode) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.medium)
            .padding(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(node.emoji, fontSize = 16.sp, modifier = Modifier.width(28.dp))
        BlockText(node.spans, Modifier.weight(1f))
    }
}

@Composable
private fun CodeBlock(node: CodeNode) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.small)
            .horizontalScroll(rememberScrollState())
            .padding(12.dp),
    ) {
        if (node.language.isNotBlank()) {
            Text(node.language, fontSize = 11.sp, color = MaterialTheme.colorScheme.outline)
        }
        Text(
            node.code,
            fontFamily = FontFamily.Monospace,
            fontSize = 13.sp,
            lineHeight = 20.sp,
        )
    }
}

@Composable
private fun ImageBlock(node: ImageNode) {
    val context = LocalContext.current
    val assetId = assetIdOf(node.url)
    val bitmap by produceState<android.graphics.Bitmap?>(initialValue = null, assetId) {
        value = if (assetId == null) {
            null
        } else {
            withContext(Dispatchers.IO) {
                val bytes = AppDatabase.get(context).assetDao().byId(assetId)?.data
                bytes?.let { runCatching { BitmapFactory.decodeByteArray(it, 0, it.size) }.getOrNull() }
            }
        }
    }
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        val image = bitmap
        if (image != null) {
            Image(
                bitmap = image.asImageBitmap(),
                contentDescription = node.caption,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxWidth().heightIn(max = 320.dp),
            )
        } else {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(72.dp)
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant)
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (assetId != null) {
                        "图片：附件 $assetId（本体未在本地，附件同步 A11 接入）"
                    } else {
                        "图片：${node.url.ifBlank { "（地址为空）" }}"
                    },
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.padding(8.dp),
                )
            }
        }
        node.caption?.let {
            Text(it, fontSize = 12.sp, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun TableBlock(node: TableNode) {
    if (node.rows.isEmpty()) {
        Text("［空表格］", fontSize = 13.sp, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(vertical = 6.dp))
        return
    }
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        node.rows.forEachIndexed { rowIndex, cells ->
            Row(Modifier.fillMaxWidth()) {
                cells.forEach { cell ->
                    val isHeader = rowIndex < node.headerRows
                    Text(
                        text = cell.toAnnotated(),
                        fontSize = 13.sp,
                        fontWeight = if (isHeader) FontWeight.Bold else FontWeight.Normal,
                        modifier = Modifier
                            .weight(1f)
                            .border(0.5.dp, MaterialTheme.colorScheme.outlineVariant)
                            .padding(8.dp),
                    )
                }
                // 补齐空列，保证每行宽度一致
                repeat((node.rows.maxOf { it.size } - cells.size).coerceAtLeast(0)) {
                    Box(
                        Modifier
                            .weight(1f)
                            .border(0.5.dp, MaterialTheme.colorScheme.outlineVariant)
                            .padding(8.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun BookmarkCard(node: BookmarkNode) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.small)
            .padding(12.dp),
    ) {
        Text(
            node.title.ifBlank { node.url.ifBlank { "（空书签）" } },
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.primary,
        )
        if (node.description.isNotBlank()) {
            Text(node.description, fontSize = 13.sp, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(top = 4.dp))
        }
        if (node.url.isNotBlank()) {
            Text(node.url, fontSize = 12.sp, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun CollectionRefCard(node: CollectionRefNode) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.small)
            .padding(12.dp),
    ) {
        Text("▦ 多维表格", fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Text(
            "表 id：${node.collectionId.ifBlank { "（空）" }} · 表格视图渲染在 A08 接入",
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.outline,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

@Composable
private fun UnsupportedBlock(node: UnsupportedNode) {
    var expanded by remember { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clickable { expanded = !expanded }
            .background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.small)
            .padding(10.dp),
    ) {
        Text(
            "［不支持的块：${node.type}］${if (expanded) "（点收起）" else "（点看原始数据）"}",
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.outline,
        )
        if (expanded) {
            Text(
                node.rawJson,
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                lineHeight = 16.sp,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}

/* ---------------- 内联内容 ---------------- */

private fun List<InlineSpan>.textOrPlaceholder(): List<InlineSpan> =
    if (isEmpty()) listOf(InlineSpan.Text("")) else this

/** 内联样式 → AnnotatedString（加粗/斜体/下划线/删除线/行内代码/链接/页面提及） */
fun List<InlineSpan>.toAnnotated(): AnnotatedString = buildAnnotatedString {
    for (span in this@toAnnotated) {
        when (span) {
            is InlineSpan.Text -> {
                val start = length
                append(span.text)
                val styles = mutableListOf<SpanStyle>()
                if (span.bold) styles += SpanStyle(fontWeight = FontWeight.Bold)
                if (span.italic) styles += SpanStyle(fontStyle = FontStyle.Italic)
                if (span.underline) styles += SpanStyle(textDecoration = TextDecoration.Underline)
                if (span.strike) styles += SpanStyle(textDecoration = TextDecoration.LineThrough)
                if (span.code) {
                    styles += SpanStyle(fontFamily = FontFamily.Monospace, background = Color(0x22808080))
                }
                if (span.href != null) {
                    styles += SpanStyle(color = Color(0xFF0B57D0), textDecoration = TextDecoration.Underline)
                }
                for (style in styles) addStyle(style, start, length)
            }
            is InlineSpan.PageMention -> {
                val start = length
                append("@" + span.title.ifBlank { "页面" })
                addStyle(
                    SpanStyle(color = Color(0xFF0B57D0), fontWeight = FontWeight.Medium),
                    start,
                    length,
                )
                // A09：留一条「可点」注解，点击时按字符偏移把 @提及 命中出来
                addStringAnnotation("mention", span.pageId, start, length)
            }
        }
    }
}
