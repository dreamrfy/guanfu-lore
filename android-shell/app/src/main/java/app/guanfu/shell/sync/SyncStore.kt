package app.guanfu.shell.sync

import app.guanfu.shell.db.AppDatabase
import app.guanfu.shell.db.DocEntity
import app.guanfu.shell.db.KeyValueEntity
import app.guanfu.shell.db.OutboxEntity
import app.guanfu.shell.db.PageEntity
import app.guanfu.shell.db.RecordEntity
import app.guanfu.shell.db.CollectionEntity
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/**
 * 引擎的数据访问抽象（A03）：只暴露同步需要的最小操作面，Room 实现之外
 * JVM 单测可以用内存 Fake 复刻同语义（web sync.ts 的 repo + meta 同层）。
 *
 * seqs 存储与 web 一致：一个 KV 项装整张 map（"entity:entityId" → seq）。
 */

const val KV_CURSOR = "syncCursor"
const val KV_SEQS = "syncSeqs"

interface SyncStore {
    suspend fun getCursor(): Long
    suspend fun setCursor(value: Long)
    suspend fun getSeq(entity: String, entityId: String): Long
    suspend fun setSeq(entity: String, entityId: String, seq: Long)
    /** 还挂着 outbox 的行（"entity:entityId" 集合）——自回声防护判据 */
    suspend fun pendingKeys(): Set<String>
    /** 远端变更写库（payload 已 parse 成 JsonObject；delete 时可能为 null） */
    suspend fun applyChange(entity: String, entityId: String, op: String, payload: JsonObject?, nowMs: Long)
    suspend fun outboxRows(): List<OutboxEntity>
    /** 入队（coalesce 语义：同 entity:entityId 只留一条，baseSeq 取已知 seqs） */
    suspend fun enqueue(entity: String, entityId: String, op: String, payload: String?, actor: String, nowMs: Long)
    suspend fun deleteOutboxRows(ids: List<Long>)
    suspend fun saveConflict(entity: String, entityId: String, payload: String?, serverSeq: Long, nowMs: Long)
}

class RoomSyncStore(private val db: AppDatabase) : SyncStore {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    override suspend fun getCursor(): Long = db.keyValueDao().get(KV_CURSOR)?.toLongOrNull() ?: 0L

    override suspend fun setCursor(value: Long) {
        db.keyValueDao().put(KeyValueEntity(KV_CURSOR, value.toString()))
    }

    private suspend fun readMap(key: String): MutableMap<String, String> {
        val raw = db.keyValueDao().get(key) ?: return mutableMapOf()
        val obj = runCatching { json.parseToJsonElement(raw).jsonObject }.getOrNull() ?: return mutableMapOf()
        return obj.entries.associate { (k, v) -> k to v.jsonPrimitive.content }.toMutableMap()
    }

    override suspend fun getSeq(entity: String, entityId: String): Long {
        val seqs = readMap(KV_SEQS)
        return seqs["$entity:$entityId"]?.toLongOrNull() ?: 0L
    }

    override suspend fun setSeq(entity: String, entityId: String, seq: Long) {
        val seqs = readMap(KV_SEQS)
        seqs["$entity:$entityId"] = seq.toString()
        db.keyValueDao().put(KeyValueEntity(KV_SEQS, JsonObject(seqs.mapValues { JsonPrimitive(it.value) }).toString()))
    }

    override suspend fun pendingKeys(): Set<String> =
        db.outboxDao().listOutbox().map { "${it.entity}:${it.entityId}" }.toSet()

    override suspend fun applyChange(entity: String, entityId: String, op: String, payload: JsonObject?, nowMs: Long) {
        when (entity) {
            "page" -> applyPage(payload, op, nowMs)
            "collection" -> applyCollection(payload, op)
            "record" -> applyRecord(payload, op)
        }
    }

