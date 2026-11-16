package app.guanfu.shell.sync

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/**
 * 同步 HTTP 层（架构 §3/§5）：与剪藏同一服务、同一 Bearer Token（web sync.ts 头注同语义）。
 *
 * 接口抽象只为 JVM 单测可注入 FakeApi；实现走 OkHttp（A02 既有依赖）。
 * 网络统一 Dispatchers.IO（A02 的 NetworkOnMainThreadException 教训）。
 */
interface SyncApi {
    suspend fun pull(since: Long, limit: Int = 500): PullResponseDto
    suspend fun push(changes: List<PushChangeDto>): PushResponseDto
}

class HttpSyncApi(
    private val baseUrlProvider: suspend () -> String,
    private val tokenProvider: suspend () -> String,
    private val client: OkHttpClient = OkHttpClient(),
) : SyncApi {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = true
    }

    override suspend fun pull(since: Long, limit: Int): PullResponseDto = withContext(Dispatchers.IO) {
        val body = buildJsonObject {
            put("since", since)
            put("limit", limit)
        }.toString().toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("${baseUrlProvider().trimEnd('/')}/api/sync/pull")
            .header("Authorization", "Bearer ${tokenProvider()}")
            .post(body)
            .build()
        execute(request) { json.decodeFromString(PullResponseDto.serializer(), it) }
    }

    override suspend fun push(changes: List<PushChangeDto>): PushResponseDto = withContext(Dispatchers.IO) {
        val body = buildJsonObject {
            put("changes", json.encodeToJsonElement(kotlinx.serialization.builtins.ListSerializer(PushChangeDto.serializer()), changes))
        }.toString().toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("${baseUrlProvider().trimEnd('/')}/api/sync/push")
            .header("Authorization", "Bearer ${tokenProvider()}")
            .post(body)
            .build()
        execute(request) { json.decodeFromString(PushResponseDto.serializer(), it) }
    }

    private fun <T> execute(request: Request, parse: (String) -> T): T {
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("HTTP ${response.code}: ${text.take(200)}")
            return parse(text)
        }
    }
}
