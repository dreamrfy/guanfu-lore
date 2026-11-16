package app.guanfu.shell.sync

import app.guanfu.shell.db.OutboxEntity
import app.guanfu.shell.db.SyncConflictEntity
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArrayBuilder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * SyncEngine JVM 单测：FakeStore/FakeApi 复刻 SyncStore 语义，
 * 覆盖 pull 应用/自回声防护/coalesce/push applied/conflict/错误处理六类路径。
 * 算法对齐 web sync.ts（五要点见 SyncEngine 头注）。
 */
class SyncEngineTest {

    /** 内存版 store（与 RoomSyncStore 同语义） */
    private class FakeStore : SyncStore {
        var cursor: Long = 0
        val seqs = mutableMapOf<String, Long>()
        val rows = mutableListOf<OutboxEntity>()
        val conflicts = mutableListOf<SyncConflictEntity>()
        val appliedKeys = mutableListOf<String>()

        override suspend fun getCursor(): Long = cursor
        override suspend fun setCursor(value: Long) { cursor = value }
        override suspend fun getSeq(entity: String, entityId: String): Long =
            seqs["$entity:$entityId"] ?: 0L
        override suspend fun setSeq(entity: String, entityId: String, seq: Long) {
            seqs["$entity:$entityId"] = seq
        }
        override suspend fun pendingKeys(): Set<String> =
            rows.map { "${it.entity}:${it.entityId}" }.toSet()
        override suspend fun applyChange(entity: String, entityId: String, op: String, payload: JsonObject?, nowMs: Long) {
            appliedKeys += "$entity:$entityId:$op"
        }
        override suspend fun outboxRows(): List<OutboxEntity> = rows.toList()
        override suspend fun enqueue(entity: String, entityId: String, op: String, payload: String?, actor: String, nowMs: Long) {
            val existing = rows.firstOrNull { it.entity == entity && it.entityId == entityId }
            if (existing != null) {
                val merged = SyncEngine.coalesce(
                    existing.toLike(), incoming(entity, entityId, op, payload, actor, nowMs), nowMs,
                )
                rows[rows.indexOf(existing)] = merged.toEntity()
            } else {
                rows += incoming(entity, entityId, op, payload, actor, nowMs).toEntity()
            }
        }
        override suspend fun deleteOutboxRows(ids: List<Long>) {
            rows.removeAll { it.id in ids }
        }
        override suspend fun saveConflict(entity: String, entityId: String, payload: String?, serverSeq: Long, nowMs: Long) {
            conflicts += SyncConflictEntity(
                id = conflicts.size + 1L, entity = entity, entityId = entityId,
                payload = payload, serverSeq = serverSeq, createdAt = nowMs,
            )
        }
    }

    private class FakeApi(
        // 默认空 pull：push-only 用例也要走完 pull 步（引擎先拉后推）
        private val pullResponse: PullResponseDto? = PullResponseDto(ok = true, changes = emptyList(), nextSeq = 0),
        private val pushResults: List<PushResultDto> = emptyList(),
        private val throwOnPull: Boolean = false,
        private val pushFails: Boolean = false,
    ) : SyncApi {
        val pushedChanges = mutableListOf<PushChangeDto>()
        override suspend fun pull(since: Long, limit: Int): PullResponseDto {
            if (throwOnPull) throw RuntimeException("network down")
            return pullResponse!!
        }
        override suspend fun push(changes: List<PushChangeDto>): PushResponseDto {
            pushedChanges += changes
            if (pushFails) return PushResponseDto(ok = false, error = "HTTP 500")
            return PushResponseDto(ok = true, results = pushResults)
        }
    }

    private fun engine(store: FakeStore, api: SyncApi, nowMs: Long = 1000L) =
        SyncEngine(store, api, deviceIdProvider = { "and-test" }, now = { nowMs })

