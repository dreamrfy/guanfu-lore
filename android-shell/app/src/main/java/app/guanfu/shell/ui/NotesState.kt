package app.guanfu.shell.ui

import app.guanfu.shell.db.AppDatabase
import app.guanfu.shell.db.CollectionEntity
import app.guanfu.shell.db.PageEntity
import app.guanfu.shell.db.RecordEntity
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * 主界面数据装载（A04）：Room → 侧栏树 / 标签 / 回收站 / 收集箱 / 搜索语料。
 *
 * 收集箱语义照抄 web `data/clipBox.ts`：
 *  - 固定表名「剪藏库」（web CLIP_COLLECTION_NAME 同值）
 *  - 未读判定 = 「状态」单选字段的当前值 == 「未读」选项 id
 *  - 标题 = 第一个 text 字段的值（web aiBatch.recordTitle 同语义：表格第一列当标题列）
 */

const val CLIP_BOX_NAME = "剪藏库"

data class ClipItem(
    val id: String,
    val title: String,
    val unread: Boolean,
    val updatedAt: Long,
)

data class ClipBoxState(
    val name: String,
    val total: Int,
    val unread: Int,
    val items: List<ClipItem>,
)

data class NotesSnapshot(
    val pages: List<PageEntity>,
    val tree: List<TreeItem>,
    val tags: List<Pair<String, Int>>,
    val trash: List<PageEntity>,
    val docsByPage: Map<String, String>,
    val clipBox: ClipBoxState?,
)

private data class FieldInfo(
    val id: String,
    val name: String,
    val type: String,
    /** 选项 id → 选项名（单选/多选字段才有） */
    val options: Map<String, String>,
)

private data class ClipState(val fieldId: String, val unreadId: String, val readId: String)

private data class Schema(val fields: List<FieldInfo>) {
    fun byName(name: String): FieldInfo? = fields.firstOrNull { it.name == name }
}

class NotesLoader(private val db: AppDatabase) {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    suspend fun load(): NotesSnapshot {
        val all = db.pageDao().listAll()
        val active = activePages(all)
        val trash = all.filter { it.deletedAt != null }.sortedByDescending { it.deletedAt ?: 0L }
        val docs = db.docDao().listAll().associate { it.pageId to it.blocks }
        return NotesSnapshot(
            pages = active,
            tree = buildTree(all),
            tags = tagCounts(active),
            trash = trash,
            docsByPage = docs,
            clipBox = loadClipBox(),
        )
    }

    suspend fun search(query: String): List<SearchGroup> {
        val all = db.pageDao().listAll()
        val docs = db.docDao().listAll().associate { it.pageId to it.blocks }
        return searchAll(activePages(all), docs, query)
    }

    private suspend fun loadClipBox(): ClipBoxState? {
        val collection = db.collectionDao().listAll().firstOrNull { it.name == CLIP_BOX_NAME }
            ?: return null
        val records = db.recordDao().listByCollection(collection.id)
        val schema = parseSchema(collection)
        val state = clipState(schema)
        val items = records.map { record ->
            ClipItem(
                id = record.id,
                title = titleOf(schema, record).ifBlank { "（无标题剪藏）" },
                unread = state != null && valueOf(record, state.fieldId) == state.unreadId,
                updatedAt = record.updatedAt,
            )
        }.sortedByDescending { it.updatedAt }
        return ClipBoxState(collection.name, records.size, items.count { it.unread }, items)
    }

    /* ---------------- JSON 解析（全是 web 端定义的结构，坏数据一律当空） ---------------- */

    private fun parseSchema(collection: CollectionEntity): Schema {
        val fields = parseArray(collection.fields).mapNotNull { element ->
            val obj = element as? JsonObject ?: return@mapNotNull null
            val id = obj.str("id") ?: return@mapNotNull null
            FieldInfo(
                id = id,
                name = obj.str("name") ?: "",
                type = obj.str("type") ?: "text",
                options = parseArray(obj["options"]?.toString()).mapNotNull { option ->
                    val o = option as? JsonObject ?: return@mapNotNull null
                    val oid = o.str("id") ?: return@mapNotNull null
                    oid to (o.str("name") ?: "")
                }.toMap(),
            )
        }
        return Schema(fields)
    }

    private fun clipState(schema: Schema): ClipState? {
        val field = schema.byName("状态") ?: return null
        val unread = field.options.entries.firstOrNull { it.value == "未读" }?.key ?: return null
        val read = field.options.entries.firstOrNull { it.value == "已读" }?.key ?: return null
        return ClipState(field.id, unread, read)
    }

    /** 标题 = 第一个 text 字段的值（web aiBatch.recordTitle 同语义） */
    private fun titleOf(schema: Schema, record: RecordEntity): String {
        val field = schema.fields.firstOrNull { it.type == "text" } ?: return ""
        return valueOf(record, field.id).orEmpty()
    }

    private fun valueOf(record: RecordEntity, fieldId: String): String? {
        val values = runCatching { json.parseToJsonElement(record.values) as? JsonObject }.getOrNull()
            ?: return null
        val value = values[fieldId] as? JsonPrimitive ?: return null
        return if (value.isString) value.content else value.content
    }

    private fun parseArray(raw: String?): JsonArray {
        if (raw.isNullOrBlank()) return JsonArray(emptyList())
        return runCatching { json.parseToJsonElement(raw) as? JsonArray }.getOrNull()
            ?: JsonArray(emptyList())
    }

    private fun JsonObject.str(key: String): String? =
        (this[key] as? JsonPrimitive)?.content
}
