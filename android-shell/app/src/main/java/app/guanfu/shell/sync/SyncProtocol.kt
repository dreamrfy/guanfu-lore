package app.guanfu.shell.sync

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * 同步协议 DTO（A03，复刻 web sync.ts 的 RemoteChange/PushResult/SyncSummary）。
 *
 * 形态差异说明：pull 回来的 payload 是 JSON 串（服务端存的），push 发出去的
 * payload 是真 JSON 值（web 端 outbox 存对象、buildPushPayload 透传）——
 * 所以 pull 侧用 String? 接、parse 成 JsonObject 再写库；push 侧用 JsonElement
 * 嵌进请求体，避免二次转义。
 */

@Serializable
data class RemoteChangeDto(
    @SerialName("seq") val seq: Long = 0,
    @SerialName("entity") val entity: String = "",
    @SerialName("entityId") val entityId: String = "",
    /** upsert | delete */
    @SerialName("op") val op: String = "",
    /** JSON 串（delete 时 null） */
    @SerialName("payload") val payload: String? = null,
    @SerialName("actor") val actor: String = "",
    @SerialName("baseSeq") val baseSeq: Long = 0,
    @SerialName("createdAt") val createdAt: Long = 0,
)

@Serializable
data class PullResponseDto(
    @SerialName("ok") val ok: Boolean = false,
    @SerialName("changes") val changes: List<RemoteChangeDto> = emptyList(),
    @SerialName("nextSeq") val nextSeq: Long = 0,
    @SerialName("error") val error: String? = null,
)

@Serializable
data class PushChangeDto(
    @SerialName("entity") val entity: String,
    @SerialName("entityId") val entityId: String,
    @SerialName("op") val op: String,
    /** 真 JSON 值（不是字符串）；delete 时 null */
    @SerialName("payload") val payload: JsonElement? = null,
    @SerialName("baseSeq") val baseSeq: Long,
    @SerialName("actor") val actor: String,
)

@Serializable
data class PushResultDto(
    @SerialName("entityId") val entityId: String = "",
    /** applied | conflict */
    @SerialName("status") val status: String = "",
    @SerialName("seq") val seq: Long = 0,
)

@Serializable
data class PushResponseDto(
    @SerialName("ok") val ok: Boolean = false,
    @SerialName("results") val results: List<PushResultDto> = emptyList(),
    @SerialName("nextSeq") val nextSeq: Long = 0,
    @SerialName("error") val error: String? = null,
)

/** 一次同步的总结（复刻 web SyncSummary；附件计数 A11 接手后补上） */
data class SyncSummary(
    var ok: Boolean = false,
    var pulled: Int = 0,
    var pushed: Int = 0,
    var conflicts: Int = 0,
    var error: String? = null,
)

/** 同步实体白名单（web SyncEntity 同语义；超出者 parse 阶段直接跳过） */
val SYNC_ENTITIES = setOf("page", "collection", "record")
val SYNC_OPS = setOf("upsert", "delete")
