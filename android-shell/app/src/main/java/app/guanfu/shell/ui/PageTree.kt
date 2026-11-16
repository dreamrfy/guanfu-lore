package app.guanfu.shell.ui

import app.guanfu.shell.db.PageEntity
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive

/**
 * 侧栏树（A04）：web `Sidebar.buildTree` 的 Kotlin 复刻。
 *
 * 三条真实会发生的边界（照抄 web 的注释与实现）：
 *  1. **孤儿页兜底**：父级被删/不在列表里时，子页不能跟着消失 → 当顶层显示。
 *  2. **防环**：数据里万一有环（历史 bug / 手改库），guard 集合拦住，避免死循环。
 *  3. **顺序**：入参 pages 已是仓库顺序（Room `ORDER BY sortKey`），
 *     与 web `db.pages.orderBy("sortKey")` 一致——旧页在前、新页在后（A04「新旧排序对齐 web」）。
 */
data class TreeItem(
    val id: String,
    val title: String,
    val icon: String?,
    val depth: Int,
)

private val json = Json { ignoreUnknownKeys = true; isLenient = true }

fun activePages(pages: List<PageEntity>): List<PageEntity> = pages.filter { it.deletedAt == null }

fun pageTitle(page: PageEntity): String = page.title.ifBlank { "无标题" }

/** tags 列是 JSON 数组串；坏数据/老数据 → 空数组（读侧兜底，不抛异常） */
fun parseTags(raw: String?): List<String> {
    if (raw.isNullOrBlank()) return emptyList()
    val array = runCatching { json.parseToJsonElement(raw) as? JsonArray }.getOrNull() ?: return emptyList()
    return array.mapNotNull { element ->
        runCatching { (element as JsonPrimitive).content }.getOrNull()?.takeIf { it.isNotBlank() }
    }
}

fun buildTree(pages: List<PageEntity>): List<TreeItem> {
    val visible = activePages(pages)
    val ids = visible.map { it.id }.toSet()
    val out = mutableListOf<TreeItem>()
    val guard = mutableSetOf<String>()

    fun childrenOf(parentId: String?): List<PageEntity> = visible.filter { page ->
        val effectiveParent = page.parentId?.takeIf { ids.contains(it) }
        effectiveParent == parentId
    }

    fun walk(parentId: String?, depth: Int) {
        for (page in childrenOf(parentId)) {
            if (!guard.add(page.id)) continue
            out += TreeItem(page.id, pageTitle(page), page.icon, depth)
            walk(page.id, depth + 1)
        }
    }

    walk(null, 0)

    // 极端情况：页面之间存在纯环（谁也到不了根），上面遍历会漏掉它们——
    // 补在末尾当顶层显示，至少能看见（web Sidebar.tsx:54-57 同语义）
    for (page in visible) {
        if (!guard.contains(page.id)) out += TreeItem(page.id, pageTitle(page), page.icon, 0)
    }
    return out
}

/** 全局标签视图（web M02 同语义）：在内存 pages 上归并统计，不另建表；软删页不计入 */
fun tagCounts(pages: List<PageEntity>): List<Pair<String, Int>> {
    val counts = mutableMapOf<String, Int>()
    for (page in activePages(pages)) {
        for (tag in parseTags(page.tags)) counts[tag] = (counts[tag] ?: 0) + 1
    }
    return counts.entries
        .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
        .map { it.key to it.value }
}

fun pagesWithTag(pages: List<PageEntity>, tag: String): List<PageEntity> =
    activePages(pages).filter { tag in parseTags(it.tags) }
