package app.guanfu.shell.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Room 表模型（A03，架构 §2）：web Dexie 表（db.ts）的 1:1 复刻。
 *
 * 原则：JSON 载荷原样存（TEXT），Android 不做格式转换——BlockNote 块、
 * 集合字段定义、记录 values 都是 web 端说了算的结构，安卓只读解析。
 * 可空列的语义与 web 可选字段一致（老数据没有 → null → 读侧兜底）。
 */

@Entity(tableName = "pages")
data class PageEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "parentId") val parentId: String?,
    val title: String,
    val icon: String?,
    @ColumnInfo(name = "coverAssetId") val coverAssetId: String?,
    @ColumnInfo(name = "createdAt") val createdAt: Long,
    @ColumnInfo(name = "updatedAt") val updatedAt: Long,
    /** 软删时间戳；非 null = 在回收站里 */
    @ColumnInfo(name = "deletedAt") val deletedAt: Long?,
    /** 同级排序（web 教训：排序字段必须建索引） */
    @ColumnInfo(name = "sortKey") val sortKey: Double,
    /** 页面标签，JSON 数组串；老数据没有 → null → 读侧当空数组 */
    @ColumnInfo(name = "tags") val tags: String?,
)

@Entity(tableName = "docs")
data class DocEntity(
    /** 页面 id：与 pages 1:1，正文单独存——列表查询不必拖着正文 */
    @PrimaryKey val pageId: String,
    /** BlockNote 块数组，JSON 串 */
    @ColumnInfo(name = "blocks") val blocks: String,
    @ColumnInfo(name = "updatedAt") val updatedAt: Long,
)

@Entity(tableName = "collections")
data class CollectionEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "name") val name: String,
    @ColumnInfo(name = "icon") val icon: String?,
    /** 字段顺序 = 列顺序，JSON 串（结构 web 端说了算） */
    @ColumnInfo(name = "fields") val fields: String,
    @ColumnInfo(name = "views") val views: String,
    @ColumnInfo(name = "createdAt") val createdAt: Long,
    @ColumnInfo(name = "updatedAt") val updatedAt: Long,
)

@Entity(tableName = "records")
data class RecordEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "collectionId") val collectionId: String,
    /** fieldId → 值，JSON 串 */
    @ColumnInfo(name = "values") val values: String,
    /** 记录正文（BlockNote 块数组），JSON 串；可选 */
    @ColumnInfo(name = "doc") val doc: String?,
    /** 想法区（剪藏记录专用批注），JSON 串；可选 */
    @ColumnInfo(name = "thoughts") val thoughts: String?,
    /** 剪藏记录的「原文离线快照」附件 id */
    @ColumnInfo(name = "snapshotAssetId") val snapshotAssetId: String?,
    @ColumnInfo(name = "createdAt") val createdAt: Long,
    @ColumnInfo(name = "updatedAt") val updatedAt: Long,
)

@Entity(tableName = "assets")
data class AssetEntity(
    @PrimaryKey val id: String,
    /** 归属页面（可为空：剪藏附件可能先入库再挂页面） */
    @ColumnInfo(name = "pageId") val pageId: String?,
    /** 用途：cover / image / file / clip … */
    @ColumnInfo(name = "kind") val kind: String,
    @ColumnInfo(name = "mime") val mime: String,
    @ColumnInfo(name = "size") val size: Long,
    @ColumnInfo(name = "data") val data: ByteArray,
    @ColumnInfo(name = "createdAt") val createdAt: Long,
)

/** 同步层：一条待推送的本地改动（复刻 OutboxRow） */
@Entity(
    tableName = "outbox",
    indices = [Index(value = ["entity", "entityId"], unique = true)],
)
data class OutboxEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    /** page / collection / record */
    @ColumnInfo(name = "entity") val entity: String,
    @ColumnInfo(name = "entityId") val entityId: String,
    /** upsert | delete */
    @ColumnInfo(name = "op") val op: String,
    /** 改动后的内容，JSON 串（delete 时为 null） */
    @ColumnInfo(name = "payload") val payload: String?,
    /** 改这个时客户端看到的服务器版本号（乐观锁） */
    @ColumnInfo(name = "baseSeq") val baseSeq: Long,
    @ColumnInfo(name = "actor") val actor: String,
    @ColumnInfo(name = "createdAt") val createdAt: Long,
)

/** 同步层：本地保存的冲突副本（复刻 SyncConflictRow） */
@Entity(tableName = "sync_conflicts")
data class SyncConflictEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "entity") val entity: String,
    @ColumnInfo(name = "entityId") val entityId: String,
    /** 我这边的版本，JSON 串 */
    @ColumnInfo(name = "payload") val payload: String?,
    /** 服务器当时的版本号 */
    @ColumnInfo(name = "serverSeq") val serverSeq: Long,
    @ColumnInfo(name = "createdAt") val createdAt: Long,
)

/** 键值表（web meta 表）：游标 syncCursor、seqs、AI 配置等 */
@Entity(tableName = "key_values")
data class KeyValueEntity(
    @PrimaryKey val key: String,
    @ColumnInfo(name = "value") val value: String,
)
