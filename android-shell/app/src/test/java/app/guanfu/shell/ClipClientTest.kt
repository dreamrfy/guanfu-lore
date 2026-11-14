package app.guanfu.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/** ClipClient 的 JVM 集成测试：用裸 ServerSocket 模拟剪藏接口（android.jar 无 com.sun.httpserver） */
class ClipClientTest {

    /** 极简 HTTP 服务：每连接一个线程，读头 + 按 Content-Length 读体，回固定响应 */
    private class MiniHttp(private val responder: (auth: String?, body: String) -> Pair<Int, String>) {
        private val server = ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"))
        private val pool = Executors.newCachedThreadPool()
        @Volatile var requestCount = 0
            private set

        val port: Int get() = server.localPort

        init {
            pool.execute {
                while (!server.isClosed) {
                    try {
                        val sock = server.accept()
                        pool.execute { handle(sock) }
                    } catch (e: Exception) {
                        if (server.isClosed) return@execute
                    }
                }
            }
        }

        private fun handle(sock: Socket) {
            try {
                sock.use { s ->
                    val reader = BufferedReader(InputStreamReader(s.getInputStream(), Charsets.UTF_8))
                    var auth: String? = null
                    var contentLength = 0
                    while (true) {
                        val line = reader.readLine() ?: return
                        if (line.isEmpty()) break
                        if (line.startsWith("Authorization:", ignoreCase = true)) auth = line.substringAfter(':').trim()
                        if (line.startsWith("Content-Length:", ignoreCase = true)) contentLength = line.substringAfter(':').trim().toInt()
                    }
                    val body = CharArray(contentLength).let { buf ->
                        var read = 0
                        while (read < contentLength) {
                            val n = reader.read(buf, read, contentLength - read)
                            if (n < 0) break
                            read += n
                        }
                        String(buf, 0, read)
                    }
                    requestCount++
                    val (code, payload) = responder(auth, body)
                    val bytes = payload.toByteArray(Charsets.UTF_8)
                    s.getOutputStream().write(
                        ("HTTP/1.1 $code OK\r\nContent-Type: application/json\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n").toByteArray()
                    )
                    s.getOutputStream().write(bytes)
                    s.getOutputStream().flush()
                }
            } catch (e: Exception) {
                /* 客户端断开等，忽略 */
            }
        }

        fun close() {
            server.close()
            pool.shutdownNow()
        }
    }

    private fun withServer(handler: (auth: String?, body: String) -> Pair<Int, String>, block: (String) -> Unit) {
        val server = MiniHttp(handler)
        try {
            block("http://127.0.0.1:${server.port}")
        } finally {
            server.close()
        }
    }

    @Test
    fun `sends bearer token and json body and parses success`() = withServer({ auth, body ->
        if (auth == "Bearer good-token" && body == "{\"url\":\"https://example.com\"}")
            200 to "{\"ok\":true,\"clip\":{\"id\":\"abc123\",\"title\":\"Example\"}}"
        else 400 to "{\"ok\":false,\"code\":\"bad\",\"error\":\"校验失败\"}"
    }) { base ->
        val r = ClipClient.clip(base, "good-token", "https://example.com")
        assertTrue("应成功: $r", r.ok)
        assertEquals(200, r.httpCode)
        assertEquals("abc123", r.clipId)
        assertFalse(r.retried)
    }

    @Test
    fun `http 401 is definitive and not retried`() = withServer({ _, _ ->
        401 to "{\"ok\":false,\"code\":\"unauthorized\",\"error\":\"缺少或错误的访问 Token\"}"
    }) { base ->
        val r = ClipClient.clip(base, "wrong", "https://example.com")
        assertFalse(r.ok)
        assertEquals(401, r.httpCode)
        assertTrue(r.message.contains("Token"))
        assertFalse(r.retried)
    }

    @Test
    fun `timeout retries once then succeeds`() {
        // 第一次响应慢于客户端读超时 → ClipClient 应重试并拿到成功结果
        val calls = AtomicInteger()
        val slow = MiniHttp { _, _ ->
            if (calls.incrementAndGet() == 1) Thread.sleep(3000)
            200 to "{\"ok\":true,\"clip\":{\"id\":\"retry-ok\"}}"
        }
        try {
            val r = ClipClient.clip(
                "http://127.0.0.1:${slow.port}", "t", "https://example.com",
                connectTimeoutMs = 2000, readTimeoutMs = 1500,
            )
            assertTrue("重试后应成功: $r", r.ok)
            assertEquals("retry-ok", r.clipId)
            assertTrue("应标记重试", r.retried)
        } finally {
            slow.close()
        }
    }

    @Test
    fun `connection refused returns failure with retry mark`() {
        val r = ClipClient.clip("http://127.0.0.1:1", "t", "https://example.com", connectTimeoutMs = 1000)
        assertFalse(r.ok)
        assertTrue(r.retried)
    }

    @Test
    fun `json escape and request body`() {
        assertEquals("a\\\"b\\\\c\\nd", ClipClient.jsonEscape("a\"b\\c\nd"))
        assertEquals("{\"url\":\"https://a.com/x?y=1&z=中文\"}", ClipClient.clipRequestBody("https://a.com/x?y=1&z=中文"))
    }

    @Test
    fun `parse result variants`() {
        val ok = ClipClient.parseResult(200, "{\"ok\":true,\"clip\":{\"id\":\"c1\"}}")
        assertTrue(ok.ok); assertEquals("c1", ok.clipId)
        val err = ClipClient.parseResult(500, "{\"ok\":false,\"code\":\"internal\",\"error\":\"服务内部错误\"}")
        assertFalse(err.ok); assertEquals("服务内部错误", err.message)
        val garbage = ClipClient.parseResult(502, "<html>Bad Gateway</html>")
        assertFalse(garbage.ok)
    }
}
