package app.guanfu.shell

import java.io.IOException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL

/**
 * 剪藏接口客户端：POST {baseUrl}/api/clip，Authorization: Bearer <token>，
 * body {"url": ...}。服务端契约见 server/src/clipApi.ts（handleClipRequest）。
 *
 * 网络类异常（超时/连接失败）自动重试 1 次；HTTP 4xx/5xx 是服务端的明确回答，不重试。
 * 只用 HttpURLConnection，不引第三方库，保证 JVM 单测可直接跑。
 */
object ClipClient {

    data class Result(
        val ok: Boolean,
        val httpCode: Int,
        val message: String,
        val clipId: String? = null,
        val retried: Boolean = false,
    )

    fun clip(
        baseUrl: String,
        token: String,
        url: String,
        html: String? = null,
        connectTimeoutMs: Int = 10_000,
        readTimeoutMs: Int = 60_000,
    ): Result {
        var lastError: String? = null
        var retried = false
        for (attempt in 0..1) {
            if (attempt == 1) retried = true
            try {
                return once(baseUrl, token, url, html, connectTimeoutMs, readTimeoutMs).copy(retried = retried)
            } catch (e: SocketTimeoutException) {
                lastError = "请求超时"
            } catch (e: IOException) {
                lastError = e.message ?: "网络错误"
            }
        }
        return Result(false, 0, lastError ?: "网络错误", retried = retried)
    }

    private fun once(
        baseUrl: String,
        token: String,
        url: String,
        html: String?,
        connectTimeoutMs: Int,
        readTimeoutMs: Int,
    ): Result {
        val endpoint = baseUrl.trimEnd('/') + "/api/clip"
        val conn = URL(endpoint).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = connectTimeoutMs
            conn.readTimeout = readTimeoutMs
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.outputStream.use { it.write(clipRequestBody(url, html).toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val body = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.readBytes()?.toString(Charsets.UTF_8) ?: ""
            return parseResult(code, body)
        } finally {
            conn.disconnect()
        }
    }

    /** body 构造独立出来便于单测：url 必带；html 非空时走服务端"客户端提交正文"路（不走抓取管线） */
    fun clipRequestBody(url: String, html: String? = null): String = buildString {
        append("{\"url\":\"")
        append(jsonEscape(url))
        append("\"")
        if (!html.isNullOrBlank()) {
            append(",\"html\":\"")
            append(jsonEscape(html))
            append("\"")
        }
        append("}")
    }

    fun jsonEscape(s: String): String = buildString {
        for (c in s) when (c) {
            '"' -> append("\\\"")
            '\\' -> append("\\\\")
            '\n' -> append("\\n")
            '\r' -> append("\\r")
            '\t' -> append("\\t")
            else -> if (c < ' ') append("\\u%04x".format(c.code)) else append(c)
        }
    }

    /**
     * 响应解析独立出来便于单测。服务端成功返回 {"ok":true,"clip":{...,"id":"..."}}，
     * 失败返回 {"ok":false,"code":"...","error":"..."}。手写最小解析，避免为壳引入 JSON 库。
     */
    fun parseResult(httpCode: Int, body: String): Result {
        val okTrue = body.contains("\"ok\"") && body.contains("\"ok\":true") ||
            body.contains("\"ok\": true")
        val error = extractStringField(body, "error") ?: "HTTP $httpCode"
        val clipId = extractStringField(body, "id")
        return if (okTrue && httpCode in 200..299) {
            Result(true, httpCode, clipId?.let { "已入库 $it" } ?: "已入库", clipId)
        } else {
            Result(false, httpCode, error)
        }
    }

    /** 找 "field":"value"（值不含转义时够用；服务端 error 文案无嵌套引号） */
    fun extractStringField(body: String, field: String): String? {
        val m = Regex("\"$field\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").find(body) ?: return null
        return m.groupValues[1]
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
            .replace("\\n", "\n")
    }
}