    private fun pageChange(entityId: String, seq: Long, op: String = "upsert"): RemoteChangeDto {
        val payload = buildJsonObject {
            put("page", buildJsonObject {
                put("id", entityId)
                put("title", "远端标题")
                put("createdAt", 100L)
                put("updatedAt", 200L)
                put("sortKey", 1.5)
            })
            put("blocks", buildJsonArray { })
        }
        return RemoteChangeDto(
            seq = seq, entity = "page", entityId = entityId, op = op,
            payload = if (op == "delete") null else payload.toString(),
            actor = "web-1", baseSeq = 0, createdAt = 1L,
        )
    }

    // ---------- pull ----------

    @Test
    fun pull_appliesChangesAndAdvancesCursor() = runTest {
        val store = FakeStore()
        val api = FakeApi(pullResponse = PullResponseDto(
            ok = true,
            changes = listOf(pageChange("p1", seq = 5), pageChange("p2", seq = 6)),
            nextSeq = 6,
        ))
        val summary = engine(store, api).run()

        assertTrue(summary.ok)
        assertEquals(2, summary.pulled)
        assertEquals(listOf("page:p1:upsert", "page:p2:upsert"), store.appliedKeys)
        assertEquals(6L, store.cursor)
        assertEquals(5L, store.seqs["page:p1"])
    }

    @Test
    fun pull_selfEchoSkipsApplyButRecordsSeq() = runTest {
        val store = FakeStore()
        // 本地还有 p1 没推上去（outbox 挂着）→ 远端同名行不能覆盖本地
        store.rows += OutboxEntity(
            id = 1, entity = "page", entityId = "p1", op = "upsert",
            payload = "{}", baseSeq = 0, actor = "and-test", createdAt = 1L,
        )
        val api = FakeApi(pullResponse = PullResponseDto(
            ok = true, changes = listOf(pageChange("p1", seq = 7)), nextSeq = 7,
        ))
        val summary = engine(store, api).run()

        assertTrue(summary.ok)
        assertEquals(1, summary.pulled)
        assertTrue(store.appliedKeys.isEmpty())  // 没写库
        assertEquals(7L, store.seqs["page:p1"])  // seq 照记
        assertEquals(7L, store.cursor)           // 游标照推
        assertEquals(1, store.rows.size)         // outbox 原样保留待推
    }

    @Test
    fun pull_skipsUnknownEntityOrBrokenPayload() = runTest {
        val store = FakeStore()
        val api = FakeApi(pullResponse = PullResponseDto(
            ok = true,
            changes = listOf(
                pageChange("p1", seq = 2),
                RemoteChangeDto(seq = 3, entity = "unknown", entityId = "x", op = "upsert", payload = "{}"),
                RemoteChangeDto(seq = 4, entity = "page", entityId = "p3", op = "upsert", payload = "{broken"),
            ),
            nextSeq = 4,
        ))
        val summary = engine(store, api).run()

        assertTrue(summary.ok)
        assertEquals(1, summary.pulled)  // 未知实体与坏 payload 都跳过
        assertEquals(listOf("page:p1:upsert"), store.appliedKeys)
    }

    // ---------- push ----------

    @Test
    fun push_appliedDeletesOutboxAndRecordsSeq() = runTest {
        val store = FakeStore()
        store.rows += OutboxEntity(
            id = 1, entity = "page", entityId = "p9", op = "upsert",
            payload = """{"page":{"id":"p9","title":"本地"}}""",
            baseSeq = 3, actor = "and-test", createdAt = 1L,
        )
        val api = FakeApi(pushResults = listOf(PushResultDto(entityId = "p9", status = "applied", seq = 10)))
        val summary = engine(store, api).run()

        assertTrue(summary.ok)
        assertEquals(1, summary.pushed)
        assertTrue(store.rows.isEmpty())
        assertEquals(10L, store.seqs["page:p9"])
        // baseSeq 用 outbox 行里存的值，不是最新 seqs
        assertEquals(3L, api.pushedChanges.single().baseSeq)
    }

