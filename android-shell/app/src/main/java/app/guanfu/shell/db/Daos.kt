package app.guanfu.shell.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert

/**
 * DAO 语义对齐 web repo（db.ts 的 repo 对象）：
 * listOutbox/putOutbox/deleteOutbox、listPages（按 sortKey 排序）等。
 * 排序字段建索引的原则见 db.ts v2 迁移注释（A01 §2 沿用）。
 */

@Dao
interface PageDao {
    @Upsert
    suspend fun upsert(page: PageEntity)

    @Query("SELECT * FROM pages ORDER BY sortKey")
    suspend fun listAll(): List<PageEntity>

    @Query("SELECT * FROM pages WHERE id = :id")
    suspend fun byId(id: String): PageEntity?

    @Query("SELECT count(*) FROM pages")
    suspend fun count(): Int
}

@Dao
interface DocDao {
    @Upsert
    suspend fun upsert(doc: DocEntity)

    @Query("SELECT * FROM docs WHERE pageId = :pageId")
    suspend fun byPageId(pageId: String): DocEntity?

    @Query("DELETE FROM docs WHERE pageId = :pageId")
    suspend fun deleteByPageId(pageId: String)
}

@Dao
interface CollectionDao {
    @Upsert
    suspend fun upsert(collection: CollectionEntity)

    @Query("SELECT * FROM collections ORDER BY createdAt")
    suspend fun listAll(): List<CollectionEntity>

    @Query("SELECT * FROM collections WHERE id = :id")
    suspend fun byId(id: String): CollectionEntity?

    @Query("DELETE FROM collections WHERE id = :id")
    suspend fun deleteById(id: String)
}

@Dao
interface RecordDao {
    @Upsert
    suspend fun upsert(record: RecordEntity)

    @Query("SELECT * FROM records WHERE collectionId = :collectionId ORDER BY createdAt")
    suspend fun listByCollection(collectionId: String): List<RecordEntity>

    @Query("SELECT * FROM records WHERE id = :id")
    suspend fun byId(id: String): RecordEntity?

    @Query("DELETE FROM records WHERE id = :id")
    suspend fun deleteById(id: String)
}

@Dao
interface AssetDao {
    @Upsert
    suspend fun upsert(asset: AssetEntity)

    @Query("SELECT * FROM assets WHERE id = :id")
    suspend fun byId(id: String): AssetEntity?
}

@Dao
interface OutboxDao {
    @Query("SELECT * FROM outbox ORDER BY id")
    suspend fun listOutbox(): List<OutboxEntity>

    @Query("SELECT * FROM outbox WHERE entity = :entity AND entityId = :entityId LIMIT 1")
    suspend fun byKey(entity: String, entityId: String): OutboxEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(row: OutboxEntity): Long

    /** coalesce 更新：保留原 id（对齐 web coalesceOutbox 语义），只刷新内容字段 */
    @Query(
        "UPDATE outbox SET op = :op, payload = :payload, baseSeq = :baseSeq, createdAt = :createdAt " +
            "WHERE entity = :entity AND entityId = :entityId",
    )
    suspend fun updateContent(entity: String, entityId: String, op: String, payload: String?, baseSeq: Long, createdAt: Long)

    @Query("DELETE FROM outbox WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<Long>)

    @Query("SELECT count(*) FROM outbox")
    suspend fun count(): Int
}

@Dao
interface SyncConflictDao {
    @Insert
    suspend fun insert(conflict: SyncConflictEntity): Long

    @Query("SELECT * FROM sync_conflicts ORDER BY id DESC")
    suspend fun listAll(): List<SyncConflictEntity>

    @Query("SELECT count(*) FROM sync_conflicts")
    suspend fun count(): Int
}

@Dao
interface KeyValueDao {
    @Query("SELECT value FROM key_values WHERE `key` = :key")
    suspend fun get(key: String): String?

    @Upsert
    suspend fun put(entry: KeyValueEntity)
}