    private suspend fun applyPage(payload: JsonObject?, op: String, nowMs: Long) {
        val pageJson = payload?.get("page") as? JsonObject ?: return
        val deletedAt = pageJson["deletedAt"]?.jsonPrimitive?.longOrNull
        val entity = PageEntity(
            id = pageJson.str("id"),
            parentId = pageJson.strOrNull("parentId"),
            title = pageJson.str("title"),
            icon = pageJson.strOrNull("icon"),
            coverAssetId = pageJson.strOrNull("coverAssetId"),
            createdAt = pageJson.long("createdAt"),
            updatedAt = pageJson.long("updatedAt"),
            // web 语义（sync.ts:239-248）：只有 delete 变更才把 deletedAt 兜底成当前时间；
            // upsert 必须保留原值（null = 正常页），否则每次拉取都会把页面误扔进回收站
            deletedAt = if (op == "delete") deletedAt ?: nowMs else deletedAt,
            sortKey = pageJson.double("sortKey"),
            tags = (pageJson["tags"] as? JsonArray)?.toString(),
        )
        db.pageDao().upsert(entity)
        (payload["blocks"] as? JsonArray)?.let { blocks ->
            db.docDao().upsert(DocEntity(pageId = entity.id, blocks = blocks.toString(), updatedAt = entity.updatedAt))
        }
    }

    private suspend fun applyCollection(payload: JsonObject?, op: String) {
        val collectionJson = payload?.get("collection") as? JsonObject ?: return
        if (op == "delete") {
            db.collectionDao().deleteById(collectionJson.str("id"))
            return
        }
        db.collectionDao().upsert(
            CollectionEntity(
                id = collectionJson.str("id"),
                name = collectionJson.str("name"),
                icon = collectionJson.strOrNull("icon"),
                fields = (collectionJson["fields"] as? JsonArray)?.toString() ?: "[]",
                views = (collectionJson["views"] as? JsonArray)?.toString() ?: "[]",
                createdAt = collectionJson.long("createdAt"),
                updatedAt = collectionJson.long("updatedAt"),
            ),
        )
    }

    private suspend fun applyRecord(payload: JsonObject?, op: String) {
        val recordJson = payload?.get("record") as? JsonObject ?: return
        if (op == "delete") {
            db.recordDao().deleteById(recordJson.str("id"))
            return
        }
        db.recordDao().upsert(
            RecordEntity(
                id = recordJson.str("id"),
                collectionId = recordJson.str("collectionId"),
                values = (recordJson["values"] as? JsonObject)?.toString() ?: "{}",
                doc = (recordJson["doc"] as? JsonArray)?.toString(),
                thoughts = (recordJson["thoughts"] as? JsonArray)?.toString(),
                snapshotAssetId = recordJson.strOrNull("snapshotAssetId"),
                createdAt = recordJson.long("createdAt"),
                updatedAt = recordJson.long("updatedAt"),
            ),
        )
    }

    override suspend fun outboxRows(): List<OutboxEntity> = db.outboxDao().listOutbox()

    override suspend fun enqueue(entity: String, entityId: String, op: String, payload: String?, actor: String, nowMs: Long) {
        val existing = db.outboxDao().byKey(entity, entityId)
        val baseSeq = getSeq(entity, entityId)
        if (existing != null) {
            db.outboxDao().updateContent(entity, entityId, op, payload, baseSeq, nowMs)
        } else {
            db.outboxDao().insert(
                OutboxEntity(
                    entity = entity, entityId = entityId, op = op,
                    payload = payload, baseSeq = baseSeq, actor = actor, createdAt = nowMs,
                ),
            )
        }
    }

    override suspend fun deleteOutboxRows(ids: List<Long>) {
        if (ids.isNotEmpty()) db.outboxDao().deleteByIds(ids)
    }

    override suspend fun saveConflict(entity: String, entityId: String, payload: String?, serverSeq: Long, nowMs: Long) {
        db.syncConflictDao().insert(
            app.guanfu.shell.db.SyncConflictEntity(
                entity = entity, entityId = entityId, payload = payload,
                serverSeq = serverSeq, createdAt = nowMs,
            ),
        )
    }
}

private fun JsonObject.str(key: String): String = (this[key] as? JsonPrimitive)?.content ?: ""

private fun JsonObject.strOrNull(key: String): String? {
    val v = this[key] as? JsonPrimitive ?: return null
    return v.content.takeIf { it != "null" }
}

private fun JsonObject.long(key: String): Long =
    (this[key] as? JsonPrimitive)?.longOrNull
        ?: (this[key] as? JsonPrimitive)?.content?.toDoubleOrNull()?.toLong()
        ?: 0L

private fun JsonObject.double(key: String): Double =
    (this[key] as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0
