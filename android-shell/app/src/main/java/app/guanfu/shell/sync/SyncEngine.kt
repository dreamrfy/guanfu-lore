package app.guanfu.shell.sync

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * 同步引擎（A03，架构 §3）：web sync.ts 算法的 Kotlin 复刻，三步——
 *  1. 拉：游标增量拉服务端变更，逐条 entity:entityId 判断后写本地库
 *  2. 推：outbox 队列推上去，服务端按乐观锁判 applied/conflict
 *  3. 冲突：conflict 存成冲突副本，绝不静默丢
 *
 * 五要点（全部有 web 实测教训背书）：
 *  - 游标只在 pull 后推进（nextSeq），push 不动游标
 *  - 自回声防护：outbox 还挂着的行不被远端覆盖，只记 seq（S04 踩坑）
 *  - coalesce：同 entity:entityId 只留最新一条，baseSeq 取已知 seqs
 *  - applied → 删 outbox + 记 seqs；conflict → 存 SyncConflictEntity + 删 outbox
 *  - 附件补缺/补传归 A11，本期不拦主流程
 */
class SyncEngine(
    private val store: SyncStore,
    private val api: SyncApi,
    private val deviceIdProvider: () -> String,
    private val now: () -> Long = { System.currentTimeMillis() },
) {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    suspend fun run(): SyncSummary {
        val summary = SyncSummary()
        try {
            // 1) 拉
            val cursor = store.getCursor()
            val pull = api.pull(cursor)
            if (!pull.ok) {
                return summary.copy(error = pull.error ?: "拉取失败")
            }
            val pending = store.pendingKeys()
            for (change in pull.changes) {
                val parsed = parseRemoteChange(change) ?: continue
                val key = "${change.entity}:${change.entityId}"
                if (key !in pending) {
                    store.applyChange(parsed.entity, parsed.entityId, parsed.op, parsed.payload, now())
                }
                store.setSeq(change.entity, change.entityId, change.seq)
                summary.pulled += 1
            }
            store.setCursor(pull.nextSeq.takeIf { it > 0 } ?: cursor)

            // 2) 推
            val rows = store.outboxRows()
            if (rows.isNotEmpty()) {
                val push = api.push(
                    rows.map {
                        PushChangeDto(
                            entity = it.entity,
                            entityId = it.entityId,
                            op = it.op,
                            payload = it.payload?.let { p -> json.parseToJsonElement(p) },
                            baseSeq = it.baseSeq,
                            actor = it.actor,
                        )
                    },
                )
                if (!push.ok) {
                    return summary.copy(error = push.error ?: "推送失败")
                }
                val handled = mutableListOf<Long>()
                for (result in push.results) {
                    val row = rows.firstOrNull { it.entityId == result.entityId } ?: continue
                    if (result.status == "applied") {
                        store.setSeq(row.entity, row.entityId, result.seq)
                        summary.pushed += 1
                    } else {
                        // 冲突副本：payload 存字符串原样（A04+ 的冲突列表 UI 再解析展示）
                        store.saveConflict(row.entity, row.entityId, row.payload, result.seq, now())
                        summary.conflicts += 1
                    }
                    handled += row.id
                }
                store.deleteOutboxRows(handled)
            }

            summary.ok = true
            return summary
        } catch (e: Exception) {
            return summary.copy(error = (e.message ?: e.toString()).take(200))
        }
    }

    /** 本地改动入队（对齐 web enqueueChange：coalesce + baseSeq 取已知 seqs） */
    suspend fun enqueueChange(entity: String, entityId: String, op: String, payloadJson: String?) {
        store.enqueue(entity, entityId, op, payloadJson, deviceIdProvider(), now())
    }

    /** 解析服务端变更；实体/操作不在白名单或 payload 不是合法 JSON → 跳过（web parseRemoteChange 同语义） */
    private fun parseRemoteChange(change: RemoteChangeDto): ParsedChange? {
        if (change.entity !in SYNC_ENTITIES || change.op !in SYNC_OPS) return null
        val payload = change.payload?.let {
            runCatching { json.parseToJsonElement(it) as JsonObject }.getOrNull() ?: return null
        }
        return ParsedChange(change.entity, change.entityId, change.op, payload)
    }

    private data class ParsedChange(val entity: String, val entityId: String, val op: String, val payload: JsonObject?)

    companion object {
        /**
         * coalesce 纯函数（web sync.ts coalesceOutbox）：同一 entity:entityId 的
         * 多条待推改动合并成一条最新——保留原行 id（Room 语义），其余字段全取 incoming。
         * JVM 单测直接覆盖。
         */
        fun coalesce(existing: OutboxRowLike?, incoming: OutboxRowLike, nowMs: Long): OutboxRowLike =
            incoming.copy(id = existing?.id ?: 0L, baseSeq = incoming.baseSeq, createdAt = nowMs)
    }
}

/** coalesce 用行快照（不依赖 Room 实体，纯 JVM 可测） */
data class OutboxRowLike(
    val id: Long,
    val entity: String,
    val entityId: String,
    val op: String,
    val payload: String?,
    val baseSeq: Long,
    val actor: String,
    val createdAt: Long,
)
