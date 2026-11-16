package app.guanfu.shell.ui

import app.guanfu.shell.db.AppDatabase
import app.guanfu.shell.db.DocEntity
import app.guanfu.shell.db.PageEntity
import app.guanfu.shell.sync.SyncEngine
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonArray as JsonArrayAlias

/**
 * 正文保存（A06）：对齐 web `store.setBlocks`（store.ts:972-984）三步——
 *  1. 正文写 docs 表（web 是 300ms 防抖落库；安卓的防抖在 UI 层）
 *  2. 页面行 updatedAt 跟着刷新
 *  3. 出同步箱：`page` upsert，payload = `{page: <PageRow>, blocks: [...]}`（与 web 完全同形状）
 *
 * 同步 payload 必须是 web 的字段名（PageRow），否则别的设备拉下去解析不出来。
 */
class PageSaver(
    private val db: AppDatabase,
    private val engine: SyncEngine,
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    suspend fun save(page: PageEntity, blocksJson: String, now: Long = System.currentTimeMillis()): Long {
        val updated = page.copy(updatedAt = now)
        db.docDao().upsert(DocEntity(pageId = page.id, blocks = blocksJson, updatedAt = now))
        db.pageDao().upsert(updated)
        engine.enqueueChange(entity = "page", entityId = page.id, op = "upsert", payloadJson = payload(updated, blocksJson))
        return now
    }

    /** {page: PageRow, blocks: [...]}；坏 blocks JSON 退回空数组（不把坏数据推上服务器） */
    fun payload(page: PageEntity, blocksJson: String): String {
        val blocks = runCatching { json.parseToJsonElement(blocksJson) as? JsonArray }.getOrNull()
            ?: JsonArray(emptyList())
        return JsonObject(
            mapOf(
                "page" to pageJson(page),
                "blocks" to blocks,
            ),
        ).toString()
    }

    private fun pageJson(page: PageEntity): JsonObject {
        val tags: JsonElement = parseTags(page.tags)
            .let { JsonArrayAlias(it.map { tag -> JsonPrimitive(tag) }) }
        return JsonObject(
            mapOf(
                "id" to JsonPrimitive(page.id),
                "parentId" to (page.parentId?.let { JsonPrimitive(it) } ?: JsonNull),
                "title" to JsonPrimitive(page.title),
                "icon" to (page.icon?.let { JsonPrimitive(it) } ?: JsonNull),
                "coverAssetId" to (page.coverAssetId?.let { JsonPrimitive(it) } ?: JsonNull),
                "createdAt" to JsonPrimitive(page.createdAt),
                "updatedAt" to JsonPrimitive(page.updatedAt),
                "deletedAt" to (page.deletedAt?.let { JsonPrimitive(it) } ?: JsonNull),
                "sortKey" to JsonPrimitive(page.sortKey),
                "tags" to tags,
            ),
        )
    }
}