    @Test
    fun push_conflictSavesCopyAndDeletesOutbox() = runTest {
        val store = FakeStore()
        store.rows += OutboxEntity(
            id = 2, entity = "page", entityId = "p8", op = "upsert",
            payload = """{"page":{"id":"p8","title":"我的版本"}}""",
            baseSeq = 1, actor = "and-test", createdAt = 1L,
        )
        val api = FakeApi(pushResults = listOf(PushResultDto(entityId = "p8", status = "conflict", seq = 42)))
        val summary = engine(store, api).run()

        assertTrue(summary.ok)
        assertEquals(0, summary.pushed)
        assertEquals(1, summary.conflicts)
        assertTrue(store.rows.isEmpty())  // outbox 删了
        assertEquals(1, store.conflicts.size)
        assertEquals(42L, store.conflicts[0].serverSeq)
        assertTrue("冲突副本应存我的版本原文", store.conflicts[0].payload.orEmpty().contains("我的版本"))
        assertNull(store.seqs["page:p8"])  // conflict 不记 seq
    }

    @Test
    fun push_failureKeepsOutboxAndReportsError() = runTest {
        val store = FakeStore()
        store.rows += OutboxEntity(
            id = 1, entity = "page", entityId = "p7", op = "upsert",
            payload = "{}", baseSeq = 0, actor = "and-test", createdAt = 1L,
        )
        val api = FakeApi(pushFails = true)
        val summary = engine(store, api).run()

        assertTrue(!summary.ok)
        assertNotNull(summary.error)
        assertEquals(1, store.rows.size)  // 队列原样，下轮重推
    }

    @Test
    fun pull_networkErrorReturnsErrorSummary() = runTest {
        val store = FakeStore()
        val api = FakeApi(throwOnPull = true)
        val summary = engine(store, api).run()

        assertTrue(!summary.ok)
        assertEquals("network down", summary.error)
    }

    // ---------- coalesce ----------

    @Test
    fun enqueue_coalescesSameEntityIdIntoOneRow() = runTest {
        val store = FakeStore()
        val e = engine(store, FakeApi(pullResponse = PullResponseDto(ok = true, changes = emptyList(), nextSeq = 0)))
        e.enqueueChange("page", "p1", "upsert", """{"page":{"id":"p1","title":"第一版"}}""")
        e.enqueueChange("page", "p1", "upsert", """{"page":{"id":"p1","title":"第二版"}}""")

        assertEquals(1, store.rows.size)
        assertTrue("coalesce 应保留最新 payload", store.rows[0].payload.orEmpty().contains("第二版"))
    }

    @Test
    fun coalesce_keepsExistingIdAndRefreshesContent() {
        val existing = OutboxRowLike(7, "page", "p1", "upsert", "old", baseSeq = 2, actor = "a", createdAt = 1)
        val incoming = OutboxRowLike(0, "page", "p1", "delete", null, baseSeq = 5, actor = "a", createdAt = 2)
        val merged = SyncEngine.coalesce(existing, incoming, nowMs = 99)

        assertEquals(7L, merged.id)          // 保留原行 id（Room 语义）
        assertEquals("delete", merged.op)    // 内容全取 incoming
        assertNull(merged.payload)
        assertEquals(5L, merged.baseSeq)     // baseSeq 取 incoming（enqueue 时按已知 seqs 计算）
        assertEquals(99L, merged.createdAt)
    }
}

// ---------- 顶层辅助（嵌套类不能引用外部类成员，全部提为文件级） ----------

private fun OutboxEntity.toLike() = OutboxRowLike(id, entity, entityId, op, payload, baseSeq, actor, createdAt)

private fun OutboxRowLike.toEntity() = OutboxEntity(
    id = if (id == 0L) 0 else id, entity = entity, entityId = entityId, op = op,
    payload = payload, baseSeq = baseSeq, actor = actor, createdAt = createdAt,
)

private fun incoming(entity: String, entityId: String, op: String, payload: String?, actor: String, nowMs: Long) =
    OutboxRowLike(0, entity, entityId, op, payload, baseSeq = 0, actor = actor, createdAt = nowMs)
